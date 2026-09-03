import { defaultSpeakingPlan } from '@/domain/speakingPlan';
import { ApplicationError } from "@/domain/errors";
import { describe, expect, it, vi } from "vitest";
import type { SpeakingEvaluation, SpeakingSubmission } from "@/domain/types";
import {
  createSpeakingInterviewToolDefinition,
  createSpeakingToolDefinitions,
} from "./speakingTools";

const attemptId = "33333333-3333-4333-8333-333333333333";
const submission: SpeakingSubmission = {
  attemptId,
  contentKey: "agent-speaking-interview-v1",
  responses: [
    {
      recordingId: "recording-1",
      status: 'answered' as const, promptId: 1,
      partLabel: "Part 1",
      sequence: 0,
      promptText: "Tell me about your hometown.",
      timeLimitSeconds: 45,
      durationMs: 21_000,
      transcript: "My hometown is a busy coastal city.",
    },
  ],
  startedAt: "2026-08-31T10:00:00.000Z",
  submittedAt: "2026-08-31T10:05:00.000Z",
};

const evaluationInput = {
  attemptId,
  overallBand: 6.5,
  fluencyCoherence: 6.5,
  lexicalResource: 6.5,
  grammaticalRangeAccuracy: 6,
  summary: "The answer is direct, clear, and generally well controlled.",
  strengths: ["The response answers the question directly."],
  improvements: ["Develop ideas with a more specific example."],
} as const;

function toolOptions() {
  return { signal: new AbortController().signal };
}

function createTools(
  evaluation: SpeakingEvaluation | null = null,
  attachSpeakingEvaluation = vi.fn(),
) {
  return createSpeakingToolDefinitions(
    {
      readSpeakingAttempt: async () => ({ submission, evaluation }),
      attachSpeakingEvaluation,
      getCurrentSpeakingAttemptId: () => attemptId,
    },
  );
}

describe("Speaking WebMCP tools", () => {
  it('attaches and reads insufficient evidence as a terminal feedback outcome without scores', async () => {
    const feedback = { attemptId, status: 'insufficient_evidence' as const, reason: 'The transcript is too short to support a band.', summary: 'Record a fuller interview.', strengths: [], improvements: ['Develop several answers.'] }
    const evaluation = { ...feedback, evaluatedAt: '2026-09-03T10:00:00Z' }
    const attach = vi.fn(async () => evaluation)
    const tool = createTools(null, attach).find(t => t.name === 'attach_ielts_speaking_evaluation')!
    const result = await tool.execute(feedback, toolOptions())
    expect(result).toMatchObject({ ok: true, data: { evaluationStatus: 'insufficient_evidence' } })
    expect(result).not.toHaveProperty('data.overallBand')
    const reader = createTools(evaluation).find(t => t.name === 'get_ielts_speaking_submission')!
    expect(await reader.execute({}, toolOptions())).toMatchObject({ ok: true, data: { evaluationStatus: 'insufficient_evidence', canAttachEvaluation: false, evaluation } })
  })
  it("defines the fixed Speaking review tool group", () => {
    const dependencies = {
      readSpeakingAttempt: vi.fn(),
      attachSpeakingEvaluation: vi.fn(),
      getCurrentSpeakingAttemptId: () => undefined,
    };
    expect(
      createSpeakingInterviewToolDefinition(vi.fn()).name,
    ).toBe("set_ielts_speaking_interview");
    expect(
      createSpeakingToolDefinitions(dependencies).map((tool) => tool.name),
    ).toEqual(["get_ielts_speaking_submission", "attach_ielts_speaking_evaluation"]);
  });

  it("installs all questions at once without starting the microphone", async () => {
    const configure = vi.fn(() => ({ status: 'ready' }));
    const tool = createSpeakingInterviewToolDefinition(configure);
    await expect(tool.execute(defaultSpeakingPlan, toolOptions())).resolves.toMatchObject({
      ok: true, data: { status: 'ready' }, sideEffect: { visibleView: 'speaking_setup' },
    });
    expect(configure).toHaveBeenCalledWith(defaultSpeakingPlan);
    await expect(tool.execute({ ...defaultSpeakingPlan, questions: [] }, toolOptions())).resolves.toMatchObject({
      ok: false, error: { code: 'INVALID_SPEAKING_PLAN' },
    });
    expect(configure).toHaveBeenCalledOnce();
  });

  it("returns transcript evidence without exposing local audio", async () => {
    const tool = createTools().find((item) => item.name === "get_ielts_speaking_submission")!;
    const result = (await tool.execute({}, toolOptions())) as {
      ok: true;
      data: { submission: SpeakingSubmission; scoringScope: { excluded: string[] }; evaluationGuidance: string[] };
    };

    expect(result.data.submission.responses[0]?.transcript).toContain("coastal city");
    expect(result.data.scoringScope.excluded).toContain(
      "pronunciation: audio is not exposed to the agent",
    );
    expect(result.data.submission.responses[0]).not.toHaveProperty("audio");
    expect(result.data.evaluationGuidance.join(' ')).toContain('Read the complete transcript');
    expect(result.data.evaluationGuidance.join(' ')).toContain('Text does not establish pronunciation or spoken delivery');
    expect(result.data.evaluationGuidance.join(' ')).toContain('blank or skipped answers as missing evidence');
    expect(result.data.evaluationGuidance.join(' ')).toContain('likely transcription errors');
    expect(result.data.evaluationGuidance.join(' ')).toContain('status insufficient_evidence');
    expect(result.data.evaluationGuidance.join(' ')).toContain("this submission's attemptId");
  });

  it("attaches a valid transcript evaluation without accepting pronunciation scoring", async () => {
    const attached: SpeakingEvaluation = {
      ...evaluationInput,
      strengths: [...evaluationInput.strengths],
      improvements: [...evaluationInput.improvements],
      evaluatedAt: "2026-08-31T10:06:00.000Z",
    };
    const attach = vi.fn(async () => attached);
    const tool = createTools(null, attach).find(
      (item) => item.name === "attach_ielts_speaking_evaluation",
    )!;

    await expect(tool.execute(evaluationInput, toolOptions())).resolves.toMatchObject({
      ok: true,
      data: { attemptId, overallBand: 6.5 },
      sideEffect: { visibleView: "speaking_review" },
    });
    expect(attach).toHaveBeenCalledWith(evaluationInput);

    await expect(
      tool.execute({ ...evaluationInput, pronunciation: 6.5 }, toolOptions()),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "INVALID_EVALUATION", issues: [{ path: "input" }] },
    });
  });

  it("does not replace an existing Speaking evaluation", async () => {
    const existing: SpeakingEvaluation = {
      ...evaluationInput,
      strengths: [...evaluationInput.strengths],
      improvements: [...evaluationInput.improvements],
      evaluatedAt: "2026-08-31T10:06:00.000Z",
    };
    const attach = vi.fn(async () => { throw new ApplicationError("EVALUATION_EXISTS", "This attempt already has an evaluation."); });
    const tool = createTools(existing, attach).find(
      (item) => item.name === "attach_ielts_speaking_evaluation",
    )!;

    await expect(tool.execute(evaluationInput, toolOptions())).resolves.toMatchObject({
      ok: false,
      error: { code: "EVALUATION_EXISTS", retryable: false },
    });
    expect(attach).toHaveBeenCalledOnce();
  });
});
