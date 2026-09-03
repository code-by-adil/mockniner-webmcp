import { FeedbackRequest } from '@/shared/ui/FeedbackRequest'

export function WritingEvaluationPrompt({ attemptId, reminder = false }: { attemptId: string; reminder?: boolean }) {
  return <FeedbackRequest label="Writing feedback" reminder={reminder}
    request={`Open my IELTS Writing submission with attempt ID ${attemptId}, grade both tasks, and add feedback to that same attempt.`} />
}
