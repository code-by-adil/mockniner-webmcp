import { describe, expect, it, vi } from "vitest";
import { writingDocument } from "@/content/writing";
import type { WritingEvaluation, WritingSubmission } from "@/domain/types";
import { createWritingToolDefinitions } from "./writingTools";

const attemptId = "22222222-2222-4222-8222-222222222222";
const submission: WritingSubmission = {
  attemptId,
  contentKey: "local-writing-v1",
  tasks: [
    { task: writingDocument.tasks[0], response: "Task one answer.", wordCount: 3 },
    { task: writingDocument.tasks[1], response: "Task two answer.", wordCount: 3 },
  ],
  startedAt: "2026-08-31T10:00:00.000Z",
  submittedAt: "2026-08-31T11:00:00.000Z",
};

const taskEvaluation = {
  band: 7,
  taskAchievement: 7,
  coherenceCohesion: 7,
  lexicalResource: 7,
  grammaticalRange: 6.5,
  feedback: "Clear and relevant.",
  annotations: [],
};

const evaluationInput = {
  attemptId,
  overallBand: 7,
  summary: "A competent response.",
  task1: taskEvaluation,
  task2: taskEvaluation,
};

function toolOptions() {
  return { signal: new AbortController().signal };
}

describe("Writing WebMCP tools", () => {
  it("registers only the tools relevant to the visible Writing surface", () => {
    const dependencies = {
      readWritingAttempt: vi.fn(),
      attachWritingEvaluation: vi.fn(),
      getCurrentWritingAttemptId: () => undefined,
    };
    expect(createWritingToolDefinitions(dependencies, "results").map((tool) => tool.name)).toEqual([
      "get_ielts_writing_submission",
    ]);
    expect(
      createWritingToolDefinitions(dependencies, "evaluation").map((tool) => tool.name),
    ).toEqual(["get_ielts_writing_submission", "attach_ielts_writing_evaluation"]);
    expect(createWritingToolDefinitions(dependencies, "none")).toEqual([]);
  });

  it("returns the immutable submission and evaluation status", async () => {
    const tools = createWritingToolDefinitions({
      readWritingAttempt: async () => ({ submission, evaluation: null }),
      attachWritingEvaluation: vi.fn(),
      getCurrentWritingAttemptId: () => attemptId,
    });
    const tool = tools.find((item) => item.name === "get_ielts_writing_submission")!;

    const result = await tool.execute({}, toolOptions());

    const parsed = result as {
      ok: true;
      data: {
        submission: WritingSubmission;
        evaluationStatus: string;
        canAttachEvaluation: boolean;
      };
    };
    expect(parsed.data.submission.attemptId).toBe(attemptId);
    expect(parsed.data.submission.tasks[0].response).toBe("Task one answer.");
    expect(parsed.data.evaluationStatus).toBe("awaiting_evaluation");
    expect(parsed.data.canAttachEvaluation).toBe(true);
    expect(tool.annotations).toMatchObject({ readOnlyHint: true, untrustedContentHint: true });
  });

  it("validates and attaches a structured evaluation", async () => {
    const attached: WritingEvaluation = {
      ...evaluationInput,
      evaluatedAt: "2026-08-31T11:05:00.000Z",
    };
    const attachWritingEvaluation = vi.fn(async () => attached);
    const tools = createWritingToolDefinitions({
      readWritingAttempt: async () => ({ submission, evaluation: null }),
      attachWritingEvaluation,
      getCurrentWritingAttemptId: () => attemptId,
    });
    const tool = tools.find((item) => item.name === "attach_ielts_writing_evaluation")!;

    const result = await tool.execute(evaluationInput, toolOptions());

    expect(attachWritingEvaluation).toHaveBeenCalledWith(evaluationInput);
    expect(result).toMatchObject({
      ok: true,
      data: { status: "attached", attemptId },
      sideEffect: { visibleView: "writing_review" },
    });
  });

  it("rejects non-IELTS band increments with an actionable path", async () => {
    const tools = createWritingToolDefinitions({
      readWritingAttempt: async () => ({ submission, evaluation: null }),
      attachWritingEvaluation: vi.fn(),
      getCurrentWritingAttemptId: () => attemptId,
    });
    const tool = tools.find((item) => item.name === "attach_ielts_writing_evaluation")!;

    await expect(
      tool.execute({ ...evaluationInput, overallBand: 7.3 }, toolOptions()),
    ).resolves.toMatchObject({
      ok: false,
      error: {
        code: "INVALID_EVALUATION",
        issues: [{ path: "overallBand" }],
      },
    });
  });

  it("rejects corrections that do not quote the immutable submission", async () => {
    const attachWritingEvaluation = vi.fn();
    const tools = createWritingToolDefinitions({
      readWritingAttempt: async () => ({ submission, evaluation: null }),
      attachWritingEvaluation,
      getCurrentWritingAttemptId: () => attemptId,
    });
    const tool = tools.find((item) => item.name === "attach_ielts_writing_evaluation")!;

    await expect(
      tool.execute(
        {
          ...evaluationInput,
          task1: {
            ...taskEvaluation,
            annotations: [
              {
                id: "invented-quote",
                taskNumber: 1,
                originalText: "Words the learner never wrote.",
                suggestion: "A valid replacement.",
                explanation: "This should not be attachable.",
                type: "grammar",
              },
            ],
          },
        },
        toolOptions(),
      ),
    ).resolves.toMatchObject({
      ok: false,
      error: {
        code: "INVALID_ANNOTATION",
        retryable: true,
        issues: [{ path: "task1.annotations.0.originalText" }],
      },
    });
    expect(attachWritingEvaluation).not.toHaveBeenCalled();
  });

  it("requires annotation task identity and offsets to agree with the quote", async () => {
    const attachWritingEvaluation = vi.fn();
    const tools = createWritingToolDefinitions({
      readWritingAttempt: async () => ({ submission, evaluation: null }),
      attachWritingEvaluation,
      getCurrentWritingAttemptId: () => attemptId,
    });
    const tool = tools.find((item) => item.name === "attach_ielts_writing_evaluation")!;

    const result = (await tool.execute(
      {
        ...evaluationInput,
        task1: {
          ...taskEvaluation,
          annotations: [
            {
              id: "wrong-location",
              taskNumber: 2,
              originalText: "Task one answer.",
              suggestion: "A replacement.",
              explanation: "The task and range must be trustworthy.",
              type: "coherence",
              startOffset: 1,
              endOffset: 17,
            },
          ],
        },
      },
      toolOptions(),
    )) as { ok: false; error: { issues: Array<{ path: string }> } };

    expect(result.ok).toBe(false);
    expect(result.error.issues.map((issue) => issue.path)).toEqual([
      "task1.annotations.0.taskNumber",
      "task1.annotations.0.originalText",
    ]);
    expect(attachWritingEvaluation).not.toHaveBeenCalled();
  });

  it("does not silently replace an existing evaluation", async () => {
    const existing: WritingEvaluation = {
      ...evaluationInput,
      evaluatedAt: "2026-08-31T11:05:00.000Z",
    };
    const attachWritingEvaluation = vi.fn();
    const tools = createWritingToolDefinitions({
      readWritingAttempt: async () => ({ submission, evaluation: existing }),
      attachWritingEvaluation,
      getCurrentWritingAttemptId: () => attemptId,
    });
    const tool = tools.find((item) => item.name === "attach_ielts_writing_evaluation")!;

    await expect(tool.execute(evaluationInput, toolOptions())).resolves.toMatchObject({
      ok: false,
      error: { code: "EVALUATION_EXISTS", retryable: false },
    });
    expect(attachWritingEvaluation).not.toHaveBeenCalled();
  });
});
