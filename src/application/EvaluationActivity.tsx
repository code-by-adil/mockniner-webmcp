import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { EvaluationContext, EVALUATION_WAIT_MS, type EvaluationActivity, type EvaluationKind } from './evaluationActivityContext'

// This is a page-local acknowledgement from the agent, not a background job.
// Reloading clears it; only the existing evaluation commands persist feedback.
export function EvaluationActivityProvider({ children }: { children: ReactNode }) {
  const [activity, setActivity] = useState<EvaluationActivity | null>(null)
  const begin = useCallback((kind: EvaluationKind, attemptId: string) => setActivity(current =>
    current?.kind === kind && current.attemptId === attemptId && current.status === 'working'
      ? current : { kind, attemptId, startedAt: Date.now(), status: 'working' }), [])
  const finish = useCallback((kind: EvaluationKind, attemptId: string) => setActivity(current =>
    current?.kind === kind && current.attemptId === attemptId ? null : current), [])
  const fail = useCallback((kind: EvaluationKind, attemptId: string) => setActivity(current =>
    current?.kind === kind && current.attemptId === attemptId ? { ...current, status: 'failed' } : current), [])
  const dismiss = useCallback(() => setActivity(null), [])
  useEffect(() => {
    if (activity?.status !== 'working') return
    const timer = setTimeout(() => setActivity(current => current === activity ? { ...current, status: 'delayed' } : current),
      Math.max(0, activity.startedAt + EVALUATION_WAIT_MS - Date.now()))
    return () => clearTimeout(timer)
  }, [activity])
  const value = useMemo(() => ({ activity, begin, finish, fail, dismiss }), [activity, begin, finish, fail, dismiss])
  return <EvaluationContext value={value}>{children}</EvaluationContext>
}
