import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  KokoroSpeakingWorkerRequest,
  KokoroSpeakingWorkerResponse,
} from './kokoroSpeaking.worker'
import { KokoroSpeakingPlayer } from './kokoroSpeakingPlayer'

class FakeWorker extends EventTarget {
  static instances: FakeWorker[] = []
  readonly requests: KokoroSpeakingWorkerRequest[] = []
  terminated = false

  constructor() {
    super()
    FakeWorker.instances.push(this)
  }

  postMessage(request: KokoroSpeakingWorkerRequest): void {
    this.requests.push(request)
  }

  terminate(): void {
    this.terminated = true
  }

  respond(response: KokoroSpeakingWorkerResponse): void {
    const event = new Event('message')
    Object.defineProperty(event, 'data', { value: response })
    this.dispatchEvent(event)
  }
}

class FakeSource {
  buffer: AudioBuffer | null = null
  onended: (() => void) | null = null
  started = false
  stopped = false

  connect(): void {}

  start(): void {
    this.started = true
  }

  stop(): void {
    this.stopped = true
    this.onended?.()
  }

  end(): void {
    this.onended?.()
  }
}

class FakeAudioContext {
  static instances: FakeAudioContext[] = []
  state = 'running'
  destination = {}
  readonly sources: FakeSource[] = []
  decodeAudioData = vi.fn(async () => ({}) as AudioBuffer)
  close = vi.fn(async () => undefined)
  resume = vi.fn(async () => undefined)

  constructor() {
    FakeAudioContext.instances.push(this)
  }

  createBufferSource(): FakeSource {
    const source = new FakeSource()
    this.sources.push(source)
    return source
  }
}

function workerRequest(worker: FakeWorker): KokoroSpeakingWorkerRequest {
  const request = worker.requests[0]
  if (!request) throw new Error('Expected a worker request.')
  return request
}

beforeEach(() => {
  FakeWorker.instances = []
  FakeAudioContext.instances = []
  vi.stubGlobal('window', { AudioContext: FakeAudioContext })
  vi.stubGlobal('Worker', FakeWorker)
})

describe('Kokoro Speaking player lifecycle', () => {
  it('rejects pending generation when disposed', async () => {
    const player = new KokoroSpeakingPlayer()
    const speaking = player.speak('Where do you live?', new AbortController().signal)
    const rejection = speaking.catch((error: unknown) => error)
    await vi.waitFor(() => expect(FakeWorker.instances[0]?.requests).toHaveLength(1))

    player.dispose()

    await expect(rejection).resolves.toMatchObject({ name: 'AbortError' })
    expect(FakeWorker.instances[0]?.terminated).toBe(true)
  })

  it('cancels waiting playback without throwing away prepared audio or reloading the model', async () => {
    const player = new KokoroSpeakingPlayer()
    const controller = new AbortController()
    const speaking = player.speak('First question', controller.signal)
    const rejection = speaking.catch((error: unknown) => error)
    const worker = FakeWorker.instances[0]!
    await vi.waitFor(() => expect(worker.requests).toHaveLength(1))
    controller.abort()
    await expect(rejection).resolves.toMatchObject({ name: 'AbortError' })
    expect(FakeWorker.instances).toHaveLength(1)
    worker.respond({ id: worker.requests[0]!.id, type: 'audio', audio: new Blob(['audio']) })
    await player.prepareAudio('First question')
    const resumed = player.speak('First question', new AbortController().signal)
    await vi.waitFor(() => expect(FakeAudioContext.instances[0]?.sources).toHaveLength(1))
    expect(worker.requests).toHaveLength(1)
    FakeAudioContext.instances[0]!.sources[0]!.end()
    await resumed
    player.dispose()
  })

  it('prepares questions serially ahead of playback and reuses decoded buffers', async () => {
    const player = new KokoroSpeakingPlayer()
    const first = player.prepareAudio('First')
    const second = player.prepareAudio('Second')
    const worker = FakeWorker.instances[0]!
    await vi.waitFor(() => expect(worker.requests).toHaveLength(1))
    worker.respond({ id: worker.requests[0]!.id, type: 'audio', audio: new Blob(['first']) })
    await vi.waitFor(() => expect(worker.requests).toHaveLength(2))
    const playback = player.speak('First', new AbortController().signal)
    await vi.waitFor(() => expect(FakeAudioContext.instances[0]?.sources).toHaveLength(1))
    // The second question is still generating while the first plays.
    expect(worker.requests).toHaveLength(2)
    worker.respond({ id: worker.requests[1]!.id, type: 'audio', audio: new Blob(['second']) })
    await Promise.all([first, second])
    FakeAudioContext.instances[0]!.sources[0]!.end()
    await playback
    expect(FakeAudioContext.instances[0]!.decodeAudioData).toHaveBeenCalledTimes(2)
    player.dispose()
  })

  it('retries a failed current question without keeping its rejected preparation cached', async () => {
    const player = new KokoroSpeakingPlayer()
    const worker = FakeWorker.instances[0]!
    const first = player.prepareAudio('Current question').catch(error => error)
    await vi.waitFor(() => expect(worker.requests).toHaveLength(1))
    worker.respond({ id: worker.requests[0]!.id, type: 'error', message: 'Generation failed.' })
    await expect(first).resolves.toMatchObject({ message: 'Generation failed.' })

    const retried = player.prepareAudio('Current question')
    await vi.waitFor(() => expect(worker.requests).toHaveLength(2))
    expect(worker.requests.map(request => request.text)).toEqual(['Current question', 'Current question'])
    worker.respond({ id: worker.requests[1]!.id, type: 'audio', audio: new Blob(['retried audio']) })
    await retried
    expect(FakeAudioContext.instances[0]!.decodeAudioData).toHaveBeenCalledOnce()
    player.dispose()
  })

  it('rejects active playback instead of resolving it during disposal', async () => {
    const player = new KokoroSpeakingPlayer()
    const speaking = player.speak('Tell me about your hometown.', new AbortController().signal)
    const result = speaking.catch((error: unknown) => error)
    const worker = FakeWorker.instances[0]!
    await vi.waitFor(() => expect(worker.requests).toHaveLength(1))
    const request = workerRequest(worker)
    worker.respond({ id: request.id, type: 'audio', audio: new Blob([new Uint8Array([1])]) })
    await vi.waitFor(() => expect(FakeAudioContext.instances[0]?.sources).toHaveLength(1))

    player.dispose()

    await expect(result).resolves.toMatchObject({ name: 'AbortError' })
    expect(FakeAudioContext.instances[0]!.sources[0]!.stopped).toBe(true)
  })

  it('does not start playback when cancellation happens during decoding', async () => {
    let finishDecode!: (buffer: AudioBuffer) => void
    const decoding = new Promise<AudioBuffer>((resolve) => {
      finishDecode = resolve
    })
    const player = new KokoroSpeakingPlayer()
    const controller = new AbortController()
    const speaking = player.speak('A question', controller.signal)
    const result = speaking.catch((error: unknown) => error)
    const worker = FakeWorker.instances[0]!
    await vi.waitFor(() => expect(worker.requests).toHaveLength(1))
    const context = FakeAudioContext.instances[0]!
    context.decodeAudioData = vi.fn(() => decoding)
    const request = workerRequest(worker)
    worker.respond({ id: request.id, type: 'audio', audio: new Blob([new Uint8Array([1])]) })
    await vi.waitFor(() => expect(context.decodeAudioData).toHaveBeenCalledOnce())

    controller.abort()
    finishDecode({} as AudioBuffer)

    await expect(result).resolves.toMatchObject({ name: 'AbortError' })
    expect(context.sources).toHaveLength(0)
    player.dispose()
  })
})
