import { CopyButton } from '@/shared/ui/CopyButton'

const evaluationRequest = 'Review my IELTS Speaking interview and add feedback to the attempt open on this page.'

export function SpeakingEvaluationPrompt({ attemptId }: { attemptId: string }) {
  return (
    <section aria-label="Speaking evaluation prompt" className="mt-6 w-full rounded-lg border border-[var(--exam-accent-border)] bg-[var(--exam-surface)] p-5 text-left shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-bold text-[var(--exam-text)]">Get feedback from your agent</h2>
        <CopyButton
          key={attemptId}
          text={evaluationRequest}
          label="Copy request"
          ariaLabel="Copy evaluation request"
          className="inline-flex shrink-0 items-center gap-2 rounded border border-[var(--exam-border)] px-3 py-2 text-xs font-semibold text-[var(--exam-text)] hover:bg-[var(--exam-control-hover-bg)] disabled:opacity-50"
        />
      </div>
      <p className="mt-2 text-sm leading-6 text-[var(--exam-text-muted)]">Copy this request to your agent and keep this attempt open to receive feedback.</p>
      <blockquote className="mt-3 select-text break-words rounded border border-[var(--exam-border-muted)] bg-[var(--exam-surface-muted)] p-3 text-sm leading-6 text-[var(--exam-text)]">{evaluationRequest}</blockquote>
      <p className="mt-3 text-xs leading-5 text-[var(--exam-text-muted)]">Feedback covers your interview transcript. Pronunciation is not included.</p>
    </section>
  )
}
