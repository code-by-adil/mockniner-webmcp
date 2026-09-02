// @vitest-environment happy-dom
import { act, useLayoutEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSpeakingRecorder } from './useSpeakingRecorder'

const asr = vi.hoisted(() => ({ prepare: vi.fn(), validate: vi.fn(), transcribe: vi.fn(), dispose: vi.fn() }))
vi.mock('@/infrastructure/media/speakingTranscriber', () => ({
  SpeakingTranscriber: class { prepare = asr.prepare; validateRecording = asr.validate; transcribe = asr.transcribe; dispose = asr.dispose },
}))
class FakeRecorder {
  static latest: FakeRecorder
  state = 'inactive'
  mimeType = 'audio/webm'
  ondataavailable: ((e: { data: Blob }) => void) | null = null
  onstop: (() => void) | null = null
  onerror: (() => void) | null = null
  constructor() { FakeRecorder.latest = this }
  start() { this.state = 'recording' }
  stop() { this.state = 'inactive'; this.ondataavailable?.({ data: new Blob(['recorded audio']) }); this.onstop?.() }
}
describe('Speaking recorder and required transcription', () => {
  let container: HTMLDivElement, root: Root, recorder: ReturnType<typeof useSpeakingRecorder>
  const trackStop = vi.fn(), closeContext = vi.fn()
  beforeAll(() => Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }))
  afterAll(() => Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: false }))
  beforeEach(async () => {
    vi.clearAllMocks()
    asr.prepare.mockResolvedValue(undefined)
    asr.validate.mockResolvedValue(undefined)
    asr.transcribe.mockResolvedValue('A real recognised answer.')
    vi.stubGlobal('MediaRecorder', FakeRecorder)
    vi.stubGlobal('AudioContext', class {
      state = 'running'; close = closeContext
      createAnalyser() { return { fftSize: 64, frequencyBinCount: 32, disconnect: vi.fn() } }
      createMediaStreamSource() { return { connect: vi.fn(), disconnect: vi.fn() } }
    })
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {
      getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop: trackStop }] })),
    } })
    container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container)
    function Harness() { const value = useSpeakingRecorder(); useLayoutEffect(() => { recorder = value }); return null }
    await act(async () => root.render(<Harness />))
  })
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals() })
  it('releases microphone before inference and preserves recorded audio and duration', async () => {
    asr.transcribe.mockImplementationOnce(async () => {
      expect(trackStop).toHaveBeenCalledOnce()
      expect(closeContext).toHaveBeenCalledOnce()
      return 'The sea is near my home.'
    })
    await act(async () => recorder.start())
    let result: Awaited<ReturnType<typeof recorder.stop>>
    await act(async () => { result = await recorder.stop() })
    expect(result!).toMatchObject({ transcript: '' })
    expect(asr.transcribe).not.toHaveBeenCalled()
    expect(result!.audio.size).toBeGreaterThan(0)
    expect(result!.durationMs).toBeGreaterThanOrEqual(0)
    const [transcribed] = await recorder.transcribeRecordings([result!])
    expect(transcribed!.transcript).toBe('The sea is near my home.')
    expect(asr.transcribe).toHaveBeenCalledWith(result!.audio, expect.any(Function))
  })
  it('retains the same audio for retry instead of asking the learner to type or record again', async () => {
    asr.transcribe.mockRejectedValueOnce(new Error('Inference interrupted'))
    await act(async () => recorder.start())
    const recording = await recorder.stop()
    await expect(recorder.transcribeRecordings([recording!])).rejects.toThrow('Inference interrupted')
    const firstAudio = asr.transcribe.mock.calls[0]![0]
    const [response] = await recorder.transcribeRecordings([recording!])
    expect(response!.transcript).toBe('A real recognised answer.')
    expect(asr.transcribe.mock.calls[1]![0]).toBe(firstAudio)
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(1)
  })
  it('does not open the microphone if recognition preparation fails', async () => {
    asr.prepare.mockRejectedValueOnce(new Error('Speech model unavailable'))
    await expect(recorder.start()).rejects.toThrow('Speech model unavailable')
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled()
  })
  it('cancels recording without transcription and releases tracks', async () => {
    await act(async () => recorder.start())
    await recorder.cancel()
    expect(trackStop).toHaveBeenCalledOnce()
    expect(asr.transcribe).not.toHaveBeenCalled()
    expect(asr.dispose).toHaveBeenCalledOnce()
  })
  it('does not surface a stale transcript after cancellation during inference', async () => {
    let complete!: (text: string) => void
    asr.transcribe.mockImplementationOnce(() => new Promise<string>(resolve => { complete = resolve }))
    await act(async () => recorder.start())
    const recording = await recorder.stop()
    const stopped = recorder.transcribeRecordings([recording!]).catch(error => error)
    await vi.waitFor(() => expect(asr.transcribe).toHaveBeenCalledOnce())
    await recorder.cancel()
    complete('Late result')
    expect((await stopped).name).toBe('AbortError')
  })
  it('keeps successful transcripts cached when a later answer fails final processing', async () => {
    const first = { audio: new Blob(['first']), durationMs: 2000, transcript: '' }
    const second = { audio: new Blob(['second']), durationMs: 2000, transcript: '' }
    asr.transcribe.mockResolvedValueOnce('First answer').mockRejectedValueOnce(new Error('Failed second answer'))
    await expect(recorder.transcribeRecordings([first, second])).rejects.toThrow('Answer 2 of 2')
    expect(first.transcript).toBe('')
    const result = await recorder.transcribeRecordings([first, second])
    expect(asr.transcribe).toHaveBeenCalledTimes(3)
    expect(result.map(r => r.transcript)).toEqual(['First answer', 'A real recognised answer.'])
  })
  it('rejects a silent recording immediately so the current prompt can be recorded again', async () => {
    asr.validate.mockRejectedValueOnce(new Error('The microphone captured silence'))
    await act(async () => recorder.start())
    await expect(recorder.stop()).rejects.toThrow('silence')
    expect(trackStop).toHaveBeenCalled()
    expect(asr.transcribe).not.toHaveBeenCalled()
  })
})
