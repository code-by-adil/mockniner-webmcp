import { z } from "zod";
import type {
  AnswerMap,
  ObjectiveResult,
  ObjectiveSubmission,
  SpeakingSubmission,
  WritingEvaluation,
  WritingSubmission,
} from "./types";
import { writingEvaluationInputSchema } from "./writingEvaluation";

const timestampSchema = z.string().datetime({ offset: true });
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
      attemptId: z.string().uuid(),
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

const writingTaskSchema = z.strictObject({
  id: z.union([z.literal(1), z.literal(2)]),
  title: z.string(),
  instruction: z.string(),
  lead: z.string(),
  prompt: z.string(),
  minimumWords: z.number().int().positive(),
  chart: z.strictObject({
    title: z.string(),
    years: z.tuple([z.string(), z.string()]),
    rows: z.array(z.strictObject({
      label: z.string(),
      values: z.tuple([z.number(), z.number()]),
    })),
    unit: z.string(),
  }).optional(),
});

export const writingSubmissionSchema: z.ZodType<WritingSubmission> = z.strictObject({
  attemptId: z.string().uuid(),
  contentKey: z.string().min(1),
  tasks: z.tuple([
    z.strictObject({
      task: writingTaskSchema,
      response: z.string(),
      wordCount: z.number().int().nonnegative(),
    }),
    z.strictObject({
      task: writingTaskSchema,
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
      attemptId: z.string().uuid(),
      promptCount: z.number().int().nonnegative(),
      recordedCount: z.number().int().nonnegative(),
      recordingIds: z.array(z.string().min(1)),
      submittedAt: timestampSchema,
    })
    .refine(
      (submission) =>
        submission.promptCount === submission.recordedCount &&
        submission.recordedCount === submission.recordingIds.length &&
        new Set(submission.recordingIds).size === submission.recordingIds.length,
      { message: "The stored Speaking submission counts are inconsistent." },
    );

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
