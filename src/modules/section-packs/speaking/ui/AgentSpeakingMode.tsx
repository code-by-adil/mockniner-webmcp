import { Check, Loader2, Mic, Square, Volume2 } from 'lucide-react'
import type { CompleteSpeakingAttemptInput } from '@/application/attemptWriter'
import type { SpeakingSubmission } from '@/domain/types'
import { useAgentSpeakingInterview } from '../useAgentSpeakingInterview'
import { SpeakingTranscriptReview } from './SpeakingTranscriptReview'

type Props = {
  onComplete: (input: CompleteSpeakingAttemptInput) => Promise<SpeakingSubmission>
}

export function AgentSpeakingMode({ onComplete }: Props) {
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
    ? 'Prepare the browser once, then ask your agent to start an IELTS Speaking interview.'
    : phase === 'waiting'
      ? completedTurns === 0
        ? 'Ready. Ask your agent to begin the interview.'
        : 'Answer sent. The agent is choosing the next question.'
      : phase === 'speaking'
        ? 'The examiner is preparing and speaking the question…'
        : phase === 'ready'
          ? 'Press the microphone when you are ready to answer.'
          : phase === 'recording'
            ? `Recording your answer · ${secondsLeft}s remaining`
            : phase === 'review'
              ? 'Check the transcript, correct recognition mistakes, then send it.'
              : phase === 'saving'
                ? 'Saving the completed interview locally…'
                : 'Resolve the issue below and ask the agent to try the turn again.'

  return (
    <main className="mx-auto flex min-h-[calc(100vh-120px)] w-full max-w-3xl flex-col items-center justify-center px-4 py-10 text-center sm:px-6">
      <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[var(--exam-border)] bg-[var(--exam-surface)] px-3 py-1 text-xs font-semibold text-[var(--exam-text-muted)]">
        <Volume2 size={14} /> Local Kokoro examiner · {completedTurns} answers captured
      </div>
      <h1 className="text-3xl font-extrabold tracking-tight text-[var(--exam-text)] sm:text-4xl">
        Agent-guided Speaking interview
      </h1>
      <p className="mt-3 max-w-2xl leading-7 text-[var(--exam-text-muted)]">{statusText}</p>
      {phase === 'setup' ? (
        <p className="mt-2 max-w-2xl text-xs leading-5 text-[var(--exam-text-muted)]">
          Kokoro voice generation and saved recordings stay in the browser. Chrome speech recognition may use an online recognition service; you can correct its transcript before anything is returned to the agent.
        </p>
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
            <Volume2 size={18} /> Prepare microphone and audio
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
          approveLabel="Send answer to agent"
        />
      ) : null}

      {phase === 'waiting' && completedTurns > 0 ? (
        <div className="mt-7 inline-flex items-center gap-2 text-sm font-semibold text-[var(--exam-success-fg)]">
          <Check size={17} /> The last transcript was returned to the agent.
        </div>
      ) : null}
    </main>
  )
}
