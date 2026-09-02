import { ApplicationError } from '@/domain/errors'
import { speakingPlanSchema, type SpeakingPlan } from '@/domain/speakingPlan'

export type SpeakingProgress = {
  phase: string
  currentQuestion: number
  totalQuestions: number
  recordedAnswers: number
  skippedAnswers: number
}
export type SpeakingInterviewBinding = {
  configure: (plan: SpeakingPlan) => void
  read: () => SpeakingProgress
}
export type BindSpeakingInterview = (binding: SpeakingInterviewBinding) => () => void

// The visible runner owns the plan and lifecycle. WebMCP shares those commands;
// there is no agent-only question queue or long-lived per-question tool call.
export function createSpeakingInterviewController() {
  let binding: SpeakingInterviewBinding | null = null
  const bind: BindSpeakingInterview = next => {
    binding = next
    return () => { if (binding === next) binding = null }
  }
  return {
    bind,
    configure(input: SpeakingPlan) {
      if (!binding) throw new ApplicationError('SPEAKING_NOT_OPEN', 'Open Speaking practice before installing an interview.', true)
      const plan = speakingPlanSchema.parse(input)
      binding.configure(plan)
      return { status: 'ready', title: plan.title, questions: plan.questions.length, nextAction: 'The learner presses Start interview. The app runs every question locally; no per-question agent calls are needed.' }
    },
    read: () => binding ? { active: true, ...binding.read() } : { active: false, phase: 'closed' },
  }
}
