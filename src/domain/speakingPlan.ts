import { z } from 'zod'
import { SPEAKING_CONTENT_KEY, speakingPrompts } from '@/content/speaking'

export const speakingPlanSchema = z.strictObject({
  contentKey: z.string().trim().min(1).max(100).regex(/^[a-z0-9][a-z0-9._-]*$/),
  title: z.string().trim().min(1).max(120),
  questions: z.array(z.strictObject({
    id: z.number().int().positive(),
    part: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    label: z.string().trim().min(1).max(100),
    text: z.string().trim().min(1).max(600),
    preparationSeconds: z.number().int().min(0).max(60),
    responseSeconds: z.number().int().min(15).max(120),
    cuePoints: z.array(z.string().trim().min(1).max(150)).min(3).max(4).optional(),
  })).min(10).max(12),
}).superRefine(({ questions }, ctx) => {
  const ids = new Set<number>()
  for (const [index, question] of questions.entries()) {
    const issue = (message: string) => ctx.addIssue({ code: 'custom', path: ['questions', index], message })
    if (ids.has(question.id)) issue('Question IDs must be unique.')
    ids.add(question.id)
    if (index && question.part < questions[index - 1]!.part) issue('Keep questions in Part 1, Part 2, Part 3 order.')
    if (question.part === 2) {
      if (question.preparationSeconds !== 60 || question.responseSeconds !== 120 || !question.cuePoints) {
        issue('Part 2 requires 60 seconds preparation, 120 seconds speaking, and 3–4 cue points.')
      }
    } else if (question.preparationSeconds !== 0 || question.cuePoints) {
      issue('Only Part 2 has preparation time and cue points.')
    }
  }
  if (![1, 2, 3].every(part => questions.some(q => q.part === part)) || questions.filter(q => q.part === 2).length !== 1) {
    ctx.addIssue({ code: 'custom', path: ['questions'], message: 'Include Parts 1 and 3 and exactly one Part 2 long turn.' })
  }
})

export type SpeakingPlan = z.infer<typeof speakingPlanSchema>
export type SpeakingQuestion = SpeakingPlan['questions'][number]
export const defaultSpeakingPlan: SpeakingPlan = speakingPlanSchema.parse({
  contentKey: SPEAKING_CONTENT_KEY,
  title: 'IELTS Speaking practice',
  questions: speakingPrompts,
})

export function speakingQuestionText(question: SpeakingQuestion): string {
  return question.cuePoints
    ? `${question.text} You should say: ${question.cuePoints.join('; ')}.`
    : question.text
}
