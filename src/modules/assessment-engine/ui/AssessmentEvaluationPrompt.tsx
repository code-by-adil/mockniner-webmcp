import { FeedbackRequest } from '@/shared/ui/FeedbackRequest'

export function AssessmentEvaluationPrompt({ attemptId }: { attemptId: string }) {
  return <FeedbackRequest attemptId={attemptId} label="Assessment feedback" reminder
    request={`Open my practice submission with attempt ID ${attemptId}, evaluate it using its saved rubric, and add feedback to that same attempt.`} />
}
