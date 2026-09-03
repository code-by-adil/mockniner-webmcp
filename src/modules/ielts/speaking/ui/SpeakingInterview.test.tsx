// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SpeakingInterviewBinding } from '@/application/speakingInterviewController'
import { createSpeakingInterviewController } from '@/application/speakingInterviewController'
import { defaultSpeakingPlan, speakingQuestionText } from '@/domain/speakingPlan'
import { SpeakingInterview } from './SpeakingInterview'
import { createSpeakingProgressToolDefinition } from '@/webmcp/speakingTools'

const mocks = vi.hoisted(() => ({ start: vi.fn(), stop: vi.fn(), discard: vi.fn(), prepare: vi.fn(), transcribe: vi.fn(), speak: vi.fn(), preload: vi.fn(), prepareAudio: vi.fn(), dispose: vi.fn() }))
const drafts = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn() }))
vi.mock('@/infrastructure/database/client', () => ({ getLocalDatabase: async () => ({}) }))
vi.mock('@/infrastructure/database/speakingDraftRepository', () => ({ loadDraftRecordings: drafts.load, saveDraftRecording: drafts.save }))
vi.mock('../useSpeakingRecorder', () => ({ useSpeakingRecorder: () => ({
  canvasRef: { current: null }, prepare: mocks.prepare, start: mocks.start, stop: mocks.stop,
  discard: mocks.discard, transcribeRecordings: mocks.transcribe, transcriptionStatus: '',
}) }))
vi.mock('@/infrastructure/media/kokoroSpeakingPlayer', () => ({ KokoroSpeakingPlayer: class {
  speak = mocks.speak; preload = mocks.preload; prepareAudio = mocks.prepareAudio; dispose = mocks.dispose
} }))

const plan = { ...defaultSpeakingPlan, title: 'Three-question flow test', questions: [defaultSpeakingPlan.questions[0]!, defaultSpeakingPlan.questions[6]!, defaultSpeakingPlan.questions[7]!] }
let root: Root, host: HTMLDivElement, bridge: ReturnType<typeof createSpeakingInterviewController>
const complete = vi.fn()
const persistPlan = vi.fn()
const trackStop = vi.fn()
const button = (name: string) => [...host.querySelectorAll('button')].find(b => b.textContent?.includes(name))!
const click = async (name: string) => { await act(async () => button(name).click()) }
const advance = async (ms: number) => { await act(async () => vi.advanceTimersByTimeAsync(ms)) }
beforeEach(async () => {
  vi.useFakeTimers(); vi.clearAllMocks()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop: trackStop }] })) } })
  mocks.prepare.mockResolvedValue(undefined); mocks.prepareAudio.mockResolvedValue({}); mocks.start.mockResolvedValue(undefined)
  mocks.speak.mockImplementation(async (_text, _signal, playback) => { playback?.() })
  mocks.stop.mockResolvedValue({ audio: new Blob(['real microphone fixture']), durationMs: 3000, transcript: '' })
  mocks.transcribe.mockImplementation(async (responses) => responses.map((r: object) => ({ ...r, transcript: 'A recognised test answer.' })))
  complete.mockResolvedValue(undefined)
  drafts.load.mockResolvedValue([]); drafts.save.mockResolvedValue(undefined)
  bridge = createSpeakingInterviewController()
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  let binding!: SpeakingInterviewBinding
  const bind = (next: SpeakingInterviewBinding) => { binding = next; return bridge.bind(next) }
  await act(async () => root.render(<SpeakingInterview bindSpeakingInterview={bind} onComplete={complete} onConfigurePlan={persistPlan} />))
  // A reduced renderer fixture keeps lifecycle tests focused. The public plan
  // contract is tested independently and requires 10–12 questions.
  await act(async () => { binding.configure(plan) })
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.useRealTimers(); vi.unstubAllGlobals() })

describe('one local Speaking experience', () => {
  it('resumes saved audio at the next question and locks its question set', async () => {
    const question = plan.questions[0]!
    const recording = { promptId: question.id, partLabel: 'Part 1', sequence: 0, promptText: speakingQuestionText(question), timeLimitSeconds: question.responseSeconds,
      status: 'answered', audio: new Blob(['saved audio']), durationMs: 2000, transcript: '' }
    drafts.load.mockResolvedValueOnce([recording])
    await act(async () => root.render(<SpeakingInterview key="saved" attemptId="11111111-1111-4111-8111-111111111111" attemptStartedAt="2026-09-03T00:00:00.000Z" initialPlan={plan} bindSpeakingInterview={bridge.bind} onComplete={complete} onConfigurePlan={persistPlan} />))
    expect(host.textContent).toContain('1 of 3 answers saved')
    expect(bridge.canLeave()).toBe(true)
    expect(() => bridge.configure(defaultSpeakingPlan)).toThrow('locked')
    await click('Resume interview')
    expect(bridge.read()).toMatchObject({ currentQuestion: 2, recordedAnswers: 1 })
    expect(mocks.speak).toHaveBeenLastCalledWith(speakingQuestionText(plan.questions[1]!), expect.any(AbortSignal), expect.any(Function))
  })
  it('keeps a failed recording save for retry, without recording or advancing twice', async () => {
    await act(async () => root.render(<SpeakingInterview key="durable" attemptId="11111111-1111-4111-8111-111111111111" initialPlan={plan} bindSpeakingInterview={bridge.bind} onComplete={complete} onConfigurePlan={persistPlan} />))
    await click('Start interview'); await click('Record answer')
    drafts.save.mockRejectedValueOnce(new Error('Disk full'))
    await click('Submit answer')
    expect(host.textContent).toContain('Retry saving this answer')
    expect(bridge.read()).toMatchObject({ currentQuestion: 1, recordedAnswers: 0 })
    expect(drafts.save.mock.calls[0]![2]).toMatchObject({ transcript: '', status: 'answered' })
    expect(mocks.transcribe).not.toHaveBeenCalled()
    await click('Retry saving this answer')
    expect(mocks.stop).toHaveBeenCalledOnce()
    expect(bridge.read()).toMatchObject({ currentQuestion: 2, recordedAnswers: 1 })
    expect(drafts.save).toHaveBeenCalledTimes(2)
  })
  it('only updates the configured plan after persistence succeeds', async () => {
    persistPlan.mockImplementationOnce(() => { throw new Error('Storage quota exceeded') })
    expect(() => bridge.configure(defaultSpeakingPlan)).toThrow('quota')
    expect(host.textContent).toContain(plan.title)
    expect(bridge.read()).toMatchObject({ title: plan.title, contentKey: plan.contentKey })
    await act(async () => { bridge.configure(defaultSpeakingPlan) })
    expect(host.textContent).toContain(defaultSpeakingPlan.title)
  })
  it('restores a saved plan on remount and allows only empty setup navigation', async () => {
    expect(bridge.canLeave()).toBe(true)
    await act(async () => root.render(<div>Paused</div>))
    expect(bridge.canLeave()).toBe(false)
    await act(async () => root.render(<SpeakingInterview initialPlan={plan} bindSpeakingInterview={bridge.bind} onComplete={complete} onConfigurePlan={persistPlan} />))
    expect(host.textContent).toContain(plan.title)
    expect(bridge.read()).toMatchObject({ phase: 'setup', totalQuestions: 3, title: plan.title })
    expect(bridge.canLeave()).toBe(true)
    const before = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(before); expect(before.defaultPrevented).toBe(false)
    await click('Start interview')
    expect(bridge.canLeave()).toBe(false)
    const running = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(running); expect(running.defaultPrevented).toBe(true)
    await click('Record answer'); expect(bridge.canLeave()).toBe(false)
    await click('Submit answer'); expect(bridge.canLeave()).toBe(false)
  })
  it('uses Space for record and submit without interfering with notes or dialogs', async () => {
    const space = async (target: EventTarget) => { await act(async () => target.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true, cancelable: true }))) }
    await click('Start interview')
    await space(window)
    expect(bridge.read()).toMatchObject({ phase: 'recording' })
    await space(window)
    expect(bridge.read()).toMatchObject({ phase: 'thinking', currentQuestion: 2 })
    await space(host.querySelector('textarea')!)
    expect(mocks.start).toHaveBeenCalledTimes(1)
    const dialog = document.createElement('dialog'); dialog.open = true; document.body.append(dialog)
    await space(window)
    expect(mocks.start).toHaveBeenCalledTimes(1)
    dialog.remove()
    await space(window)
    expect(mocks.start).toHaveBeenCalledTimes(2)
  })
  it('stops a double submission from saving or advancing twice', async () => {
    await click('Start interview'); await click('Record answer')
    let resolveStop!: (value: unknown) => void
    mocks.stop.mockImplementationOnce(() => new Promise(r => { resolveStop = r }))
    await click('Submit answer'); await click('Submit answer')
    expect(mocks.stop).toHaveBeenCalledOnce()
    await act(async () => resolveStop({ audio: new Blob(['answer']), durationMs: 3000, transcript: '' }))
    expect(bridge.read()).toMatchObject({ currentQuestion: 2, recordedAnswers: 1 })
  })
  it('reports preparation stages through WebMCP while each dependency is pending', async () => {
    let saved!: () => void, permitted!: (stream: MediaStream) => void, prepared!: () => void
    persistPlan.mockImplementationOnce(() => new Promise<void>(resolve => { saved = resolve }))
    vi.mocked(navigator.mediaDevices.getUserMedia).mockImplementationOnce(() => new Promise<MediaStream>(resolve => { permitted = resolve }))
    mocks.prepare.mockImplementationOnce(() => new Promise<void>(resolve => { prepared = resolve }))
    const tool = createSpeakingProgressToolDefinition(bridge.read)
    const read = () => tool.execute({}, { signal: new AbortController().signal })
    await click('Start interview')
    expect(await read()).toMatchObject({ ok: true, data: { phase: 'preparing', preparationStage: 'saving_plan', error: null, recoveryAction: null } })
    expect(host.textContent).toContain('Saving your interview plan')
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled()
    await act(async () => saved())
    expect(await read()).toMatchObject({ data: { preparationStage: 'microphone_access', error: null, recoveryAction: expect.stringContaining('permission request') } })
    expect(host.textContent).toContain('Waiting for microphone access')
    expect(mocks.prepare).not.toHaveBeenCalled()
    await act(async () => permitted({ getTracks: () => [{ stop: trackStop }] } as unknown as MediaStream))
    expect(await read()).toMatchObject({ data: { preparationStage: 'voice_and_recognition', recoveryAction: null } })
    expect(host.textContent).toContain('First-time model downloads')
    expect(trackStop).toHaveBeenCalledOnce()
    await act(async () => prepared())
    expect(await read()).toMatchObject({ data: { phase: 'ready', preparationStage: null, error: null, recoveryAction: null } })
  })
  it('keeps permission failures visible to WebMCP and clears them on successful retry', async () => {
    vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValueOnce(new DOMException('Permission dismissed', 'NotAllowedError'))
    await click('Start interview')
    const tool = createSpeakingProgressToolDefinition(bridge.read)
    expect(await tool.execute({}, { signal: new AbortController().signal })).toMatchObject({ ok: true, data: {
      phase: 'setup', preparationStage: null, error: 'Permission dismissed', recoveryAction: expect.stringContaining('browser and device settings'),
    } })
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('Permission dismissed')
    expect(mocks.speak).not.toHaveBeenCalled()
    await click('Start interview')
    expect(bridge.read()).toMatchObject({ phase: 'ready', preparationStage: null, error: null, recoveryAction: null })
  })
  it.each(['prepare', 'prepareAudio'] as const)('identifies %s failure as speech preparation and permits retry', async dependency => {
    mocks[dependency].mockRejectedValueOnce(new Error('Model download failed'))
    await click('Start interview')
    expect(bridge.read()).toMatchObject({ phase: 'setup', preparationStage: null, error: 'Model download failed', recoveryAction: expect.stringContaining('speech model download') })
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('Model download failed')
    await click('Start interview')
    expect(bridge.read()).toMatchObject({ phase: 'ready', error: null, recoveryAction: null })
  })
  it('reports a plan-save failure without requesting microphone permission', async () => {
    persistPlan.mockRejectedValueOnce(new Error('Storage quota exceeded'))
    await click('Start interview')
    expect(bridge.read()).toMatchObject({ phase: 'setup', error: 'Storage quota exceeded', recoveryAction: expect.stringContaining('saving still fails') })
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled()
  })
  it('has one start action, prepares ahead and never needs agent turns', async () => {
    expect(host.textContent).not.toContain('Agent interview')
    expect(host.textContent).not.toContain(plan.questions[0]!.text)
    await click('Start interview')
    expect(trackStop).toHaveBeenCalledOnce()
    expect(mocks.preload).toHaveBeenCalledWith(plan.questions.map(speakingQuestionText))
    expect(mocks.prepareAudio).toHaveBeenCalledTimes(1)
    expect(mocks.start).not.toHaveBeenCalled()
    expect(() => bridge.configure(defaultSpeakingPlan)).toThrow('locked')
    await advance(60_000)
    expect(mocks.start).not.toHaveBeenCalled()
    await click('Record answer')
    expect(mocks.start).toHaveBeenCalledOnce()
    expect(host.textContent).toContain('Recording your answer')
    await click('Submit answer')
    expect(mocks.transcribe).not.toHaveBeenCalled()
    expect(bridge.read()).toMatchObject({ phase: 'thinking', currentQuestion: 2, recordedAnswers: 1 })
    expect(host.textContent).toContain('1:00')
    expect(host.querySelector('textarea')?.id).toBe('speaking-notes')
    await click('Record answer')
    await click('Submit answer')
    await click('Record answer')
    await click('Submit answer')
    expect(complete).toHaveBeenCalledOnce()
    expect(complete.mock.calls[0]![0].recordings.map((r: { promptText: string }) => r.promptText)).toEqual(plan.questions.map(speakingQuestionText))
    expect(mocks.transcribe).toHaveBeenCalledOnce()
  })
  it('supports explicit skips without a fake recording or transcript', async () => {
    await click('Start interview'); await click('Record answer')
    await click('Skip question'); await click('Skip question'); await advance(1000); await click('Skip question')
    expect(mocks.stop).not.toHaveBeenCalled()
    const recordings = complete.mock.calls[0]![0].recordings
    expect(recordings).toHaveLength(3)
    expect(recordings.every((r: { status: string; audio: unknown; transcript: string }) => r.status === 'skipped' && r.audio === null && r.transcript === '')).toBe(true)
  })
  it('automatically moves on at the answer limit and keeps Part 2 preparation', async () => {
    await click('Start interview'); await click('Record answer')
    await advance(plan.questions[0]!.responseSeconds * 1000)
    expect(bridge.read()).toMatchObject({ phase: 'thinking', currentQuestion: 2 })
    await advance(60_000)
    expect(bridge.read()).toMatchObject({ phase: 'ready', currentQuestion: 2 })
    expect(mocks.start).toHaveBeenCalledTimes(1)
    await click('Record answer')
    expect(bridge.read()).toMatchObject({ phase: 'recording', currentQuestion: 2 })
  })
  it('keeps the current question on recording failure and allows retry', async () => {
    await click('Start interview'); await click('Record answer')
    mocks.stop.mockRejectedValueOnce(new Error('Microphone captured silence.'))
    await click('Submit answer')
    expect(bridge.read()).toMatchObject({ phase: 'error', currentQuestion: 1, recordedAnswers: 0, error: 'Microphone captured silence.', recoveryAction: expect.stringContaining('Retry this question') })
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('silence')
    await click('Retry this question'); await click('Record answer')
    await click('Submit answer')
    expect(bridge.read()).toMatchObject({ currentQuestion: 2, recordedAnswers: 1, error: null, recoveryAction: null })
  })
  it('does not start recording before examiner playback ends', async () => {
    let finishPlayback!: () => void
    mocks.speak.mockImplementationOnce((_text, _signal, playback) => { playback(); return new Promise<void>(r => { finishPlayback = r }) })
    await click('Start interview'); await advance(10_000)
    expect(mocks.start).not.toHaveBeenCalled()
    expect(button('Record answer').disabled).toBe(true)
    await act(async () => finishPlayback()); await advance(10_000)
    expect(mocks.start).not.toHaveBeenCalled()
    expect(button('Record answer').disabled).toBe(false)
    await click('Record answer')
    expect(mocks.start).toHaveBeenCalledOnce()
  })
  it('keeps all recordings for a retry when final transcription fails', async () => {
    await click('Start interview'); await click('Record answer'); await click('Submit answer')
    await click('Record answer'); await click('Submit answer'); await click('Record answer')
    mocks.transcribe.mockRejectedValueOnce(new Error('Inference interrupted'))
    await click('Submit answer')
    expect(complete).not.toHaveBeenCalled()
    expect(host.textContent).toContain('Retry processing interview')
    const original = mocks.transcribe.mock.calls[0]![0]
    await click('Retry processing interview')
    expect(mocks.transcribe.mock.calls[1]![0]).toEqual(original)
    expect(complete).toHaveBeenCalledOnce()
  })
  it('cleans up audio and timers on exit, including late playback completion', async () => {
    let finishPlayback!: () => void
    mocks.speak.mockImplementationOnce((_text, _signal, playback) => { playback(); return new Promise<void>(r => { finishPlayback = r }) })
    await click('Start interview')
    await act(async () => root.render(<div>Exited</div>))
    finishPlayback(); await advance(10_000)
    expect(mocks.start).not.toHaveBeenCalled()
    expect(mocks.dispose).toHaveBeenCalledOnce()
    expect(bridge.read()).toEqual({ active: false, phase: 'closed' })
  })
})
