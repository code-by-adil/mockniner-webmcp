import { afterEach, describe, expect, it, vi } from 'vitest'
import { assertAudibleRecording, SpeakingTranscriber } from './speakingTranscriber'
import type { TranscriptionReply, TranscriptionRequest } from './speakingTranscription.worker'

class FakeWorker extends EventTarget {
  static instances: FakeWorker[] = []
  requests: TranscriptionRequest[] = []
  terminate = vi.fn()
  constructor() { super(); FakeWorker.instances.push(this) }
  postMessage(request: TranscriptionRequest) { this.requests.push(request) }
  reply(reply: Omit<TranscriptionReply, 'id'> & { text?: string; message?: string }) {
    const event = new Event('message')
    Object.defineProperty(event, 'data', { value: { ...reply, id: this.requests.at(-1)!.id } })
    this.dispatchEvent(event)
  }
}
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); FakeWorker.instances = [] })
describe('local Speaking transcription', () => {
  it('rejects silence and short audio without feeding it to recognition', () => {
    expect(() => assertAudibleRecording(new Float32Array(16000))).toThrow('silence')
    expect(() => assertAudibleRecording(new Float32Array(100))).toThrow('short')
    expect(() => assertAudibleRecording(new Float32Array(16000).fill(0.01))).not.toThrow()
  })
  it('prepares once, decodes to 16k mono, and returns only the actual recognised text', async () => {
    vi.stubGlobal('Worker', FakeWorker)
    const decode = vi.fn(async () => ({ length: 16000, numberOfChannels: 2,
      getChannelData: (channel: number) => new Float32Array(16000).fill(channel === 0 ? 0.1 : 0.2) }))
    const constructor = vi.fn()
    vi.stubGlobal('OfflineAudioContext', class { constructor(...args: unknown[]) { constructor(...args) }; decodeAudioData = decode })
    const service = new SpeakingTranscriber()
    const preparing = service.prepare()
    const worker = FakeWorker.instances[0]!
    worker.reply({ type: 'ready' }); await preparing
    await service.prepare()
    expect(worker.requests).toHaveLength(1)
    const result = service.transcribe(new Blob(['actual recording']))
    await vi.waitFor(() => expect(worker.requests).toHaveLength(2))
    expect(constructor).toHaveBeenCalledWith(1, 1, 16000)
    const request = worker.requests[1]!
    expect(request.type).toBe('transcribe')
    if (request.type === 'transcribe') expect(request.samples[0]).toBeCloseTo(0.15)
    worker.reply({ type: 'transcript', text: '  I live beside the sea.  ' })
    await expect(result).resolves.toBe('I live beside the sea.')
    service.dispose()
  })
  it('rejects worker failure, allows retry with a fresh worker, and cancels pending preparation', async () => {
    vi.stubGlobal('Worker', FakeWorker)
    const service = new SpeakingTranscriber()
    const first = service.prepare().catch(error => error)
    FakeWorker.instances[0]!.reply({ type: 'error', message: 'Download failed' })
    expect((await first).message).toBe('Download failed')
    const retry = service.prepare().catch(error => error)
    expect(FakeWorker.instances).toHaveLength(2)
    service.dispose()
    expect((await retry).name).toBe('AbortError')
    expect(FakeWorker.instances[1]!.terminate).toHaveBeenCalled()
  })
  it('bounds worker hangs and permits a new prepare after timeout', async () => {
    vi.useFakeTimers(); vi.stubGlobal('Worker', FakeWorker)
    const service = new SpeakingTranscriber()
    const result = service.prepare().catch(error => error)
    await vi.advanceTimersByTimeAsync(180000)
    expect((await result).message).toContain('timed out')
    expect(FakeWorker.instances[0]!.terminate).toHaveBeenCalled()
    service.dispose()
  })
})
