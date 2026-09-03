import { useEvaluationActivity } from '@/application/evaluationActivityContext'
import { CopyButton } from './CopyButton'

export function FeedbackRequest({ request, label, note, reminder = false, attemptId }: { request: string; label: string; note?: string; reminder?: boolean; attemptId?: string }) {
  const evaluation = useEvaluationActivity()
  if (attemptId && evaluation?.activity?.attemptId === attemptId) return null
  return <section aria-label={label} className="min-w-0 rounded-lg border border-neutral-200 bg-white p-5 text-left sm:p-6">
    <h2 className="font-semibold text-neutral-950">Ask your agent to evaluate</h2>
    <p className="mt-2 text-sm leading-6 text-neutral-600">{reminder ? 'If you haven’t already asked for feedback, copy this request and paste it into your agent chat.' : 'Copy this request and paste it into your agent chat.'} Keep this submission open.</p>
    <div className="mt-4 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
      <blockquote className="min-w-0 select-text text-sm leading-6 text-neutral-900 [overflow-wrap:anywhere]">{request}</blockquote>
      <CopyButton key={request} text={request} label="Copy request"
        className="shrink-0 rounded border border-[var(--exam-accent)] bg-[var(--exam-accent)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--exam-accent-hover)] disabled:opacity-60" />
    </div>
    <p className="mt-3 text-xs leading-5 text-neutral-600">Submitting does not request feedback automatically. Feedback will appear here after your agent adds it.</p>
    {note ? <p className="mt-2 text-xs leading-5 text-neutral-600">{note}</p> : null}
  </section>
}
