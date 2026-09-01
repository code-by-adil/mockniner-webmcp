import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  KokoroSpeakingWorkerRequest,
  KokoroSpeakingWorkerResponse,
} from './kokoroSpeaking.worker'

const mocked = vi.hoisted(() => ({ fromPretrained: vi.fn() }))

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
    const generatedAudio = new Blob([new Uint8Array([1])], { type: 'audio/wav' })
    mocked.fromPretrained
      .mockRejectedValueOnce(new Error('Temporary model download failure.'))
      .mockResolvedValueOnce({
        generate: vi.fn().mockResolvedValue({ toBlob: () => generatedAudio }),
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
      expect(posted).toHaveBeenCalledWith({ id: 'second', type: 'audio', audio: generatedAudio })
    })
    expect(mocked.fromPretrained).toHaveBeenCalledTimes(2)
  })
})
