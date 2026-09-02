import type { IeltsReview } from '@/domain/session'
import { SpeakingEvaluationPrompt } from '@/modules/ielts/speaking/ui/SpeakingEvaluationPrompt'

export function PendingAttemptReview({ review, onExit }: { review: Exclude<IeltsReview, { kind: 'objective' }>; onExit: () => void }) {
  return <main className="mx-auto max-w-3xl px-6 py-10">
    <button className="mb-8 rounded border px-4 py-2 text-sm" onClick={onExit}>{review.returnTo === 'home' ? 'Back to practice' : 'Back to results'}</button>
    <h1 className="text-2xl font-bold">{review.kind === 'writing' ? 'Writing' : 'Speaking'} submitted</h1>
    <p role="status" className="mt-3 text-[var(--exam-text-muted)]">Awaiting evaluation. Your answers are saved. Feedback will appear here when your agent finishes.</p>
    {review.kind === 'speaking' ? <SpeakingEvaluationPrompt attemptId={review.submission.attemptId} /> : <section className="mt-6 rounded-lg border p-5">
      <h2 className="font-semibold">Get feedback from your agent</h2>
      <p className="mt-3 select-text break-words">Evaluate my IELTS Writing submission using this page’s WebMCP tools and attach the structured feedback to this same attempt. Attempt ID: {review.submission.attemptId}</p>
    </section>}
  </main>
}
