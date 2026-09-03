import { FeedbackRequest } from '@/shared/ui/FeedbackRequest'

export function WritingEvaluationPrompt({ attemptId, reminder = false }: { attemptId: string; reminder?: boolean }) {
  return <FeedbackRequest attemptId={attemptId} label="Writing feedback" reminder={reminder}
    request={`Open my IELTS Writing submission with attempt ID ${attemptId}, grade both tasks, and add feedback to that same attempt.`} />
}
