import type { IeltsReview } from '@/domain/session'
import { SpeakingEvaluationPrompt } from '@/modules/ielts/speaking/ui/SpeakingEvaluationPrompt'
import { PendingWritingReview } from '@/modules/ielts/writing/ui/PendingWritingReview'

export function PendingAttemptReview({ review, onExit }: { review: Exclude<IeltsReview, { kind: 'objective' }>; onExit: () => void }) {
  if (review.kind === 'writing') return <PendingWritingReview submission={review.submission} onExit={onExit} selectedTask={review.focusTask ? review.part : undefined} focusRequest={review} backLabel={review.returnTo === 'home' ? 'Back to practice' : 'Back to results'} />
  return <main className="mx-auto max-w-3xl px-6 py-10">
    <button className="mb-8 rounded border px-4 py-2 text-sm" onClick={onExit}>{review.returnTo === 'home' ? 'Back to practice' : 'Back to results'}</button>
    <h1 className="text-2xl font-bold">Speaking submitted</h1>
    <p role="status" className="mt-3 text-[var(--exam-text-muted)]">Awaiting evaluation. Your answers are saved. Feedback will appear here when your agent finishes.</p>
    <SpeakingEvaluationPrompt attemptId={review.submission.attemptId} />
  </main>
}
