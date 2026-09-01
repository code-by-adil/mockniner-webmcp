import type {
  KokoroSpeakingWorkerRequest,
  KokoroSpeakingWorkerResponse,
} from './kokoroSpeaking.worker'

type AudioContextConstructor = typeof AudioContext

type ActivePlayback = {
  source: AudioBufferSourceNode
  cancel: (error: Error) => void
}

function getAudioContextConstructor(): AudioContextConstructor | null {
  return (
    window.AudioContext ||
    (window as { webkitAudioContext?: AudioContextConstructor }).webkitAudioContext ||
    null
  )
}

function abortError(): DOMException {
  return new DOMException('The Speaking turn was cancelled.', 'AbortError')
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw abortError()
}

export class KokoroSpeakingPlayer {
  private worker: Worker | null
  private context: AudioContext | null = null
  private activePlayback: ActivePlayback | null = null
  private cancelGeneration: ((error: Error) => void) | null = null
  private speaking = false
  private disposed = false

  constructor() {
    this.worker = this.createWorker()
  }

  private createWorker(): Worker {
    return new Worker(
      new URL('./kokoroSpeaking.worker.ts', import.meta.url),
      { type: 'module' },
    )
  }

  private requireWorker(): Worker {
    if (this.disposed || !this.worker) {
      throw new Error('The examiner audio player has been disposed.')
    }
    return this.worker
  }

  async prepare(): Promise<void> {
    if (this.disposed) throw new Error('The examiner audio player has been disposed.')
    const AudioContextClass = getAudioContextConstructor()
    if (!AudioContextClass) {
      throw new Error('Audio playback is unavailable in this browser.')
    }
    this.context ??= new AudioContextClass()
    if (this.context.state === 'suspended') await this.context.resume()
  }

  async speak(text: string, signal: AbortSignal): Promise<void> {
    if (this.speaking) throw new Error('The examiner is already speaking.')
    this.speaking = true
    try {
      throwIfAborted(signal)
      await this.prepare()
      throwIfAborted(signal)
      const context = this.context
      if (!context) throw new Error('Audio playback was not prepared.')

      const blob = await this.generate(text, signal)
      throwIfAborted(signal)
      const encodedAudio = await blob.arrayBuffer()
      throwIfAborted(signal)
      const buffer = await context.decodeAudioData(encodedAudio)
      throwIfAborted(signal)
      await this.play(context, buffer, signal)
    } finally {
      this.speaking = false
    }
  }

  private generate(text: string, signal: AbortSignal): Promise<Blob> {
    throwIfAborted(signal)
    const worker = this.requireWorker()
    const id = crypto.randomUUID()

    return new Promise<Blob>((resolve, reject) => {
      let settled = false
      const cleanup = () => {
        signal.removeEventListener('abort', handleAbort)
        worker.removeEventListener('message', handleMessage)
        worker.removeEventListener('error', handleWorkerError)
        if (this.cancelGeneration === cancel) this.cancelGeneration = null
      }
      const finish = (result: { audio: Blob } | { error: Error }) => {
        if (settled) return
        settled = true
        cleanup()
        if ('error' in result) reject(result.error)
        else resolve(result.audio)
      }
      const replaceWorker = () => {
        worker.terminate()
        if (this.worker === worker) {
          this.worker = this.disposed ? null : this.createWorker()
        }
      }
      const cancel = (error: Error) => {
        finish({ error })
        replaceWorker()
      }
      const handleAbort = () => cancel(abortError())
      const handleWorkerError = (event: ErrorEvent) => {
        cancel(new Error(event.message || 'The Kokoro worker stopped unexpectedly.'))
      }
      const handleMessage = (event: MessageEvent<KokoroSpeakingWorkerResponse>) => {
        if (event.data.id !== id) return
        if (event.data.type === 'error') finish({ error: new Error(event.data.message) })
        else finish({ audio: event.data.audio })
      }

      this.cancelGeneration = cancel
      signal.addEventListener('abort', handleAbort, { once: true })
      worker.addEventListener('message', handleMessage)
      worker.addEventListener('error', handleWorkerError)
      const request: KokoroSpeakingWorkerRequest = { id, text }
      worker.postMessage(request)
    })
  }

  private play(
    context: AudioContext,
    buffer: AudioBuffer,
    signal: AbortSignal,
  ): Promise<void> {
    throwIfAborted(signal)
    return new Promise<void>((resolve, reject) => {
      let settled = false
      const source = context.createBufferSource()
      const cleanup = () => {
        signal.removeEventListener('abort', handleAbort)
        source.onended = null
        if (this.activePlayback?.source === source) this.activePlayback = null
      }
      const finish = (error?: Error) => {
        if (settled) return
        settled = true
        cleanup()
        if (error) reject(error)
        else resolve()
      }
      const cancel = (error: Error) => {
        source.onended = null
        try {
          source.stop()
        } catch {
          // The source may already have ended between cancellation and cleanup.
        }
        finish(error)
      }
      const handleAbort = () => cancel(abortError())

      source.buffer = buffer
      source.connect(context.destination)
      source.onended = () => finish()
      this.activePlayback = { source, cancel }
      signal.addEventListener('abort', handleAbort, { once: true })
      try {
        source.start()
      } catch (error) {
        finish(error instanceof Error ? error : new Error('Examiner audio playback failed.'))
      }
    })
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.cancelGeneration?.(abortError())
    this.cancelGeneration = null
    this.activePlayback?.cancel(abortError())
    this.activePlayback = null
    this.worker?.terminate()
    this.worker = null
    void this.context?.close()
    this.context = null
  }
}
