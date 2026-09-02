import { useCallback, useEffect, useRef, useState } from 'react'
import { SpeakingTranscriber } from '@/infrastructure/media/speakingTranscriber'

export type RecordedSpeakingResponse = { audio: Blob; durationMs: number; transcript: string }
type ActiveCapture = {
  recorder: MediaRecorder
  stream: MediaStream
  context: AudioContext
  source: MediaStreamAudioSourceNode
  analyser: AnalyserNode
  response: Promise<RecordedSpeakingResponse>
  finishPromise: Promise<RecordedSpeakingResponse | null> | null
  cancelled: boolean
}
const abortError = () => new DOMException('Speaking recording was cancelled.', 'AbortError')

export function useSpeakingRecorder() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const activeRef = useRef<ActiveCapture | null>(null)
  const transcriberRef = useRef<SpeakingTranscriber | null>(null)
  const transcriptsRef = useRef(new WeakMap<Blob, string>())
  const startPromiseRef = useRef<Promise<void> | null>(null)
  const versionRef = useRef(0)
  const animationFrameRef = useRef<number | null>(null)
  const [transcriptionStatus, setTranscriptionStatus] = useState('')

  const requireTranscriber = useCallback(() => transcriberRef.current ??= new SpeakingTranscriber(), [])
  const prepare = useCallback(() => requireTranscriber().prepare(setTranscriptionStatus), [requireTranscriber])
  const release = useCallback((capture: ActiveCapture) => {
    if (animationFrameRef.current != null) cancelAnimationFrame(animationFrameRef.current)
    animationFrameRef.current = null
    capture.source.disconnect()
    capture.analyser.disconnect()
    capture.stream.getTracks().forEach((track) => track.stop())
    void capture.context.close()
    if (activeRef.current === capture) activeRef.current = null
  }, [])

  const transcribeRecordings = useCallback(async <T extends RecordedSpeakingResponse>(responses: T[], onTranscribed?: (response: T) => Promise<void>): Promise<T[]> => {
    const version = versionRef.current
    const completed: T[] = []
    for (const [index, response] of responses.entries()) {
      if (version !== versionRef.current) throw abortError()
      const prefix = `Answer ${index + 1} of ${responses.length}: `
      let transcript = response.transcript.trim() || transcriptsRef.current.get(response.audio)
      try {
        transcript ??= await requireTranscriber().transcribe(response.audio, (message) => setTranscriptionStatus(prefix + message))
        if (version !== versionRef.current) throw abortError()
        if (!transcript.trim()) throw new Error('No speech was recognised.')
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') throw error
        throw new Error(`${prefix}${error instanceof Error ? error.message : 'Transcription failed.'} Your completed recordings are saved on this device. Retry processing the interview.`)
      }
      transcriptsRef.current.set(response.audio, transcript)
      await onTranscribed?.({ ...response, transcript })
      completed.push({ ...response, transcript })
    }
    return completed
  }, [requireTranscriber])

  const finish = useCallback((capture: ActiveCapture) => {
    capture.finishPromise ??= (async () => {
      let response: RecordedSpeakingResponse
      try {
        if (capture.recorder.state !== 'inactive') capture.recorder.stop()
        response = await capture.response
      } finally { release(capture) }
      // Release the physical microphone before potentially lengthy inference.
      if (capture.cancelled) return null
      if (!response.audio.size) throw new Error('No audio was captured. Check your microphone and record again.')
      await requireTranscriber().validateRecording(response.audio)
      if (capture.cancelled) return null
      return response
    })()
    return capture.finishPromise
  }, [release, requireTranscriber])

  const start = useCallback(async () => {
    if (activeRef.current?.recorder.state === 'recording') return
    if (startPromiseRef.current) return startPromiseRef.current
    const version = ++versionRef.current
    const promise = (async () => {
      await prepare()
      if (version !== versionRef.current) throw abortError()
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (version !== versionRef.current) {
        stream.getTracks().forEach((track) => track.stop())
        throw abortError()
      }
      let context: AudioContext | null = null
      try {
        context = new AudioContext()
        if (context.state === 'suspended') await context.resume()
        if (version !== versionRef.current) throw abortError()
        const recorder = new MediaRecorder(stream)
        const chunks: Blob[] = []
        const analyser = context.createAnalyser()
        analyser.fftSize = 64
        const source = context.createMediaStreamSource(stream)
        source.connect(analyser)
        const startedAt = performance.now()
        let resolveResponse!: (response: RecordedSpeakingResponse) => void
        let rejectResponse!: (error: Error) => void
        const response = new Promise<RecordedSpeakingResponse>((resolve, reject) => { resolveResponse = resolve; rejectResponse = reject })
        // An asynchronous recorder error can arrive before the user presses Stop.
        void response.catch(() => undefined)
        recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data) }
        recorder.onstop = () => resolveResponse({
          audio: new Blob(chunks, { type: recorder.mimeType || chunks[0]?.type || 'audio/webm' }),
          durationMs: Math.max(0, performance.now() - startedAt),
          transcript: '',
        })
        recorder.onerror = () => rejectResponse(new Error('The browser could not record this answer.'))
        const capture: ActiveCapture = { recorder, stream, context, source, analyser, response, finishPromise: null, cancelled: false }
        recorder.start()
        activeRef.current = capture
        const frequencyData = new Uint8Array(analyser.frequencyBinCount)
        const draw = () => {
          if (recorder.state !== 'recording') return
          const canvas = canvasRef.current
          const canvasContext = canvas?.getContext('2d')
          if (canvas && canvasContext) {
            analyser.getByteFrequencyData(frequencyData)
            canvasContext.clearRect(0, 0, canvas.width, canvas.height)
            const width = canvas.width / frequencyData.length
            frequencyData.forEach((datum, i) => {
              canvasContext.fillStyle = '#D40000'
              const height = (datum / 255) * canvas.height
              canvasContext.fillRect(i * width, canvas.height - height, width - 2, height)
            })
          }
          animationFrameRef.current = requestAnimationFrame(draw)
        }
        draw()
      } catch (error) {
        stream.getTracks().forEach((track) => track.stop())
        void context?.close()
        throw error
      }
    })()
    startPromiseRef.current = promise
    try { await promise } finally { startPromiseRef.current = null }
  }, [prepare])

  const stop = useCallback(() => activeRef.current ? finish(activeRef.current) : Promise.resolve(null), [finish])
  const discard = useCallback(async () => {
    const capture = activeRef.current
    if (!capture) return
    capture.cancelled = true
    await finish(capture).catch(() => undefined)
  }, [finish])
  const cancel = useCallback(async () => {
    versionRef.current += 1
    transcriberRef.current?.dispose()
    transcriberRef.current = null
    transcriptsRef.current = new WeakMap()
    const capture = activeRef.current
    if (!capture) return
    capture.cancelled = true
    await finish(capture).catch(() => undefined)
  }, [finish])
  useEffect(() => () => { void cancel() }, [cancel])
  return { canvasRef, prepare, start, stop, discard, transcribeRecordings, transcriptionStatus, cancel }
}
