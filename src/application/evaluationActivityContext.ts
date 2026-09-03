import { createContext, useContext } from 'react'

export type EvaluationKind = 'writing' | 'speaking' | 'assessment'
export type EvaluationActivity = { kind: EvaluationKind; attemptId: string; startedAt: number; status: 'working' | 'failed' | 'delayed' }
export const EVALUATION_WAIT_MS = 5 * 60 * 1000
export type EvaluationActivityActions = {
  activity: EvaluationActivity | null
  begin: (kind: EvaluationKind, attemptId: string) => void
  finish: (kind: EvaluationKind, attemptId: string) => void
  fail: (kind: EvaluationKind, attemptId: string) => void
  dismiss: () => void
}
export const EvaluationContext = createContext<EvaluationActivityActions | null>(null)
export const useEvaluationActivity = () => useContext(EvaluationContext)

