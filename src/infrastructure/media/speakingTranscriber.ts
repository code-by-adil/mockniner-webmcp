import type { TranscriptionReply, TranscriptionRequest } from './speakingTranscription.worker'

export function assertAudibleRecording(samples: Float32Array): void {
  if (samples.length < 1_600) throw new Error('The recording is too short. Please record your answer again.')
  // Reject digital silence before Whisper, which can invent words from silence.
  // This is an audibility check, not a claim to distinguish all noise from speech.
  let energy = 0
  for (const sample of samples) energy += sample * sample
  if (Math.sqrt(energy / samples.length) < 0.0001) {
    throw new Error('The microphone captured silence. Check your input device and record your answer again.')
  }
}

export class SpeakingTranscriber {
  private worker: Worker | null = null
  private pending: { reject: (error: Error) => void } | null = null
  private ready = false
  private disposed = false

  private request(request: TranscriptionRequest, onProgress?: (message: string) => void): Promise<TranscriptionReply> {
    if (this.disposed) return Promise.reject(new DOMException('Transcription was cancelled.', 'AbortError'))
    if (this.pending) return Promise.reject(new Error('Speech recognition is already busy.'))
    const worker = this.worker ??= new Worker(new URL('./speakingTranscription.worker.ts', import.meta.url), { type: 'module' })
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timeout)
        worker.removeEventListener('message', onMessage)
        worker.removeEventListener('error', onError)
        this.pending = null
      }
      const fail = (error: Error) => {
        cleanup()
        worker.terminate()
        this.worker = null
        this.ready = false
        reject(error)
      }
      const onMessage = (event: MessageEvent<TranscriptionReply>) => {
        const reply = event.data
        if (reply.id !== request.id) return
        if (reply.type === 'progress') { onProgress?.(reply.message); return }
        if (reply.type === 'error') { fail(new Error(reply.message)); return }
        cleanup()
        resolve(reply)
      }
      const onError = (event: ErrorEvent) => fail(new Error(event.message || 'Speech recognition stopped unexpectedly. Retry transcription.'))
      const timeout = setTimeout(() => fail(new Error('Speech recognition timed out. Your recording is still available; retry transcription.')), 180_000)
      this.pending = { reject: fail }
      worker.addEventListener('message', onMessage)
      worker.addEventListener('error', onError)
      try {
        if (request.type === 'transcribe') worker.postMessage(request, [request.samples.buffer])
        else worker.postMessage(request)
      } catch (error) { fail(error instanceof Error ? error : new Error('Speech recognition could not start.')) }
    })
  }

  async prepare(onProgress?: (message: string) => void): Promise<void> {
    if (this.ready && !this.disposed) return
    onProgress?.('Loading speech recognition on this device…')
    await this.request({ id: crypto.randomUUID(), type: 'prepare' }, onProgress)
    this.ready = true
  }

  private async decodeRecording(audio: Blob): Promise<Float32Array> {
    // decodeAudioData resamples to the context rate, as required by Whisper.
    const context = new OfflineAudioContext(1, 1, 16_000)
    const decoded = await context.decodeAudioData(await audio.arrayBuffer())
    const samples = new Float32Array(decoded.length)
    for (let channel = 0; channel < decoded.numberOfChannels; channel += 1) {
      const data = decoded.getChannelData(channel)
      for (let i = 0; i < samples.length; i += 1) samples[i] += data[i] / decoded.numberOfChannels
    }
    assertAudibleRecording(samples)
    return samples
  }

  async validateRecording(audio: Blob): Promise<void> {
    await this.decodeRecording(audio)
  }

  async transcribe(audio: Blob, onProgress?: (message: string) => void): Promise<string> {
    await this.prepare(onProgress)
    onProgress?.('Transcribing your answer on this device…')
    const samples = await this.decodeRecording(audio)
    const result = await this.request({ id: crypto.randomUUID(), type: 'transcribe', samples }, onProgress)
    if (result.type !== 'transcript' || !result.text.trim()) throw new Error('No speech was recognised. Please record your answer again.')
    return result.text.trim()
  }

  dispose(): void {
    this.disposed = true
    this.pending?.reject(new DOMException('Transcription was cancelled.', 'AbortError'))
    this.worker?.terminate()
    this.worker = null
    this.ready = false
  }
}
