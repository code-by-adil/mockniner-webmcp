import { z } from 'zod'
import { expectedEvaluationRevisionSchema } from './evaluationRevision'

const bandScoreSchema = z
  .number()
  .min(0)
  .max(9)
  .refine((value) => Number.isInteger(value * 2), {
    message: 'Band scores must use whole or half-band increments.',
  })

const writingAnnotationSchema = z
  .object({
    id: z.string().trim().min(1).max(100),
    taskNumber: z.union([z.literal(1), z.literal(2)]),
    originalText: z.string().min(1).max(4_000),
    suggestion: z.string().min(1).max(4_000),
    explanation: z.string().min(1).max(4_000),
    type: z.enum(['grammar', 'vocabulary', 'coherence', 'other']),
    shortTitle: z.string().trim().min(1).max(200).optional(),
    startOffset: z.number().int().nonnegative().optional().describe('Zero-based UTF-16 start offset. Supply both offsets when the exact quote occurs more than once.'),
    endOffset: z.number().int().nonnegative().optional().describe('Exclusive UTF-16 end offset. The response slice must exactly equal originalText.'),
    contextBefore: z.string().max(1_000).optional(),
    contextAfter: z.string().max(1_000).optional(),
    issueTitle: z.string().trim().min(1).max(200).optional(),
    severity: z.enum(['critical', 'major', 'minor']).optional(),
    ruleId: z.string().trim().min(1).max(100).optional(),
    incorrectExample: z.string().max(2_000).optional(),
    correctExample: z.string().max(2_000).optional(),
  })
  .strict()

const writingTaskEvaluationSchema = z
  .object({
    band: bandScoreSchema,
    taskAchievement: bandScoreSchema,
    coherenceCohesion: bandScoreSchema,
    lexicalResource: bandScoreSchema,
    grammaticalRange: bandScoreSchema,
    feedback: z.string().trim().min(1).max(4_000),
    annotations: z.array(writingAnnotationSchema).max(100),
  })
  .strict()

export const writingEvaluationInputSchema = z
  .object({
    attemptId: z.uuid(),
    expectedRevision: expectedEvaluationRevisionSchema,
    overallBand: bandScoreSchema,
    summary: z.string().trim().min(1).max(4_000),
    task1: writingTaskEvaluationSchema,
    task2: writingTaskEvaluationSchema,
  })
  .strict()

export type WritingEvaluationInput = z.infer<typeof writingEvaluationInputSchema>
