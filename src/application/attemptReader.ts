import type { LearningSummary } from '@/domain/learningSummary'
import type { ObjectiveExplanation } from '@/domain/objectiveExplanation'
import type {
  ObjectiveSubmission,
  WritingEvaluation,
  WritingSubmission,
  SpeakingSubmission,
  SpeakingEvaluation,
} from '@/domain/types'

type StoredWritingAttempt = {
  submission: WritingSubmission
  evaluation: WritingEvaluation | null
}

export type AttemptReader = {
  readObjectiveExplanations: (attemptId: string) => Promise<ObjectiveExplanation[]>
  readLearningSummary: (recentLimit: number) => Promise<LearningSummary>
  readObjectiveAttempt: (attemptId?: string, section?: 'listening' | 'reading') => Promise<ObjectiveSubmission | null>
  readWritingAttempt: (attemptId?: string) => Promise<StoredWritingAttempt | null>
  readSpeakingAttempt: (attemptId?: string) => Promise<{ submission: SpeakingSubmission; evaluation: SpeakingEvaluation | null } | null>
}
