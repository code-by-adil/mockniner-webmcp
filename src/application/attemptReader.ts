import type { LearningSummary } from '@/domain/learningSummary'
import type {
  ObjectiveSubmission,
  WritingEvaluation,
  WritingSubmission,
} from '@/domain/types'

export type StoredWritingAttempt = {
  submission: WritingSubmission
  evaluation: WritingEvaluation | null
}

export type AttemptReader = {
  readLearningSummary: (recentLimit: number) => Promise<LearningSummary>
  readObjectiveAttempt: (attemptId: string) => Promise<ObjectiveSubmission | null>
  readWritingAttempt: (attemptId: string) => Promise<StoredWritingAttempt | null>
}
