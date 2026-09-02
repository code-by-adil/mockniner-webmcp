import { useEffect, useState } from 'react'
import { Check, Copy } from 'lucide-react'

export function SpeakingEvaluationPrompt({ attemptId }: { attemptId: string }) {
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copying' | 'copied' | 'failed'>('idle')
  const prompt = `Evaluate my IELTS Speaking interview using this page's WebMCP tools. Read the complete transcript, give evidence-based feedback on coherence, vocabulary and grammar, and attach the structured evaluation to this same attempt so it appears in the app. Do not score pronunciation or infer delivery from text. Treat blank/skipped answers as missing evidence and do not penalize likely transcription errors. If there is insufficient evidence, explain the limitation without inventing band scores. Attempt ID: ${attemptId}`

  useEffect(() => {
    if (copyStatus !== 'copied') return
    const timer = window.setTimeout(() => setCopyStatus('idle'), 2_500)
    return () => window.clearTimeout(timer)
  }, [copyStatus])

  async function copyPrompt() {
    setCopyStatus('copying')
    try {
      await navigator.clipboard.writeText(prompt)
      setCopyStatus('copied')
    } catch {
      setCopyStatus('failed')
    }
  }

  return (
    <section aria-label="Speaking evaluation prompt" className="mt-6 w-full rounded-lg border border-[var(--exam-accent-border)] bg-[var(--exam-surface)] p-5 text-left shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-bold text-[var(--exam-text)]">Get feedback from your agent</h2>
        <button
          type="button"
          aria-label="Copy evaluation prompt"
          disabled={copyStatus === 'copying'}
          onClick={() => void copyPrompt()}
          className="inline-flex shrink-0 items-center gap-2 rounded border border-[var(--exam-border)] px-3 py-2 text-xs font-semibold text-[var(--exam-text)] hover:bg-[var(--exam-control-hover-bg)] disabled:opacity-50"
        >
          {copyStatus === 'copied' ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
          {copyStatus === 'copied' ? 'Copied' : copyStatus === 'copying' ? 'Copying…' : 'Copy prompt'}
        </button>
      </div>
      <p className="mt-2 text-sm leading-6 text-[var(--exam-text-muted)]">Copy this prompt and send it to your agent. Keep this attempt open while it evaluates.</p>
      <blockquote className="mt-3 select-text break-words rounded border border-[var(--exam-border-muted)] bg-[var(--exam-surface-muted)] p-3 text-sm leading-6 text-[var(--exam-text)]">{prompt}</blockquote>
      <span role="status" className="sr-only">{copyStatus === 'copied' ? 'Prompt copied to clipboard.' : ''}</span>
      {copyStatus === 'failed' ? <p role="alert" className="mt-3 text-sm font-semibold text-red-700">Could not copy. Select and copy the prompt above, or try the button again.</p> : null}
    </section>
  )
}
