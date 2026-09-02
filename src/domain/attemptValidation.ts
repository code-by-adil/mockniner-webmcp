import { z } from "zod";
import type {
  AnswerMap,
  ObjectiveResult,
  ObjectiveSubmission,
  SpeakingEvaluation,
  SpeakingSubmission,
  WritingEvaluation,
  WritingSubmission,
} from "./types";
import { writingEvaluationInputSchema } from "./writingEvaluation";
import { scoredSpeakingEvaluationSchema, unscoredSpeakingEvaluationSchema } from "./speakingEvaluation";
import { writingTask1Schema, writingTask2Schema } from "./writingContent";

const timestampSchema = z.iso.datetime({ offset: true });
const bandScoreSchema = z
  .number()
  .min(0)
  .max(9)
  .refine((value) => Number.isInteger(value * 2));

export const answerMapSchema: z.ZodType<AnswerMap> = z.record(
  z.string().regex(/^(?:[1-9]|[1-3][0-9]|40)$/),
  z.string(),
);

const objectiveResultSchema: z.ZodType<ObjectiveResult> = z
  .strictObject({
    section: z.enum(["listening", "reading"]),
    raw: z.number().int().min(0).max(40),
    total: z.literal(40),
    band: bandScoreSchema,
    answered: z.number().int().min(0).max(40),
    correctQuestionIds: z.array(z.number().int().min(1).max(40)).max(40),
  })
  .refine(
    (result) =>
      result.raw === result.correctQuestionIds.length &&
      result.raw <= result.answered &&
      new Set(result.correctQuestionIds).size === result.correctQuestionIds.length,
    { message: "The stored objective score details are inconsistent." },
  );

export const objectiveSubmissionSchema: z.ZodType<ObjectiveSubmission> =
  z
    .strictObject({
      attemptId: z.uuid(),
      contentKey: z.string().min(1),
      section: z.enum(["listening", "reading"]),
      answers: answerMapSchema,
      result: objectiveResultSchema,
      startedAt: timestampSchema,
      submittedAt: timestampSchema,
    })
    .refine((submission) => submission.section === submission.result.section, {
      message: "The objective submission section must match its result.",
    });

export const writingSubmissionSchema: z.ZodType<WritingSubmission> = z.strictObject({
  attemptId: z.uuid(),
  contentKey: z.string().min(1),
  tasks: z.tuple([
    z.strictObject({
      task: writingTask1Schema,
      response: z.string(),
      wordCount: z.number().int().nonnegative(),
    }),
    z.strictObject({
      task: writingTask2Schema,
      response: z.string(),
      wordCount: z.number().int().nonnegative(),
    }),
  ]),
  startedAt: timestampSchema,
  submittedAt: timestampSchema,
});

export const writingEvaluationSchema: z.ZodType<WritingEvaluation> =
  writingEvaluationInputSchema.extend({
    evaluatedAt: timestampSchema,
  });

export const speakingSubmissionSchema: z.ZodType<SpeakingSubmission> =
  z
    .strictObject({
      attemptId: z.uuid(),
      contentKey: z.string().min(1),
      responses: z.array(z.strictObject({
        status: z.enum(['answered', 'skipped']),
        recordingId: z.string().min(1),
        promptId: z.number().int().positive(),
        partLabel: z.string().min(1),
        sequence: z.number().int().nonnegative(),
        promptText: z.string().min(1),
        timeLimitSeconds: z.number().int().positive(),
        durationMs: z.number().nonnegative(),
        transcript: z.string().trim(),
      }).refine(response => response.status === 'skipped'
        ? response.transcript === '' && response.durationMs === 0
        : response.transcript.length > 0, 'Answered responses need a transcript; skipped responses have no transcript or duration.')).min(1),
      startedAt: timestampSchema,
      submittedAt: timestampSchema,
    })
    .refine(
      (submission) =>
        submission.responses.every(
          (response, index) =>
            response.sequence === index,
        ) &&
        new Set(submission.responses.map((response) => response.recordingId)).size ===
          submission.responses.length,
      { message: "The stored Speaking responses are inconsistent." },
    );

export const speakingEvaluationSchema: z.ZodType<SpeakingEvaluation> =
  z.union([
    scoredSpeakingEvaluationSchema.extend({ evaluatedAt: timestampSchema }),
    unscoredSpeakingEvaluationSchema.extend({ evaluatedAt: timestampSchema }),
  ]);

function parseStoredJson(value: string, label: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`The stored ${label} is not valid JSON.`);
  }
}

export function parseStoredObjectiveAnswers(value: string): AnswerMap {
  return answerMapSchema.parse(parseStoredJson(value, "objective answers"));
}

export function parseStoredObjectiveResult(value: string): ObjectiveResult {
  return objectiveResultSchema.parse(parseStoredJson(value, "objective result"));
}

export function parseStoredWritingSubmission(value: string): WritingSubmission {
  return writingSubmissionSchema.parse(parseStoredJson(value, "Writing submission"));
}

export function parseStoredWritingEvaluation(value: string): WritingEvaluation {
  return writingEvaluationSchema.parse(parseStoredJson(value, "Writing evaluation"));
}

export function parseStoredSpeakingEvaluation(value: string): SpeakingEvaluation {
  return speakingEvaluationSchema.parse(parseStoredJson(value, "Speaking evaluation"));
}
