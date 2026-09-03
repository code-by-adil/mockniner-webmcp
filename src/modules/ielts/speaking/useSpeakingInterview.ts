import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CompleteSpeakingAttemptInput, SpeakingRecordingInput } from '@/application/attemptWriter'
import type { BindSpeakingInterview, SpeakingDiagnostics } from '@/application/speakingInterviewController'
import { ApplicationError } from '@/domain/errors'
import { defaultSpeakingPlan, speakingQuestionText, type SpeakingPlan } from '@/domain/speakingPlan'
import { KokoroSpeakingPlayer } from '@/infrastructure/media/kokoroSpeakingPlayer'
import { useSpeakingRecorder } from './useSpeakingRecorder'
import { draftSaves } from '@/infrastructure/saveCoordinator'
import { loadDraftRecordings, saveDraftRecording } from '@/infrastructure/database/speakingDraftRepository'
const getLocalDatabase = async () => (await import('@/infrastructure/database/client')).getLocalDatabase()

export type SpeakingPhase = 'loading' | 'load-error' | 'setup' | 'preparing' | 'buffering' | 'speaking' | 'thinking' | 'ready' | 'starting' | 'recording' | 'stopping' | 'saving' | 'error' | 'save-error' | 'answer-save-error'

export function useSpeakingInterview({ bindSpeakingInterview, onComplete, initialPlan, onConfigurePlan, attemptId, attemptStartedAt }: {
  bindSpeakingInterview: BindSpeakingInterview
  onComplete: (input: CompleteSpeakingAttemptInput) => Promise<unknown>
  initialPlan?: SpeakingPlan
  onConfigurePlan: (plan: SpeakingPlan) => void | Promise<void>
  attemptId?: string
  attemptStartedAt?: string
}) {
  const [plan, setPlan] = useState<SpeakingPlan>(initialPlan ?? defaultSpeakingPlan)
  const [phase, setPhaseState] = useState<SpeakingPhase>(attemptId ? 'loading' : 'setup')
  const [index, setIndex] = useState(0)
  const [secondsLeft, setSecondsLeft] = useState(0)
  const [diagnostics, setDiagnosticsState] = useState<SpeakingDiagnostics>({ preparationStage: null, error: null, recoveryAction: null })
  const diagnosticsRef = useRef(diagnostics)
  const [recorded, setRecorded] = useState(0)
  const phaseRef = useRef(phase)
  const planRef = useRef(plan)
  const indexRef = useRef(0)
  const responses = useRef<SpeakingRecordingInput[]>([])
  const startedAt = useRef(attemptStartedAt ?? '')
  const pendingResponse = useRef<SpeakingRecordingInput | null>(null)
  const player = useRef<KokoroSpeakingPlayer | null>(null)
  const mounted = useRef(true)
  const operation = useRef<AbortController | null>(null)
  const stopping = useRef(false)
  const saving = useRef(false)
  const deadline = useRef(0)
  const recorder = useSpeakingRecorder()
  const latest = useRef(recorder)
  useLayoutEffect(() => { latest.current = recorder }, [recorder])

  const updateDiagnostics = useCallback((patch: Partial<SpeakingDiagnostics>) => {
    diagnosticsRef.current = { ...diagnosticsRef.current, ...patch }
    if (mounted.current) setDiagnosticsState(diagnosticsRef.current)
  }, [])
  const setError = useCallback((error: string | null, recoveryAction: string | null = null) => {
    updateDiagnostics({ preparationStage: null, error, recoveryAction })
  }, [updateDiagnostics])

  const setPhase = useCallback((next: SpeakingPhase) => {
    phaseRef.current = next
    if (mounted.current) setPhaseState(next)
  }, [])
  const persistResponse = useCallback(async (response: SpeakingRecordingInput) => {
    if (!attemptId) return
    await draftSaves.flush()
    await saveDraftRecording(await getLocalDatabase(), attemptId, response)
  }, [attemptId])
  useEffect(() => {
    if (!attemptId) return
    let cancelled = false
    void draftSaves.flush().then(getLocalDatabase).then(db => loadDraftRecordings(db, attemptId)).then(saved => {
      if (cancelled) return
      responses.current = saved
      const nextIndex = Math.min(saved.length, planRef.current.questions.length - 1)
      indexRef.current = nextIndex
      setIndex(nextIndex)
      setRecorded(saved.length)
      setPhase('setup')
    }).catch(reason => { if (!cancelled) { setError(String(reason), 'Export your local data before attempting recovery of the saved interview.'); setPhase('load-error') } })
    return () => { cancelled = true }
  }, [attemptId, setPhase, setError])
  const timedPhase = useCallback((next: SpeakingPhase, seconds: number) => {
    deadline.current = performance.now() + seconds * 1000
    setSecondsLeft(seconds)
    setPhase(next)
  }, [setPhase])

  useEffect(() => {
    mounted.current = true
    player.current = new KokoroSpeakingPlayer()
    return () => {
      mounted.current = false
      operation.current?.abort()
      player.current?.dispose()
      player.current = null
    }
  }, [])

  useEffect(() => bindSpeakingInterview({
    configure(next) {
      if (phaseRef.current !== 'setup' || responses.current.length) throw new ApplicationError('SPEAKING_ALREADY_STARTED', 'The question set is locked. Finish or exit this interview before installing another.', true)
      // Save first: failed persistence must not update the UI or report success.
      const saved = onConfigurePlan(next)
      const apply = () => { planRef.current = next; setPlan(next); setError(null) }
      if (saved) {
        updateDiagnostics({ preparationStage: 'saving_plan', error: null, recoveryAction: null })
        setPhase('preparing')
        return saved.then(apply).finally(() => { updateDiagnostics({ preparationStage: null }); setPhase('setup') })
      }
      apply()
    },
    read: () => ({
      ...diagnosticsRef.current,
      contentKey: planRef.current.contentKey, title: planRef.current.title,
      phase: phaseRef.current, currentQuestion: indexRef.current + 1,
      part: planRef.current.questions[indexRef.current]?.part,
      secondsRemaining: ['thinking', 'recording'].includes(phaseRef.current)
        ? Math.max(0, Math.ceil((deadline.current - performance.now()) / 1000)) : null,
      totalQuestions: planRef.current.questions.length,
      recordedAnswers: responses.current.filter(r => r.status === 'answered').length,
      skippedAnswers: responses.current.filter(r => r.status === 'skipped').length,
      answersSaved: Boolean(attemptId) && !pendingResponse.current,
    }),
  }), [bindSpeakingInterview, onConfigurePlan, attemptId, setPhase, setError, updateDiagnostics])

  useEffect(() => {
    if (attemptId ? !['recording', 'starting', 'stopping', 'answer-save-error'].includes(phase) : phase === 'setup') return
    const protectDraft = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', protectDraft)
    return () => window.removeEventListener('beforeunload', protectDraft)
  }, [phase, attemptId])

  const startRecording = useCallback(async () => {
    if (!['thinking', 'ready'].includes(phaseRef.current)) return
    setError(null)
    setPhase('starting')
    try {
      await latest.current.start()
      if (!mounted.current) return
      timedPhase('recording', planRef.current.questions[indexRef.current]!.responseSeconds)
    } catch (reason) {
      if (!mounted.current) return
      setError(reason instanceof Error ? reason.message : 'Could not start the microphone. Retry this answer.', 'Check microphone access, then select Retry this question and Record answer.')
      setPhase('error')
    }
  }, [setPhase, timedPhase, setError])

  const playQuestion = useCallback(async (nextIndex: number) => {
    operation.current?.abort()
    const controller = new AbortController()
    operation.current = controller
    indexRef.current = nextIndex
    setIndex(nextIndex)
    setError(null)
    setPhase('buffering')
    const question = planRef.current.questions[nextIndex]!
    try {
      await player.current!.speak(speakingQuestionText(question), controller.signal, () => {
        performance.mark('speaking:question-audio-started')
        setPhase('speaking')
      })
      if (!mounted.current || controller.signal.aborted) return
      if (question.preparationSeconds) timedPhase('thinking', question.preparationSeconds)
      else setPhase('ready')
    } catch (reason) {
      if (!mounted.current || controller.signal.aborted) return
      setError(reason instanceof Error ? reason.message : 'Could not play this question. Retry audio.', 'Select Retry this question to prepare and play its audio again.')
      setPhase('error')
    }
  }, [setPhase, timedPhase, setError])

  const finishInterview = useCallback(async () => {
    if (saving.current) return
    saving.current = true
    performance.mark('speaking:transcription-started')
    setPhase('saving')
    setError(null)
    try {
      const answered = responses.current.filter(r => r.status === 'answered').map(r => ({ ...r, audio: r.audio! }))
      const transcribed = await latest.current.transcribeRecordings(answered, async response => {
        await persistResponse(response)
        responses.current[response.sequence] = response
      })
      performance.mark('speaking:transcription-finished')
      if (!mounted.current) return
      const byId = new Map(transcribed.map(r => [r.promptId, r]))
      await onComplete({
        contentKey: planRef.current.contentKey, startedAt: startedAt.current,
        recordings: responses.current.map(r => byId.get(r.promptId) ?? r),
      })
    } catch (reason) {
      if (!mounted.current) return
      setError(reason instanceof Error ? reason.message : 'Could not save the interview. Your recordings are still in this tab.', 'Select Retry processing interview. Your saved answers will be reused.')
      setPhase('save-error')
    } finally { saving.current = false }
  }, [onComplete, setPhase, persistResponse, setError])

  const completeAnswer = useCallback(async (skip = false) => {
    if (stopping.current || !(skip ? ['recording', 'thinking', 'ready', 'error'] : ['recording', 'answer-save-error']).includes(phaseRef.current)) return
    stopping.current = true
    setError(null)
    operation.current?.abort()
    setPhase('stopping')
    performance.mark('speaking:answer-finished')
    try {
      const response = pendingResponse.current ?? (skip ? (await latest.current.discard(), null) : await latest.current.stop())
      if (!mounted.current) return
      if (!skip && !response) throw new Error('No answer was recorded. Please try this question again.')
      const question = planRef.current.questions[indexRef.current]!
      const recording: SpeakingRecordingInput = pendingResponse.current ?? {
        promptId: question.id, partLabel: `Part ${question.part}`, sequence: indexRef.current,
        promptText: speakingQuestionText(question), timeLimitSeconds: question.responseSeconds,
        status: skip ? 'skipped' : 'answered', audio: response?.audio ?? null,
        durationMs: response?.durationMs ?? 0, transcript: '',
      }
      pendingResponse.current = recording
      await persistResponse(recording)
      pendingResponse.current = null
      responses.current.push(recording)
      setRecorded(responses.current.length)
      if (indexRef.current + 1 === planRef.current.questions.length) await finishInterview()
      else await playQuestion(indexRef.current + 1)
    } catch (reason) {
      if (!mounted.current) return
      setError(reason instanceof Error ? reason.message : 'Could not save this answer. Record it again.', pendingResponse.current ? 'Select Retry saving this answer. The recording is retained for retry.' : 'Select Retry this question, then record your answer again.')
      setPhase(pendingResponse.current ? 'answer-save-error' : 'error')
    } finally { stopping.current = false }
  }, [finishInterview, playQuestion, setPhase, persistResponse, setError])

  const finishAnswerRef = useRef(completeAnswer)
  useLayoutEffect(() => { finishAnswerRef.current = completeAnswer }, [completeAnswer])
  useEffect(() => {
    if (!['thinking', 'recording'].includes(phase)) return
    const timer = window.setInterval(() => {
      const remaining = Math.max(0, Math.ceil((deadline.current - performance.now()) / 1000))
      setSecondsLeft(remaining)
      if (remaining === 0) {
        clearInterval(timer)
        if (phase === 'recording') void finishAnswerRef.current()
        else setPhase('ready')
      }
    }, 100)
    return () => clearInterval(timer)
  }, [phase, setPhase])

  const start = useCallback(async () => {
    if (phaseRef.current !== 'setup') return
    setPhase('preparing')
    setError(null)
    updateDiagnostics({ preparationStage: 'saving_plan' })
    startedAt.current ||= new Date().toISOString()
    performance.mark('speaking:setup-started')
    try {
      await onConfigurePlan(planRef.current)
      if (!mounted.current) return
      if (responses.current.length === planRef.current.questions.length) { await finishInterview(); return }
      // Request permission on the Start gesture. Do not record the examiner.
      updateDiagnostics({ preparationStage: 'microphone_access', recoveryAction: 'Check the browser microphone permission request to continue.' })
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach(track => track.stop())
      if (!mounted.current) return
      updateDiagnostics({ preparationStage: 'voice_and_recognition', recoveryAction: null })
      const texts = planRef.current.questions.map(speakingQuestionText)
      player.current!.preload(texts)
      // Prepare recognition and the first question concurrently. Remaining
      // questions keep generating without blocking the interview.
      await Promise.all([latest.current.prepare(), player.current!.prepareAudio(texts[responses.current.length]!)])
      if (mounted.current) { performance.mark('speaking:setup-finished'); await playQuestion(responses.current.length) }
    } catch (reason) {
      if (!mounted.current) return
      const stage = diagnosticsRef.current.preparationStage
      const recovery = stage === 'microphone_access'
        ? 'Check microphone access in browser and device settings, then select Start interview or Resume interview.'
        : stage === 'voice_and_recognition'
          ? 'Check your connection for the first-time speech model download, then select Start interview or Resume interview.'
          : 'Retry Start interview or Resume interview. If saving still fails, export your local data before recovery.'
      setError(reason instanceof Error ? reason.message : 'Could not prepare the interview.', recovery)
      setPhase('setup')
    }
  }, [playQuestion, setPhase, onConfigurePlan, finishInterview, setError, updateDiagnostics])

  return {
    plan, phase, index, secondsLeft, ...diagnostics, recorded, start, completeAnswer,
    retryQuestion: () => playQuestion(indexRef.current), startRecording, finishInterview,
    canvasRef: recorder.canvasRef, transcriptionStatus: recorder.transcriptionStatus,
  }
}
