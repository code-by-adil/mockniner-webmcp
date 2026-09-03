import { FeedbackRequest } from '@/shared/ui/FeedbackRequest'

export function SpeakingEvaluationPrompt({ attemptId, reminder = false }: { attemptId: string; reminder?: boolean }) {
  return <FeedbackRequest attemptId={attemptId} label="Speaking evaluation prompt" reminder={reminder}
    request={`Open my IELTS Speaking submission with attempt ID ${attemptId}, review the interview transcript, and add feedback to that same attempt.`}
    note="Feedback covers your interview transcript. Pronunciation is not included." />
}
