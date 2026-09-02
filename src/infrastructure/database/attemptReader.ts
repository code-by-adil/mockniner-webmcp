import type { AttemptReader } from '@/application/attemptReader'
import type { SQLocal } from 'sqlocal'
import {
  readLearningSummary,
  readObjectiveAttempt,
  readWritingAttempt,
} from './attemptRepository'

export function createAttemptReader(database: SQLocal): AttemptReader {
  return {
    readLearningSummary: (recentLimit) =>
      readLearningSummary(database, recentLimit),
    readObjectiveAttempt: (attemptId) =>
      readObjectiveAttempt(database, attemptId),
    readWritingAttempt: (attemptId) =>
      readWritingAttempt(database, attemptId),
  }
}
