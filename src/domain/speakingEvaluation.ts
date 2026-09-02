import { z } from 'zod'

const bandScoreSchema = z
  .number()
  .min(0)
  .max(9)
  .refine((value) => Number.isInteger(value * 2), {
    message: 'Use a whole or half IELTS band from 0 to 9.',
  })

const feedbackPointSchema = z.string().trim().min(1).max(500)

export const speakingEvaluationInputSchema = z.strictObject({
  attemptId: z.uuid(),
  overallBand: bandScoreSchema,
  fluencyCoherence: bandScoreSchema,
  lexicalResource: bandScoreSchema,
  grammaticalRangeAccuracy: bandScoreSchema,
  summary: z.string().trim().min(1).max(2_000),
  strengths: z.array(feedbackPointSchema).min(1).max(6),
  improvements: z.array(feedbackPointSchema).min(1).max(6),
})

export type SpeakingEvaluationInput = z.infer<
  typeof speakingEvaluationInputSchema
>
