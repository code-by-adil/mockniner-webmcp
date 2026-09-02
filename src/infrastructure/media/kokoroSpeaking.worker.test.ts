import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  KokoroSpeakingWorkerRequest,
  KokoroSpeakingWorkerResponse,
} from './kokoroSpeaking.worker'

const mocked = vi.hoisted(() => ({ fromPretrained: vi.fn(), split: vi.fn(async () => ['Where do you live?']) }))
vi.mock('./kokoroScript', () => ({ splitKokoroSpeech: mocked.split }))

vi.mock('kokoro-js', () => ({
  KokoroTTS: { from_pretrained: mocked.fromPretrained },
}))

let handleMessage: ((event: MessageEvent<KokoroSpeakingWorkerRequest>) => void) | null
let posted: ReturnType<typeof vi.fn<(message: KokoroSpeakingWorkerResponse) => void>>

function request(id: string): void {
  handleMessage!({ data: { id, text: 'Where do you live?' } } as MessageEvent<KokoroSpeakingWorkerRequest>)
}

beforeEach(async () => {
  vi.resetModules()
  mocked.fromPretrained.mockReset()
  handleMessage = null
  posted = vi.fn<(message: KokoroSpeakingWorkerResponse) => void>()
  vi.stubGlobal('navigator', {
    gpu: { requestAdapter: vi.fn().mockResolvedValue({}) },
  })
  vi.stubGlobal('postMessage', posted)
  vi.stubGlobal('addEventListener', vi.fn((type, listener) => {
    if (type === 'message') handleMessage = listener as typeof handleMessage
  }))
  await import('./kokoroSpeaking.worker')
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Kokoro Speaking worker', () => {
  it('clears a failed model load so a later request can retry', async () => {
    const generatedAudio = { audio: new Float32Array([0, 0.2]), sampling_rate: 24000 }
    mocked.fromPretrained
      .mockRejectedValueOnce(new Error('Temporary model download failure.'))
      .mockResolvedValueOnce({
        generate: vi.fn().mockResolvedValue(generatedAudio),
      })

    request('first')
    await vi.waitFor(() => {
      expect(posted).toHaveBeenCalledWith({
        id: 'first',
        type: 'error',
        message: 'Temporary model download failure.',
      })
    })

    request('second')
    await vi.waitFor(() => {
      expect(posted).toHaveBeenCalledWith({ id: 'second', type: 'audio', audio: expect.any(Blob) })
    })
    expect(mocked.fromPretrained).toHaveBeenCalledTimes(2)
  })
})
