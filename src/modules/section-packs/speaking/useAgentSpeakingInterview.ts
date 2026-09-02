import { useCallback, useEffect, useRef, useState } from 'react'
import type { CompleteSpeakingAttemptInput } from '@/application/attemptWriter'
import {
  AgentSpeakingTurnError,
  type AgentSpeakingTurnInput,
  type AgentSpeakingTurnResult,
} from '@/application/speakingInterview'
import type { SpeakingSubmission } from '@/domain/types'
import { KokoroSpeakingPlayer } from '@/infrastructure/media/kokoroSpeakingPlayer'
import { useSpeakingInterviewTool } from '@/webmcp/useSpeakingInterviewTool'
import {
  supportsSpeechTranscription,
  useSpeakingRecorder,
  type RecordedSpeakingResponse,
} from './useSpeakingRecorder'

const AGENT_SPEAKING_CONTENT_KEY = 'agent-speaking-interview-v1'

export type AgentSpeakingPhase =
  | 'setup'
  | 'waiting'
  | 'speaking'
  | 'ready'
  | 'recording'
  | 'review'
  | 'saving'
  | 'error'

type PendingAnswer = {
  resolve: (response: RecordedSpeakingResponse) => void
  reject: (error: unknown) => void
  cleanup: () => void
}

type Options = {
  onComplete: (input: CompleteSpeakingAttemptInput) => Promise<SpeakingSubmission>
}

function abortError(): DOMException {
  return new DOMException('The Speaking turn was cancelled.', 'AbortError')
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

export function useAgentSpeakingInterview({ onComplete }: Options) {
  const [phase, setPhase] = useState<AgentSpeakingPhase>('setup')
  const [examinerText, setExaminerText] = useState('')
  const [transcriptDraft, setTranscriptDraft] = useState('')
  const [capturedResponse, setCapturedResponse] = useState<RecordedSpeakingResponse | null>(null)
  const [completedTurns, setCompletedTurns] = useState(0)
  const [secondsLeft, setSecondsLeft] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [prepared, setPrepared] = useState(false)
  const [attemptStartedAt] = useState(() => new Date().toISOString())
  const playerRef = useRef<KokoroSpeakingPlayer | null>(null)
  const preparedRef = useRef(false)
  const busyRef = useRef(false)
  const mountedRef = useRef(true)
  const recordingsRef = useRef<CompleteSpeakingAttemptInput['recordings']>([])
  const pendingAnswerRef = useRef<PendingAnswer | null>(null)
  const activeTurnRef = useRef<AbortController | null>(null)
  const responseLimitRef = useRef(0)
  const {
    canvasRef,
    start: startRecorder,
    stop: stopRecorder,
    cancel: cancelRecorder,
  } = useSpeakingRecorder({ transcribe: true })

  const requirePlayer = useCallback(() => {
    const player = playerRef.current
    if (!player) throw new Error('The examiner audio player is not available.')
    return player
  }, [])

  const prepare = useCallback(async () => {
    setError(null)
    if (!supportsSpeechTranscription()) {
      setError('Agent interview requires Chrome speech recognition. Use a current Chrome browser or choose Standard practice.')
      return
    }
    try {
      const permissionStream = await navigator.mediaDevices.getUserMedia({ audio: true })
      permissionStream.getTracks().forEach((track) => track.stop())
      if (!mountedRef.current) return
      await requirePlayer().prepare()
      if (!mountedRef.current) return
      preparedRef.current = true
      setPrepared(true)
      setPhase('waiting')
    } catch (prepareError) {
      if (!mountedRef.current) return
      setError(
        prepareError instanceof Error
          ? prepareError.message
          : 'Microphone and audio setup failed.',
      )
      setPhase('error')
    }
  }, [requirePlayer])

  const waitForCandidate = useCallback((
    input: Extract<AgentSpeakingTurnInput, { finishInterview: false }>,
    signal: AbortSignal,
  ) => new Promise<RecordedSpeakingResponse>((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError())
      return
    }
    const handleAbort = () => {
      cleanup()
      pendingAnswerRef.current = null
      reject(abortError())
    }
    const cleanup = () => signal.removeEventListener('abort', handleAbort)
    signal.addEventListener('abort', handleAbort, { once: true })
    pendingAnswerRef.current = { resolve, reject, cleanup }
    responseLimitRef.current = input.responseTimeSeconds
    setSecondsLeft(input.responseTimeSeconds)
    setPhase('ready')
  }), [])

  const conductTurn = useCallback(async (
    input: AgentSpeakingTurnInput,
    toolSignal: AbortSignal,
  ): Promise<AgentSpeakingTurnResult> => {
    if (!preparedRef.current) {
      throw new AgentSpeakingTurnError(
        'SPEAKING_AUDIO_NOT_PREPARED',
        'Press Prepare microphone and audio in the Agent interview screen first.',
      )
    }
    if (busyRef.current) {
      throw new AgentSpeakingTurnError(
        'SPEAKING_TURN_IN_PROGRESS',
        'The current examiner turn is still in progress.',
      )
    }

    const turnController = new AbortController()
    const handleToolAbort = () => turnController.abort()
    const releaseCancellation = () => {
      toolSignal.removeEventListener('abort', handleToolAbort)
      if (activeTurnRef.current === turnController) activeTurnRef.current = null
    }
    if (toolSignal.aborted) turnController.abort()
    else toolSignal.addEventListener('abort', handleToolAbort, { once: true })
    activeTurnRef.current = turnController
    busyRef.current = true
    setError(null)
    setExaminerText(input.examinerText)
    setPhase('speaking')

    try {
      await requirePlayer().speak(input.examinerText, turnController.signal)

      if (input.finishInterview) {
        if (recordingsRef.current.length === 0) {
          throw new AgentSpeakingTurnError(
            'SPEAKING_NO_RESPONSES',
            'Ask at least one question and collect an answer before finishing the interview.',
          )
        }
        releaseCancellation()
        setPhase('saving')
        const submission = await onComplete({
          contentKey: AGENT_SPEAKING_CONTENT_KEY,
          startedAt: attemptStartedAt,
          recordings: recordingsRef.current,
        })
        return { status: 'interview_completed', submission }
      }

      const response = await waitForCandidate(input, turnController.signal)
      const sequence = recordingsRef.current.length
      recordingsRef.current.push({
        promptId: sequence + 1,
        partLabel: `Part ${input.part}`,
        sequence,
        promptText: input.examinerText,
        timeLimitSeconds: input.responseTimeSeconds,
        durationMs: response.durationMs,
        audio: response.audio,
        transcript: response.transcript,
      })
      const turnNumber = sequence + 1
      setCompletedTurns(turnNumber)
      setCapturedResponse(null)
      setTranscriptDraft('')
      setPhase('waiting')
      return {
        status: 'answer_received',
        turnNumber,
        part: input.part,
        transcript: response.transcript,
        durationMs: Math.round(response.durationMs),
      }
    } catch (turnError) {
      if (isAbortError(turnError)) {
        await cancelRecorder()
        if (mountedRef.current) {
          setCapturedResponse(null)
          setTranscriptDraft('')
          setPhase('waiting')
        }
      } else if (mountedRef.current) {
        setError(turnError instanceof Error ? turnError.message : 'The Speaking turn failed.')
        setPhase('error')
      }
      throw turnError
    } finally {
      releaseCancellation()
      busyRef.current = false
    }
  }, [attemptStartedAt, cancelRecorder, onComplete, requirePlayer, waitForCandidate])

  useSpeakingInterviewTool(conductTurn)

  useEffect(() => {
    mountedRef.current = true
    const player = new KokoroSpeakingPlayer()
    playerRef.current = player
    return () => {
      mountedRef.current = false
      activeTurnRef.current?.abort()
      activeTurnRef.current = null
      pendingAnswerRef.current?.cleanup()
      pendingAnswerRef.current?.reject(abortError())
      pendingAnswerRef.current = null
      if (playerRef.current === player) playerRef.current = null
      player.dispose()
    }
  }, [])

  const startRecording = useCallback(async () => {
    try {
      setError(null)
      await startRecorder()
      setPhase('recording')
    } catch (recordingError) {
      if (isAbortError(recordingError)) return
      setError(recordingError instanceof Error ? recordingError.message : 'Recording could not start.')
      setPhase('ready')
    }
  }, [startRecorder])

  const stopRecording = useCallback(async () => {
    const response = await stopRecorder()
    if (!response || response.audio.size === 0) {
      setError('No audio was captured. Check your microphone and try again.')
      setPhase('ready')
      return
    }
    setCapturedResponse(response)
    setTranscriptDraft(response.transcript)
    setPhase('review')
  }, [stopRecorder])

  useEffect(() => {
    if (phase !== 'recording') return
    const timer = window.setInterval(() => {
      setSecondsLeft((remaining) => Math.max(0, remaining - 1))
    }, 1_000)
    const stopTimer = window.setTimeout(
      () => void stopRecording(),
      responseLimitRef.current * 1_000,
    )
    return () => {
      window.clearInterval(timer)
      window.clearTimeout(stopTimer)
    }
  }, [phase, stopRecording])

  const approveTranscript = useCallback(() => {
    const pending = pendingAnswerRef.current
    if (!pending || !capturedResponse) return
    const transcript = transcriptDraft.trim()
    if (!transcript) {
      setError('Add the answer transcript before sending it to the agent.')
      return
    }
    pending.cleanup()
    pendingAnswerRef.current = null
    pending.resolve({ ...capturedResponse, transcript })
  }, [capturedResponse, transcriptDraft])

  const recordAgain = useCallback(() => {
    setCapturedResponse(null)
    setTranscriptDraft('')
    setError(null)
    setPhase('ready')
  }, [])

  return {
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
  }
}
