import { describe, expect, it } from 'vitest'
import { defaultSpeakingPlan, speakingPlanSchema, speakingQuestionText } from './speakingPlan'

describe('complete Speaking plans', () => {
  it('validates the original plan and preserves the long-turn cue card', () => {
    const plan = speakingPlanSchema.parse(defaultSpeakingPlan)
    expect(plan.questions).toHaveLength(12)
    const question = plan.questions.find(q => q.part === 2)!
    expect(question.preparationSeconds).toBe(60)
    for (const point of question.cuePoints!) expect(speakingQuestionText(question)).toContain(point)
  })
  it('rejects duplicate IDs, unordered parts and missing long-turn preparation', () => {
    for (const change of [
      (p: typeof defaultSpeakingPlan) => { p.questions[1]!.id = p.questions[0]!.id },
      (p: typeof defaultSpeakingPlan) => { p.questions.reverse() },
      (p: typeof defaultSpeakingPlan) => { p.questions[6]!.preparationSeconds = 0 },
      (p: typeof defaultSpeakingPlan) => { p.questions[6]!.cuePoints = undefined },
      (p: typeof defaultSpeakingPlan) => { p.questions = p.questions.filter(q => q.part !== 3) },
    ]) {
      const plan = structuredClone(defaultSpeakingPlan); change(plan)
      expect(speakingPlanSchema.safeParse(plan).success).toBe(false)
    }
  })
  it('rejects oversized and unknown input before touching the runner', () => {
    expect(speakingPlanSchema.safeParse({ ...defaultSpeakingPlan, adaptive: true }).success).toBe(false)
    expect(speakingPlanSchema.safeParse({ ...defaultSpeakingPlan, questions: Array(20).fill(defaultSpeakingPlan.questions[0]) }).success).toBe(false)
  })
})
