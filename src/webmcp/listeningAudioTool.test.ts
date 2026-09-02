import { describe, expect, it, vi } from 'vitest'
import type { ListeningAudioStatus } from '@/application/listeningAudioStatus'
import { createListeningAudioRetryTool } from './listeningAudioTool'

const errorStatus: ListeningAudioStatus = { contentKey: 'test-audio', source: 'kokoro', phase: 'error', readyToPlay: false,
  completedChunks: 2, totalChunks: 10, error: 'Synthetic failure.', canRetry: true }
const options = { signal: new AbortController().signal }
describe('semantic Listening retry', () => {
  it('retries the matching failure once and returns the new status', async () => {
    let status = errorStatus
    const retry = vi.fn(() => { status = { ...status, phase: 'loading', error: null, canRetry: false } })
    const tool = createListeningAudioRetryTool(() => status, retry)
    await expect(tool.execute({ contentKey: 'test-audio' }, options)).resolves.toMatchObject({ ok: true, data: { listeningAudio: { phase: 'loading', error: null, completedChunks: 2 } } })
    await expect(tool.execute({ contentKey: 'test-audio' }, options)).resolves.toMatchObject({ ok: false, error: { code: 'AUDIO_RETRY_NOT_AVAILABLE' } })
    expect(retry).toHaveBeenCalledTimes(1)
  })
  it('rejects a stale key, invalid input and cancellation without restarting audio', async () => {
    const retry = vi.fn(); const tool = createListeningAudioRetryTool(() => errorStatus, retry)
    await expect(tool.execute({ contentKey: 'old-audio' }, options)).resolves.toMatchObject({ ok: false, error: { code: 'LISTENING_CONTENT_CHANGED' } })
    await expect(tool.execute({}, options)).resolves.toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } })
    const abort = new AbortController(); abort.abort()
    await expect(tool.execute({ contentKey: 'test-audio' }, { signal: abort.signal })).rejects.toThrow()
    expect(retry).not.toHaveBeenCalled()
  })
})
