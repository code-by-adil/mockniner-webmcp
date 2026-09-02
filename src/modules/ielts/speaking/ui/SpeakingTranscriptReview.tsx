import { Send } from 'lucide-react'

type Props = {
  id: string
  value: string
  onChange: (value: string) => void
  onRecordAgain: () => void
  onApprove: () => void
  approveLabel: string
}

export function SpeakingTranscriptReview({
  id,
  value,
  onChange,
  onRecordAgain,
  onApprove,
  approveLabel,
}: Props) {
  return (
    <section className="mt-7 w-full rounded-xl border border-[var(--exam-border)] bg-[var(--exam-surface)] p-5 text-left shadow-sm">
      <label htmlFor={id} className="text-sm font-bold text-[var(--exam-text)]">
        Your answer transcript
      </label>
      <textarea
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={5}
        className="mt-2 w-full resize-y rounded border border-[var(--exam-border)] bg-white p-3 leading-6 outline-none focus:border-[var(--exam-accent)]"
        placeholder="Speech recognition did not return text. Type what you said here."
      />
      <div className="mt-4 flex flex-wrap justify-end gap-3">
        <button type="button" onClick={onRecordAgain} className="rounded border border-[var(--exam-border)] px-4 py-2 text-sm font-semibold">
          Record again
        </button>
        <button type="button" onClick={onApprove} className="inline-flex items-center gap-2 rounded bg-[var(--exam-accent)] px-4 py-2 text-sm font-bold text-white">
          <Send size={16} /> {approveLabel}
        </button>
      </div>
    </section>
  )
}
