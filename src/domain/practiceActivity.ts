import { z } from 'zod'

export const activityKindSchema = z.enum(['listening', 'reading', 'writing', 'speaking', 'assessment'])
export const activityPageSchema = z.strictObject({
  kind: activityKindSchema.optional(),
  limit: z.number().int().min(1).max(25).default(5),
  offset: z.number().int().min(0).max(100).default(0),
})

export const practiceActivitySchema = z.strictObject({
  eventId: z.number().int().positive(),
  recordedAt: z.iso.datetime(),
  type: z.enum(['practice_installed', 'practice_updated', 'attempt_submitted', 'feedback_attached']),
  kind: activityKindSchema,
  contentKey: z.string().min(1).nullable(),
  packageId: z.string().min(1).nullable(),
  revision: z.number().int().positive().nullable(),
  attemptId: z.string().min(1).nullable(),
  title: z.string().max(160).nullable(),
  outcome: z.enum(['evaluated', 'insufficient_evidence']).nullable(),
})

export type PracticeActivity = z.infer<typeof practiceActivitySchema>
export type ActivityPage = z.infer<typeof activityPageSchema>
export type PracticeActivityPage = { items: PracticeActivity[]; nextOffset: number | null }
