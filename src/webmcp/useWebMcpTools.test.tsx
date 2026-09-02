// @vitest-environment happy-dom
import { act } from 'react'
import { defaultSpeakingPlan } from '@/domain/speakingPlan'
import { createRoot, type Root } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { useWebMcpTools, type WebMcpToolOptions } from './useWebMcpTools'
import { initialSession } from '@/domain/session'
import { initialAssessmentSession } from '@/domain/assessmentSession'
import { getPracticeContext } from '@/application/practiceContext'
import { satPracticeAssessment } from '@/content/sat'
import { gradeAssessment } from '@/domain/assessment'
import { listeningDocument, readingDocument } from '@/content/objective'
import { writingDocument } from '@/content/writing'

const repository = vi.hoisted(() => ({ readAttempt: vi.fn() }))
vi.mock('@/infrastructure/database/assessmentRepository', () => ({ getAssessmentRepository: async () => repository }))

vi.mock('@/shared/reportHandledError', () => ({ reportHandledError: vi.fn() }))

describe('stable page WebMCP registration', () => {
  let root: Root
  let container: HTMLDivElement
  let registered: Map<string, WebMCP.ModelContextTool>
  let register: ReturnType<typeof vi.fn>
  const options = (active: boolean): WebMcpToolOptions => ({
    commands: {} as WebMcpToolOptions['commands'], assessmentCommands: {} as WebMcpToolOptions['assessmentCommands'],
    enabled: true, nativeAuthoringEnabled: active,
    context: { practice: null, view: 'home', activeAttempt: null, submissions: [] },
    workspace: { native: initialSession, assessment: initialAssessmentSession, content: { listening: listeningDocument, reading: readingDocument, writing: writingDocument }, assessments: [satPracticeAssessment],
      listeningAudio: { contentKey: listeningDocument.contentKey, source: 'bundled', phase: 'ready', readyToPlay: true, completedChunks: 0, totalChunks: 1, error: null, canRetry: false } },
    retryListeningAudio: vi.fn(),
    loadPracticeContent: async () => null,
    assessmentToolSurface: active ? 'authoring' : 'none', writingToolSurface: 'none', speakingToolSurface: 'none',
  })
  function Harness({ value }: { value: WebMcpToolOptions }) {
    const tools = useWebMcpTools(value)
    return <div>{tools.registrationStatus}</div>
  }
  beforeAll(() => Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }))
  afterAll(() => Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: false }))
  beforeEach(() => {
    registered = new Map()
    register = vi.fn(async (tool: WebMCP.ModelContextTool, config: WebMCP.ModelContextRegisterToolOptions) => {
      registered.set(tool.name, tool)
      config.signal?.addEventListener('abort', () => registered.delete(tool.name))
    })
    Object.defineProperty(document, 'modelContext', { configurable: true, value: { registerTool: register } })
    container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container)
  })
  afterEach(async () => { await act(async () => root.unmount()); container.remove() })
  it.each(['reading', 'listening', 'writing', 'speaking', 'assessment'] as const)(
    'blocks both answer-bearing kits for a %s draft, including while paused or viewing history', async kind => {
      const config = { signal: new AbortController().signal }
      const requests = [
        ['get_ielts_authoring_kit', { section: 'reading' }],
        ['get_ielts_authoring_kit', { section: 'listening' }],
        ['get_ielts_authoring_kit', { section: 'writing' }],
        ['get_assessment_authoring_kit', { template: 'sat-style' }],
        ['get_assessment_authoring_kit', { template: 'minimal-objective' }],
        ['get_assessment_authoring_kit', { template: 'writing-with-rubric' }],
        ['get_assessment_authoring_kit', { template: 'gre-style' }],
      ] as const
      await act(async () => root.render(<Harness value={options(true)} />))
      for (const view of ['exam', 'home', 'review', 'transition'] as const) {
        const value = options(true)
        const attemptId = '11111111-1111-4111-8111-111111111111'
        if (kind === 'assessment') {
          value.workspace.assessment = { ...initialAssessmentSession, attemptId, packageId: satPracticeAssessment.packageId,
            view: view === 'exam' ? 'assessment' : view === 'home' ? 'home' : 'result' }
        } else {
          value.workspace.native = { ...initialSession, mode: view === 'transition' ? 'full' : 'section',
            currentSection: kind, attemptId, view }
        }
        value.context = getPracticeContext(value.workspace.native, value.workspace.assessment)
        const before = JSON.stringify(value.workspace)
        await act(async () => root.render(<Harness value={value} />))
        for (const [name, input] of requests) {
          const result = await registered.get(name)!.execute(input, config)
          expect(result).toMatchObject({ ok: false, error: { code: 'TOOL_NOT_AVAILABLE', message: expect.stringContaining('unfinished'), retryable: true } })
          expect(result).not.toHaveProperty('data')
        }
        await expect(registered.get('get_practice_context')!.execute({}, config)).resolves.toMatchObject({ ok: true })
        expect(JSON.stringify(value.workspace)).toBe(before)
      }
      // The same registered callbacks must unlock after the draft is finished.
      await act(async () => root.render(<Harness value={options(true)} />))
      for (const [name, input] of requests) await expect(registered.get(name)!.execute(input, config)).resolves.toMatchObject({ ok: true })
      expect(register).toHaveBeenCalledTimes(18)
    },
  )
  it('reads live audio transitions and scopes retry without re-registering the catalog', async () => {
    const value = options(true)
    value.workspace.listeningAudio = { contentKey: 'new-audio', source: 'kokoro', phase: 'loading', readyToPlay: false, completedChunks: 0, totalChunks: null, error: null, canRetry: false }
    await act(async () => root.render(<Harness value={value} />))
    const context = registered.get('get_practice_context')!
    const config = { signal: new AbortController().signal }
    await expect(context.execute({}, config)).resolves.toMatchObject({ data: { listeningAudio: { contentKey: 'new-audio', phase: 'loading', readyToPlay: false } } })
    const failed = { ...value, workspace: { ...value.workspace, listeningAudio: { ...value.workspace.listeningAudio, phase: 'error' as const, error: 'Synthetic failure.', canRetry: true } } }
    await act(async () => root.render(<Harness value={failed} />))
    await expect(context.execute({}, config)).resolves.toMatchObject({ data: { listeningAudio: { phase: 'error', canRetry: true } } })
    await registered.get('retry_ielts_listening_audio')!.execute({ contentKey: 'new-audio' }, config)
    expect(value.retryListeningAudio).toHaveBeenCalledTimes(1)
    expect(register).toHaveBeenCalledTimes(18)
  })
  it('allows authoring after a completed IELTS attempt but not while another family still has a draft', async () => {
    const value = options(true)
    value.workspace.native = { ...initialSession, mode: 'section', currentSection: 'reading', view: 'result',
      attemptId: '11111111-1111-4111-8111-111111111111', completedSections: ['reading'] }
    await act(async () => root.render(<Harness value={value} />))
    const tool = registered.get('get_ielts_authoring_kit')!
    const config = { signal: new AbortController().signal }
    await expect(tool.execute({ section: 'reading' }, config)).resolves.toMatchObject({ ok: true })
    const pending = { ...value, workspace: { ...value.workspace, assessment: { ...initialAssessmentSession,
      attemptId: '22222222-2222-4222-8222-222222222222', packageId: satPracticeAssessment.packageId } } }
    await act(async () => root.render(<Harness value={pending} />))
    await expect(tool.execute({ section: 'reading' }, config)).resolves.toMatchObject({ ok: false, error: { code: 'TOOL_NOT_AVAILABLE' } })
    expect(register).toHaveBeenCalledTimes(18)
  })
  it('keeps context and default reads aligned through navigation without re-registering', async () => {
    const older = { attemptId: '11111111-1111-4111-8111-111111111111', packageId: satPracticeAssessment.packageId,
      package: satPracticeAssessment, responses: {}, result: gradeAssessment(satPracticeAssessment, {}), startedAt: '', submittedAt: '' }
    const newer = { ...older, attemptId: '22222222-2222-4222-8222-222222222222' }
    repository.readAttempt.mockImplementation(async (id?: string) => ({ submission: id === older.attemptId ? older : newer, evaluation: null }))
    const value = (submission: typeof older): WebMcpToolOptions => ({ ...options(false), assessmentToolSurface: 'results',
      context: getPracticeContext(initialSession, { ...initialAssessmentSession, view: 'result', submission }) })
    await act(async () => root.render(<Harness value={value(older)} />))
    const reader = registered.get('get_assessment_submission')!
    const context = registered.get('get_practice_context')!
    const config = { signal: new AbortController().signal }
    await expect(context.execute({}, config)).resolves.toMatchObject({ ok: true, data: { submissions: [{ attemptId: older.attemptId }] } })
    await expect(reader.execute({}, config)).resolves.toMatchObject({ ok: true, data: { submission: { attemptId: older.attemptId } } })
    await act(async () => root.render(<Harness value={value(newer)} />))
    await expect(context.execute({}, config)).resolves.toMatchObject({ ok: true, data: { submissions: [{ attemptId: newer.attemptId }] } })
    await expect(reader.execute({}, config)).resolves.toMatchObject({ ok: true, data: { submission: { attemptId: newer.attemptId } } })
    await act(async () => root.render(<Harness value={options(true)} />))
    await expect(context.execute({}, config)).resolves.toMatchObject({ ok: true, data: { view: 'home', submissions: [] } })
    await expect(reader.execute({}, config)).resolves.toMatchObject({ ok: false, error: { code: 'NO_VISIBLE_SUBMISSION' } })
    await expect(reader.execute({ attemptId: older.attemptId }, config)).resolves.toMatchObject({ ok: true, data: { submission: { attemptId: older.attemptId } } })
    expect(register).toHaveBeenCalledTimes(18)
  })
  it('keeps the same catalog through 30 context changes and rejects wrong-state execution', async () => {
    await act(async () => root.render(<Harness value={options(true)} />))
    expect(registered.size).toBe(18)
    const original = [...registered.values()]
    const metadata = JSON.stringify(original.map(({ execute: _execute, ...descriptor }) => descriptor))
    for (let index = 0; index < 30; index++) {
      await act(async () => root.render(<Harness value={options(index % 2 === 0)} />))
      expect([...registered.values()]).toEqual(original)
    }
    expect(register).toHaveBeenCalledTimes(18)
    expect(JSON.stringify([...registered.values()].map(({ execute: _execute, ...descriptor }) => descriptor))).toBe(metadata)
    const callOptions = { signal: new AbortController().signal }
    await expect(registered.get('install_assessment')!.execute({}, callOptions)).resolves.toMatchObject({ ok: false, error: { code: 'TOOL_NOT_AVAILABLE' } })
    await expect(registered.get('get_ielts_writing_submission')!.execute({}, callOptions)).resolves.toMatchObject({ ok: false, error: { code: 'NO_VISIBLE_SUBMISSION' } })
    await expect(registered.get('set_ielts_speaking_interview')!.execute(defaultSpeakingPlan, callOptions)).resolves.toMatchObject({ ok: false, error: { code: 'SPEAKING_NOT_OPEN' } })
    await act(async () => root.render(<Harness value={options(true)} />))
    await expect(registered.get('get_ielts_authoring_kit')!.execute({ section: 'writing' }, callOptions)).resolves.toMatchObject({ ok: true })
    expect(register).toHaveBeenCalledTimes(18)
  })
  it('surfaces registration failure and removes partial registrations', async () => {
    register.mockRejectedValueOnce(new Error('Registration failed'))
    await act(async () => root.render(<Harness value={options(true)} />))
    expect(container.textContent).toBe('error')
    expect(registered.size).toBe(0)
  })
  it('reports WebMCP unavailable without suggesting successful setup', async () => {
    Object.defineProperty(document, 'modelContext', { configurable: true, value: undefined })
    await act(async () => root.render(<Harness value={options(true)} />))
    expect(container.textContent).toBe('unavailable')
  })
})
