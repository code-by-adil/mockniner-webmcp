import { describe, expect, it } from "vitest";
import { writingDocument } from "@/content/writing";
import type { WritingEvaluation, WritingSubmission } from "./types";
import { resolveWritingEvaluation } from "./writingAnnotations";

const submission: WritingSubmission = {
  attemptId: "22222222-2222-4222-8222-222222222222",
  contentKey: writingDocument.contentKey,
  tasks: [
    { task: writingDocument.tasks[0], response: "bad then bad", wordCount: 3 },
    { task: writingDocument.tasks[1], response: "An essay.", wordCount: 2 },
  ],
  startedAt: "2026-09-02T10:00:00.000Z",
  submittedAt: "2026-09-02T11:00:00.000Z",
};
const task = {
  band: 7,
  taskAchievement: 7,
  coherenceCohesion: 7,
  lexicalResource: 7,
  grammaticalRange: 7,
  feedback: "Clear.",
  annotations: [],
};
const evaluation: WritingEvaluation = {
  attemptId: submission.attemptId,
  overallBand: 7,
  summary: "Clear.",
  task1: task,
  task2: task,
  evaluatedAt: submission.submittedAt,
};
const annotation = {
  id: "one",
  taskNumber: 1 as const,
  originalText: "bad",
  suggestion: "poor",
  explanation: "Use a precise adjective.",
  type: "vocabulary" as const,
};

describe("writing evaluation boundary", () => {
  it("retains distinct feedback for the same quote at separate offsets", () => {
    const input = {
      ...evaluation,
      task1: {
        ...task,
        annotations: [
          { ...annotation, startOffset: 0, endOffset: 3 },
          { ...annotation, id: "two", startOffset: 9, endOffset: 12 },
        ],
      },
    };
    expect(resolveWritingEvaluation(submission, input, true)).toEqual(input);
  });
  it("rejects ambiguous new feedback but preserves it when reading legacy feedback", () => {
    const input = {
      ...evaluation,
      task1: { ...task, annotations: [annotation] },
    };
    expect(() => resolveWritingEvaluation(submission, input, true)).toThrow(
      expect.objectContaining({ code: "INVALID_ANNOTATION" }),
    );
    expect(resolveWritingEvaluation(submission, input)).toEqual(input);
  });
  it("rejects mismatched task identities and duplicate annotation IDs", () => {
    const issue = {
      ...annotation,
      taskNumber: 2 as const,
      startOffset: 0,
      endOffset: 3,
    };
    expect(() =>
      resolveWritingEvaluation(
        submission,
        { ...evaluation, task1: { ...task, annotations: [issue] } },
        true,
      ),
    ).toThrow();
    const repeated = { ...annotation, startOffset: 0, endOffset: 3 };
    expect(() =>
      resolveWritingEvaluation(
        submission,
        {
          ...evaluation,
          task1: { ...task, annotations: [repeated, repeated] },
        },
        true,
      ),
    ).toThrow();
  });
});
