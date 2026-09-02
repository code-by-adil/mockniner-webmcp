import { useState } from 'react'
import { Check, Copy, Loader2, Mic, Square, Volume2 } from 'lucide-react'
import type { CompleteSpeakingAttemptInput } from '@/application/attemptWriter'
import type { SpeakingSubmission } from '@/domain/types'
import { useAgentSpeakingInterview } from '../useAgentSpeakingInterview'
import { SpeakingTranscriptReview } from './SpeakingTranscriptReview'

type Props = {
  onComplete: (input: CompleteSpeakingAttemptInput) => Promise<SpeakingSubmission>
}

const DEFAULT_SPEAKING_PROMPT =
  'Conduct a full IELTS Speaking interview with me covering Parts 1, 2, and 3. Use the IELTS Speaking turn tool to ask one question at a time, listen to each response, and conclude when finished.'

export function AgentSpeakingMode({ onComplete }: Props) {
  const [copied, setCopied] = useState(false)

  const handleCopyPrompt = () => {
    void navigator.clipboard.writeText(DEFAULT_SPEAKING_PROMPT)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const {
    phase,
    examinerText,
    transcriptDraft,
    completedTurns,
    secondsLeft,
    error,
    prepared,
    canvasRef,
    prepare,
    startRecording,
    stopRecording,
    setTranscriptDraft,
    approveTranscript,
    recordAgain,
  } = useAgentSpeakingInterview({ onComplete })
  const statusText = phase === 'setup'
    ? 'Enable your microphone and audio to begin the interview.'
    : phase === 'waiting'
      ? completedTurns === 0
        ? 'Ready. Give the prompt below to your agent to start the interview.'
        : 'Response received. Waiting for the next question…'
      : phase === 'speaking'
        ? 'The examiner is speaking…'
        : phase === 'ready'
          ? 'Press the microphone when you are ready to answer.'
          : phase === 'recording'
            ? `Recording · ${secondsLeft}s remaining`
            : phase === 'review'
              ? 'Review your transcript before submitting.'
              : phase === 'saving'
                ? 'Submitting your completed interview…'
                : 'Please resolve the issue below and try again.'

  return (
    <main className="mx-auto flex min-h-[calc(100vh-120px)] w-full max-w-3xl flex-col items-center justify-center px-4 py-10 text-center sm:px-6">
      <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[var(--exam-border-muted)] bg-[var(--exam-surface)] px-3.5 py-1.5 text-xs font-semibold text-[var(--exam-text-muted)] shadow-2xs">
        <Volume2 size={14} className="text-[var(--exam-accent)]" />
        <span>{completedTurns > 0 ? `${completedTurns} responses recorded` : 'Interactive Speaking Interview'}</span>
      </div>
      <h1 className="text-3xl font-extrabold tracking-tight text-[var(--exam-text)] sm:text-4xl">
        IELTS Speaking Interview
      </h1>
      <p className="mt-3 max-w-2xl leading-7 text-[var(--exam-text-muted)]">{statusText}</p>

      {completedTurns === 0 && !examinerText ? (
        <section className="mt-8 w-full max-w-xl text-left">
          <h2 className="mb-2.5 text-center text-xs font-bold uppercase tracking-wider text-[var(--exam-text-muted)]">
            Ask your agent to start the interview
          </h2>
          <div className="rounded-xl border border-[var(--exam-border-muted)] bg-[var(--exam-surface)] p-5 shadow-xs">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-semibold text-[var(--exam-text)]">
                Agent prompt
              </span>
              <button
                type="button"
                onClick={handleCopyPrompt}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--exam-border-muted)] bg-[var(--exam-surface-muted)] px-3 py-1.5 text-xs font-medium text-[var(--exam-text)] transition-colors hover:bg-[var(--exam-control-hover-bg)] cursor-pointer"
                aria-label="Copy prompt for agent"
              >
                {copied ? (
                  <>
                    <Check size={13} className="text-emerald-600" />
                    <span className="text-emerald-700 font-semibold">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy size={13} className="text-[var(--exam-text-muted)]" />
                    <span>Copy prompt</span>
                  </>
                )}
              </button>
            </div>

            <div className="mt-3 rounded-lg border border-[var(--exam-border-muted)] bg-[var(--exam-surface-muted)] p-3.5 text-sm leading-relaxed text-[var(--exam-text)] select-text">
              “{DEFAULT_SPEAKING_PROMPT}”
            </div>
          </div>
        </section>
      ) : null}

      {examinerText ? (
        <section className="mt-8 w-full rounded-xl border border-[var(--exam-border-muted)] bg-[var(--exam-surface)] p-6 text-left shadow-sm">
          <div className="text-xs font-bold uppercase tracking-widest text-[var(--exam-accent)]">Examiner</div>
          <p className="mt-3 text-xl font-semibold leading-8 text-[var(--exam-text)]">{examinerText}</p>
        </section>
      ) : null}

      {error ? (
        <div className="mt-5 w-full rounded border border-red-200 bg-red-50 px-4 py-3 text-left text-sm font-semibold text-red-700">
          {error}
        </div>
      ) : null}

      <div className="mt-8 flex flex-col items-center gap-4">
        {(phase === 'setup' || phase === 'error') && !prepared ? (
          <button type="button" onClick={prepare} className="inline-flex items-center gap-2 rounded bg-[var(--exam-accent)] px-5 py-3 text-sm font-bold text-white hover:bg-[var(--exam-accent-hover)]">
            <Volume2 size={18} /> Enable microphone and audio
          </button>
        ) : null}
        {phase === 'ready' ? (
          <button type="button" onClick={startRecording} aria-label="Start recording" className="flex h-28 w-28 items-center justify-center rounded-full bg-gray-900 text-white shadow-xl transition-transform hover:scale-105">
            <Mic size={38} />
          </button>
        ) : null}
        {phase === 'recording' ? (
          <>
            <button type="button" onClick={stopRecording} aria-label="Stop recording" className="flex h-28 w-28 animate-pulse items-center justify-center rounded-full bg-[#D40000] text-white shadow-xl">
              <Square size={34} fill="currentColor" />
            </button>
            <canvas ref={canvasRef} width={300} height={54} className="h-12 w-72 rounded" aria-hidden="true" />
          </>
        ) : null}
        {(phase === 'speaking' || phase === 'saving') ? (
          <Loader2 size={36} className="animate-spin text-[var(--exam-accent)]" />
        ) : null}
      </div>

      {phase === 'review' ? (
        <SpeakingTranscriptReview
          id="agent-speaking-transcript"
          value={transcriptDraft}
          onChange={setTranscriptDraft}
          onRecordAgain={recordAgain}
          onApprove={approveTranscript}
          approveLabel="Send response"
        />
      ) : null}

      {phase === 'waiting' && completedTurns > 0 ? (
        <div className="mt-7 inline-flex items-center gap-2 text-sm font-semibold text-[var(--exam-success-fg)]">
          <Check size={17} /> Response recorded.
        </div>
      ) : null}
    </main>
  )
}
