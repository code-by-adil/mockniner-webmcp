import { z } from 'zod'

const bandScoreSchema = z
  .number()
  .min(0)
  .max(9)
  .refine((value) => Number.isInteger(value * 2), {
    message: 'Use a whole or half IELTS band from 0 to 9.',
  })

const feedbackPointSchema = z.string().trim().min(1).max(500)

const feedbackFields = {
  attemptId: z.uuid(),
  summary: z.string().trim().min(1).max(2_000),
  strengths: z.array(feedbackPointSchema).max(6),
  improvements: z.array(feedbackPointSchema).min(1).max(6),
}

export const scoredSpeakingEvaluationSchema = z.strictObject({
  ...feedbackFields,
  // Omitted on older saved evaluations and existing agent payloads.
  status: z.literal('scored').optional(),
  overallBand: bandScoreSchema,
  fluencyCoherence: bandScoreSchema,
  lexicalResource: bandScoreSchema,
  grammaticalRangeAccuracy: bandScoreSchema,
  strengths: z.array(feedbackPointSchema).min(1).max(6),
})

export const unscoredSpeakingEvaluationSchema = z.strictObject({
  ...feedbackFields,
  status: z.literal('insufficient_evidence'),
  reason: z.string().trim().min(1).max(2_000),
})

export const speakingEvaluationInputSchema = z.union([
  scoredSpeakingEvaluationSchema, unscoredSpeakingEvaluationSchema,
])

export type SpeakingEvaluationInput = z.infer<
  typeof speakingEvaluationInputSchema
>
