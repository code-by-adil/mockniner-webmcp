import { useEffect, useState } from 'react'
import { Headphones, Loader2, Mic, RotateCcw, SkipForward, Square } from 'lucide-react'
import type { CompleteSpeakingAttemptInput } from '@/application/attemptWriter'
import type { BindSpeakingInterview } from '@/application/speakingInterviewController'
import { formatMinutesAndSeconds } from '@/shared/time'
import { useSpeakingInterview } from '../useSpeakingInterview'
import type { SpeakingPlan } from '@/domain/speakingPlan'

export function SpeakingInterview({ bindSpeakingInterview, onComplete, initialPlan, onConfigurePlan, attemptId, attemptStartedAt }: {
  bindSpeakingInterview: BindSpeakingInterview
  onComplete: (input: CompleteSpeakingAttemptInput) => Promise<unknown>
  initialPlan?: SpeakingPlan
  onConfigurePlan: (plan: SpeakingPlan) => void | Promise<void>
  attemptId?: string
  attemptStartedAt?: string
}) {
  const interview = useSpeakingInterview({ bindSpeakingInterview, onComplete, initialPlan, onConfigurePlan, attemptId, attemptStartedAt })
  const { phase, plan, index, secondsLeft, error, completeAnswer, startRecording, canvasRef } = interview
  const [notes, setNotes] = useState('')
  const question = plan.questions[index]!
  const busy = ['preparing', 'buffering', 'starting', 'stopping', 'saving'].includes(phase)
  const canRecord = phase === 'ready' || phase === 'thinking'
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || event.repeat || document.querySelector('dialog[open]') || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLInputElement || event.target instanceof HTMLButtonElement) return
      if (phase === 'recording') { event.preventDefault(); void completeAnswer() }
      else if (phase === 'ready' || phase === 'thinking') { event.preventDefault(); void startRecording() }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [phase, completeAnswer, startRecording])

  if (phase === 'loading' || phase === 'load-error') return <main className="m-auto max-w-xl p-8"><p role={error ? 'alert' : 'status'}>{error ?? 'Loading your saved interview…'}</p>{error ? <p>Your saved recordings have not been changed. Export your local data before attempting recovery.</p> : null}</main>
  if (phase === 'setup' || phase === 'preparing') return <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-6 py-10">
    <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--exam-accent-soft)] text-[var(--exam-accent)]"><Mic size={24} /></div>
    <p className="text-xs font-bold uppercase tracking-widest text-[var(--exam-text-muted)]">Speaking practice · 3 parts · {plan.questions.length} questions</p>
    <h1 className="mt-3 text-3xl font-bold text-[var(--exam-text)]">{plan.title}</h1>
    <p className="mt-4 text-base leading-7 text-[var(--exam-text-muted)]">Listen to the question. Select <strong>Record answer</strong> when you are ready, then <strong>Submit answer</strong> to move to the next question.</p>
    <ul className="mt-5 space-y-3 text-sm leading-6 text-[var(--exam-text)]">
      <li>Part 2 includes one minute to prepare and up to two minutes to speak.</li>
      <li>Your recordings and speech recognition stay on this device. Your agent receives the transcript only after you finish.</li>
      <li>Each completed answer is saved before the next question. You can leave and resume later; an unfinished recording is not saved.</li>
    </ul>
    {error ? <p role="alert" className="mt-5 rounded-lg bg-red-50 p-4 text-sm text-red-800">{error}</p> : null}
    <button type="button" disabled={phase === 'preparing'} onClick={() => void interview.start()} className="mt-7 inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-[var(--exam-accent)] px-6 py-3 font-semibold text-white disabled:opacity-60">
      {phase === 'preparing' ? <Loader2 size={18} className="animate-spin" /> : <Mic size={18} />}
      {phase === 'preparing' ? 'Preparing your interview…' : interview.recorded ? 'Resume interview' : 'Start interview'}
    </button>
    <p role="status" className="mt-3 text-center text-xs leading-5 text-[var(--exam-text-muted)]">{phase === 'preparing' ? 'Preparing the microphone, voice and speech recognition. The first visit may take longer.' : interview.recorded ? `${interview.recorded} of ${plan.questions.length} answers saved on this device.` : 'Have a custom topic? Your agent can install the complete question set here before you start.'}</p>
  </main>

  const status = phase === 'speaking' ? 'Listen to the question' : phase === 'thinking' ? 'Preparation time' : phase === 'ready' ? 'Ready to record' : phase === 'starting' ? 'Starting microphone…' : phase === 'recording' ? 'Recording your answer' : phase === 'buffering' ? 'Preparing question audio…' : phase === 'stopping' ? 'Saving your answer…' : phase === 'saving' ? 'Preparing your interview transcript…' : 'Please try again'
  return <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-5 py-6 sm:px-8 sm:py-10">
    <div className="flex items-center justify-between text-xs font-semibold text-[var(--exam-text-muted)]"><span>Part {question.part} · {question.label}</span><span>Question {index + 1} of {plan.questions.length}</span></div>
    <progress aria-label="Interview progress" value={interview.recorded} max={plan.questions.length} className="mt-3 h-1.5 w-full accent-[var(--exam-accent)]" />
    <div className="mt-8 flex items-center gap-2 text-sm font-semibold text-[var(--exam-accent)]" role="status">{busy ? <Loader2 size={18} className="animate-spin" /> : phase === 'recording' ? <Mic size={18} /> : <Headphones size={18} />}{status}</div>
    <h1 className="mt-5 text-2xl font-semibold leading-snug text-[var(--exam-text)] sm:text-3xl">{question.text}</h1>
    {question.cuePoints ? <ul className="mt-4 list-disc space-y-2 pl-5 text-[var(--exam-text-muted)]">{question.cuePoints.map(point => <li key={point}>{point}</li>)}</ul> : null}
    {question.part === 2 ? <><label htmlFor="speaking-notes" className="mt-6 text-sm font-medium">Your notes. Not submitted.</label><textarea id="speaking-notes" value={notes} onChange={e => setNotes(e.target.value)} className="mt-2 min-h-24 rounded-lg border border-[var(--exam-border)] bg-[var(--exam-surface)] p-3" placeholder="Jot down a few ideas…" /></> : null}
    <div className="my-8 flex min-h-24 flex-col items-center justify-center gap-3">
      <div className="text-4xl font-semibold tabular-nums text-[var(--exam-text)]" aria-label={phase === 'thinking' ? `${secondsLeft} seconds preparation remaining` : `${phase === 'recording' ? secondsLeft : question.responseSeconds} seconds answer time`}>{formatMinutesAndSeconds(['thinking', 'recording'].includes(phase) ? secondsLeft : question.responseSeconds)}</div>
      <canvas ref={canvasRef} width={320} height={36} aria-hidden="true" className={phase === 'recording' ? 'h-9 w-full max-w-xs' : 'hidden'} />
    </div>
    {error ? <p role="alert" className="mb-5 rounded-lg bg-red-50 p-4 text-sm leading-6 text-red-800">{error}</p> : null}
    {!['error', 'save-error', 'saving'].includes(phase) ? <button type="button" disabled={!canRecord && phase !== 'recording'} onClick={() => phase === 'recording' ? void completeAnswer() : void startRecording()} className="flex min-h-14 items-center justify-center gap-3 rounded-lg bg-[var(--exam-accent)] px-6 py-4 text-lg font-semibold text-white disabled:cursor-default disabled:opacity-50">
      {phase === 'recording' || phase === 'stopping' ? <Square size={18} fill="currentColor" /> : <Mic size={18} />}{phase === 'recording' || phase === 'stopping' ? 'Submit answer' : 'Record answer'}
    </button> : null}
    {phase === 'error' ? <button type="button" onClick={() => void interview.retryQuestion()} className="flex min-h-12 items-center justify-center gap-2 rounded-lg border border-[var(--exam-border)] px-6 py-3 font-semibold"><RotateCcw size={18} />Retry this question</button> : null}
    {phase === 'save-error' ? <button type="button" onClick={() => void interview.finishInterview()} className="flex min-h-12 items-center justify-center gap-2 rounded-lg bg-[var(--exam-accent)] px-6 py-3 font-semibold text-white"><RotateCcw size={18} />Retry processing interview</button> : null}
    {phase === 'answer-save-error' ? <button type="button" onClick={() => void completeAnswer()} className="rounded-lg border p-3">Retry saving this answer</button> : null}
    {!['saving', 'save-error'].includes(phase) ? <button type="button" disabled={!['recording', 'thinking', 'ready', 'error'].includes(phase)} onClick={() => void interview.completeAnswer(true)} className="mx-auto mt-4 inline-flex min-h-11 items-center gap-2 px-4 text-sm text-[var(--exam-text-muted)] disabled:opacity-40"><SkipForward size={15} />Skip question</button> : null}
    <p className="mt-4 text-center text-xs leading-5 text-[var(--exam-text-muted)]">{phase === 'saving' ? interview.transcriptionStatus || 'Saving your interview on this device…' : 'Press Space to record. Press it again to submit. The next question starts automatically.'}</p>
  </main>
}
