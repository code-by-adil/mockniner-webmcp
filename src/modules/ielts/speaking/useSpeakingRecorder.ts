import { useCallback, useEffect, useRef } from 'react'

type AudioContextConstructor = typeof AudioContext

export type RecordedSpeakingResponse = {
  audio: Blob
  durationMs: number
  transcript: string
}

type SpeechRecognitionAlternativeLike = { transcript: string }

type SpeechRecognitionResultLike = {
  0: SpeechRecognitionAlternativeLike
  isFinal: boolean
  length: number
}

type SpeechRecognitionEventLike = Event & {
  resultIndex: number
  results: ArrayLike<SpeechRecognitionResultLike>
}

type SpeechRecognitionLike = EventTarget & {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike

type ActiveCapture = {
  recorder: MediaRecorder
  stream: MediaStream
  context: AudioContext
  source: MediaStreamAudioSourceNode
  analyser: AnalyserNode
  recognition: SpeechRecognitionLike | null
  recognitionDone: Promise<void>
  response: Promise<RecordedSpeakingResponse>
  finishPromise: Promise<RecordedSpeakingResponse | null> | null
  cancelled: boolean
}

function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | null {
  const speechWindow = window as Window & {
    SpeechRecognition?: SpeechRecognitionConstructor
    webkitSpeechRecognition?: SpeechRecognitionConstructor
  }
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null
}

export function supportsSpeechTranscription(): boolean {
  return typeof window !== 'undefined' && getSpeechRecognitionConstructor() !== null
}

function getAudioContextConstructor(): AudioContextConstructor | null {
  return (
    window.AudioContext ||
    (window as { webkitAudioContext?: AudioContextConstructor }).webkitAudioContext ||
    null
  )
}

function abortError(): DOMException {
  return new DOMException('Speaking recording was cancelled.', 'AbortError')
}

export function useSpeakingRecorder({ transcribe = false }: { transcribe?: boolean } = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const activeRef = useRef<ActiveCapture | null>(null)
  const startPromiseRef = useRef<Promise<void> | null>(null)
  const startVersionRef = useRef(0)
  const animationFrameRef = useRef<number | null>(null)
  const transcriptRef = useRef('')

  const release = useCallback((capture: ActiveCapture) => {
    if (animationFrameRef.current != null) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }
    capture.source.disconnect()
    capture.analyser.disconnect()
    capture.stream.getTracks().forEach((track) => track.stop())
    void capture.context.close()
    if (activeRef.current === capture) activeRef.current = null
  }, [])

  const finish = useCallback((capture: ActiveCapture) => {
    capture.finishPromise ??= (async () => {
      try {
        if (capture.recognition) {
          if (capture.cancelled) capture.recognition.abort()
          else capture.recognition.stop()
        }
      } catch {
        try {
          capture.recognition?.abort()
        } catch {
          // Recognition may already have stopped between the state check and call.
        }
      }
      if (capture.recorder.state !== 'inactive') capture.recorder.stop()

      try {
        const [response] = await Promise.all([
          capture.response,
          capture.recognitionDone,
        ])
        if (capture.cancelled) return null
        return { ...response, transcript: transcriptRef.current.trim() }
      } finally {
        release(capture)
      }
    })()
    return capture.finishPromise
  }, [release])

  const start = useCallback(async () => {
    if (activeRef.current?.recorder.state === 'recording') return
    if (startPromiseRef.current) return startPromiseRef.current

    const startVersion = ++startVersionRef.current
    const startPromise = (async () => {
      const AudioContextClass = getAudioContextConstructor()
      if (!AudioContextClass) {
        throw new Error('AudioContext is not available in this browser.')
      }
      const SpeechRecognitionClass = transcribe
        ? getSpeechRecognitionConstructor()
        : null
      if (transcribe && !SpeechRecognitionClass) {
        throw new Error('Live speech transcription is unavailable in this browser.')
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (startVersion !== startVersionRef.current) {
        stream.getTracks().forEach((track) => track.stop())
        throw abortError()
      }
      let context: AudioContext | null = null
      let recognition: SpeechRecognitionLike | null = null
      try {
        context = new AudioContextClass()
        if (context.state === 'suspended') await context.resume()
        if (startVersion !== startVersionRef.current) throw abortError()
        const recorder = new MediaRecorder(stream)
        const chunks: Blob[] = []
        const startedAt = performance.now()
        const analyser = context.createAnalyser()
        analyser.fftSize = 64
        const source = context.createMediaStreamSource(stream)
        source.connect(analyser)
        transcriptRef.current = ''

        let resolveRecognition!: () => void
        const recognitionDone = new Promise<void>((resolve) => {
          resolveRecognition = resolve
        })
        if (SpeechRecognitionClass) {
          recognition = new SpeechRecognitionClass()
          recognition.continuous = true
          recognition.interimResults = true
          recognition.lang = 'en-GB'
          recognition.onresult = (event) => {
            for (let index = event.resultIndex; index < event.results.length; index += 1) {
              const result = event.results[index]
              if (result?.isFinal && result[0]?.transcript) {
                transcriptRef.current = `${transcriptRef.current} ${result[0].transcript}`.trim()
              }
            }
          }
          recognition.onend = resolveRecognition
          recognition.onerror = resolveRecognition
        } else {
          resolveRecognition()
        }

        let resolveResponse!: (response: RecordedSpeakingResponse) => void
        let rejectResponse!: (error: Error) => void
        const response = new Promise<RecordedSpeakingResponse>((resolve, reject) => {
          resolveResponse = resolve
          rejectResponse = reject
        })
        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) chunks.push(event.data)
        }
        recorder.onstop = () => resolveResponse({
          audio: new Blob(chunks, {
            type: recorder.mimeType || chunks[0]?.type || 'audio/webm',
          }),
          durationMs: Math.max(0, performance.now() - startedAt),
          transcript: transcriptRef.current.trim(),
        })
        recorder.onerror = () => rejectResponse(new Error('The browser could not record this answer.'))

        const capture: ActiveCapture = {
          recorder,
          stream,
          context,
          source,
          analyser,
          recognition,
          recognitionDone,
          response,
          finishPromise: null,
          cancelled: false,
        }
        recognition?.start()
        recorder.start()
        activeRef.current = capture

        const frequencyData = new Uint8Array(analyser.frequencyBinCount)
        const drawVisualizer = () => {
          const canvas = canvasRef.current
          const canvasContext = canvas?.getContext('2d')
          if (!canvas || !canvasContext || recorder.state !== 'recording') return

          analyser.getByteFrequencyData(frequencyData)
          canvasContext.clearRect(0, 0, canvas.width, canvas.height)
          const barWidth = (canvas.width / frequencyData.length) * 2.5
          let x = 0
          frequencyData.forEach((datum, index) => {
            const barHeight = datum / 2
            const red = barHeight + 25 * (index / frequencyData.length)
            const green = 250 * (index / frequencyData.length)
            canvasContext.fillStyle = `rgb(${red},${green},50)`
            canvasContext.fillRect(x, canvas.height - barHeight, barWidth, barHeight)
            x += barWidth + 1
          })
          animationFrameRef.current = requestAnimationFrame(drawVisualizer)
        }
        drawVisualizer()
      } catch (error) {
        recognition?.abort()
        stream.getTracks().forEach((track) => track.stop())
        void context?.close()
        throw error
      }
    })()

    startPromiseRef.current = startPromise
    try {
      await startPromise
    } finally {
      startPromiseRef.current = null
    }
  }, [transcribe])

  const stop = useCallback((): Promise<RecordedSpeakingResponse | null> => {
    const capture = activeRef.current
    return capture ? finish(capture) : Promise.resolve(null)
  }, [finish])

  const cancel = useCallback(async (): Promise<void> => {
    startVersionRef.current += 1
    const capture = activeRef.current
    if (!capture) return
    capture.cancelled = true
    await finish(capture).catch(() => undefined)
    transcriptRef.current = ''
  }, [finish])

  useEffect(() => () => {
    void cancel()
  }, [cancel])

  return { canvasRef, start, stop, cancel }
}
