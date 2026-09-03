// @vitest-environment happy-dom
import { act, useLayoutEffect } from 'react'
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
import { draftSaves } from '@/infrastructure/saveCoordinator'
import type { summarizeToolAvailability } from './toolAvailability'

const repository = vi.hoisted(() => ({ readAttempt: vi.fn() }))
const readActivity = vi.hoisted(() => vi.fn(async () => ({ items: [], nextOffset: null })))
vi.mock('@/infrastructure/database/assessmentRepository', () => ({ getAssessmentRepository: async () => repository }))
vi.mock('@/infrastructure/database/client', () => ({ getLocalDatabase: async () => ({}) }))
vi.mock('@/infrastructure/database/practiceActivity', () => ({ readPracticeActivity: readActivity }))

vi.mock('@/shared/reportHandledError', () => ({ reportHandledError: vi.fn() }))

describe('stable page WebMCP registration', () => {
  let root: Root
  let container: HTMLDivElement
  let registered: Map<string, WebMCP.ModelContextTool>
  let register: ReturnType<typeof vi.fn>
  let bridge: ReturnType<typeof useWebMcpTools>
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
    useLayoutEffect(() => { bridge = tools }, [tools])
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
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks() })
  const execution = () => ({ signal: new AbortController().signal })
  async function capabilities() {
    const result = await registered.get('get_practice_context')!.execute({}, execution()) as {
      data: { capabilities: ReturnType<typeof summarizeToolAvailability> }
    }
    return result.data.capabilities
  }
  it('reports every registered tool exactly once and uses the same reasons to reject blocked actions', async () => {
    const values = [options(true), options(false)]
    const id = '11111111-1111-4111-8111-111111111111'
    for (const kind of ['writing', 'speaking', 'assessment'] as const) {
      for (const evaluationStatus of ['awaiting_evaluation', 'evaluated', 'not_required', 'insufficient_evidence'] as const) {
        const value = options(false)
        value.context = { practice: kind === 'assessment' ? 'assessment' : 'ielts', view: 'result', activeAttempt: null,
          submissions: [{ kind, attemptId: id, evaluationStatus }] }
        values.push(value)
      }
    }
    const objective = options(false)
    objective.context = { practice: 'ielts', view: 'review', activeAttempt: null,
      submissions: [{ kind: 'reading', attemptId: id, evaluationStatus: 'not_required' }],
      reviewLocation: { kind: 'reading', attemptId: id, questionId: 28 } }
    values.push(objective)
    const flush = vi.spyOn(draftSaves, 'flush')
    for (const value of values) {
      await act(async () => root.render(<Harness value={value} />))
      const before = JSON.stringify(value.workspace)
      const report = await capabilities()
      const names = [...report.available, ...Object.keys(report.conditional), ...Object.keys(report.blocked)]
      expect(names.sort()).toEqual([...registered.keys()].sort())
      expect(new Set(names).size).toBe(names.length)
      for (const [name, reason] of Object.entries(report.blocked)) {
        await expect(registered.get(name)!.execute({}, execution())).resolves.toEqual({ ok: false, error: { ...reason, retryable: true } })
      }
      expect(JSON.stringify(value.workspace)).toBe(before)
    }
    expect(flush).not.toHaveBeenCalled()
    expect((await capabilities()).conditional).toHaveProperty('save_ielts_objective_explanation')
    expect(register).toHaveBeenCalledTimes(22)
  })
  it('distinguishes full authoring access, hidden examples, explicit reads and objective-only evaluation', async () => {
    const value = options(true)
    value.workspace.assessment = { ...initialAssessmentSession, attemptId: crypto.randomUUID(), packageId: satPracticeAssessment.packageId }
    await act(async () => root.render(<Harness value={value} />))
    const report = await capabilities()
    expect(report.authoringExamplesIncluded).toBe(false)
    expect(report.available).toEqual(expect.arrayContaining(['get_ielts_authoring_kit', 'get_assessment_authoring_kit']))
    expect(report.conditional.get_assessment_content).toContain('no unfinished attempt for that package')
    expect(report.conditional.get_assessment_submission).toContain('Supply attemptId')
    const result: WebMcpToolOptions = { ...value, nativeAuthoringEnabled: false, assessmentToolSurface: 'results' as const,
      context: { practice: 'assessment' as const, view: 'result' as const, activeAttempt: null,
        submissions: [{ kind: 'assessment' as const, attemptId: crypto.randomUUID(), evaluationStatus: 'not_required' as const }] } }
    await act(async () => root.render(<Harness value={result} />))
    expect((await capabilities()).blocked.attach_assessment_evaluation.code).toBe('EVALUATION_NOT_REQUIRED')
    expect((await capabilities()).available).toContain('get_assessment_submission')
    result.context.submissions[0] = { ...result.context.submissions[0], evaluationStatus: 'evaluated' }
    await act(async () => root.render(<Harness value={{ ...result }} />))
    expect((await capabilities()).conditional.attach_assessment_evaluation).toContain('expectedRevision')
  })
  it.each(['reading', 'full', 'separate_drafts'] as const)('reports exact native authoring restrictions for %s drafts', async kind => {
    const value = options(true)
    value.workspace.native = { ...initialSession, pausedDrafts: (kind === 'separate_drafts'
      ? ['listening', 'reading', 'writing'] as const : ['reading'] as const).map(section => ({ ...initialSession,
        mode: kind === 'full' ? 'full' : 'section', currentSection: section, attemptId: crypto.randomUUID() })) }
    await act(async () => root.render(<Harness value={value} />))
    const report = await capabilities()
    if (kind === 'reading') {
      expect(report.conditional.install_ielts_practice_set).toContain('Available sections: listening, writing.')
      expect(report.conditional.install_ielts_practice_set).toContain('Drafts block installation for: reading.')
    } else {
      expect(report.blocked.install_ielts_practice_set.code).toBe('ACTIVE_ATTEMPT')
      await expect(registered.get('install_ielts_practice_set')!.execute({}, execution())).resolves.toMatchObject({ ok: false, error: report.blocked.install_ielts_practice_set })
    }
    await act(async () => root.render(<Harness value={options(true)} />))
    expect((await capabilities()).available).toContain('install_ielts_practice_set')
    expect(register).toHaveBeenCalledTimes(22)
  })
  it('reads Speaking lifecycle eligibility from the bound runner without re-registration or a render', async () => {
    const value = options(false)
    value.workspace.native = { ...initialSession, view: 'exam', currentSection: 'speaking', attemptId: crypto.randomUUID() }
    value.context = getPracticeContext(value.workspace.native, value.workspace.assessment)
    await act(async () => root.render(<Harness value={value} />))
    expect((await capabilities()).blocked.set_ielts_speaking_interview.code).toBe('SPEAKING_NOT_OPEN')
    const progress = { phase: 'setup', currentQuestion: 1, totalQuestions: 12, recordedAnswers: 0, skippedAnswers: 0, answersSaved: false }
    const configure = vi.fn()
    const unbind = bridge.bindSpeakingInterview({ configure, read: () => progress })
    expect((await capabilities()).available).toContain('set_ielts_speaking_interview')
    expect((await capabilities()).conditional).toHaveProperty('open_practice')
    await expect(registered.get('set_ielts_speaking_interview')!.execute(defaultSpeakingPlan, execution())).resolves.toMatchObject({ ok: true })
    for (const phase of ['loading', 'preparing', 'recording', 'error', 'save-error']) {
      progress.phase = phase
      const report = await capabilities()
      expect(report.blocked.open_practice.code).toBe('SPEAKING_IN_PROGRESS')
      const code = ['loading', 'preparing'].includes(phase) ? 'SPEAKING_NOT_READY' : 'SPEAKING_ALREADY_STARTED'
      expect(report.blocked.set_ielts_speaking_interview.code).toBe(code)
      await expect(registered.get('set_ielts_speaking_interview')!.execute(defaultSpeakingPlan, execution())).resolves.toMatchObject({ ok: false, error: { code } })
    }
    progress.phase = 'setup'; progress.skippedAnswers = 1; progress.answersSaved = true
    expect((await capabilities()).conditional).toHaveProperty('open_practice')
    expect((await capabilities()).blocked).toHaveProperty('set_ielts_speaking_interview')
    unbind()
    expect((await capabilities()).blocked.set_ielts_speaking_interview.code).toBe('SPEAKING_NOT_OPEN')
    expect(configure).toHaveBeenCalledOnce()
    expect(register).toHaveBeenCalledTimes(22)
  })
  it.each(['state_change', 'cancellation'] as const)('rechecks %s after waiting for draft persistence', async change => {
    const value = options(true)
    value.workspace.listeningAudio = { ...value.workspace.listeningAudio, canRetry: true, phase: 'error' }
    await act(async () => root.render(<Harness value={value} />))
    let release!: () => void
    const flush = vi.spyOn(draftSaves, 'flush').mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve }))
    const controller = new AbortController()
    const pending = registered.get('retry_ielts_listening_audio')!.execute({ contentKey: listeningDocument.contentKey }, { signal: controller.signal })
    expect(flush).toHaveBeenCalledOnce()
    if (change === 'state_change') {
      await act(async () => root.render(<Harness value={options(true)} />))
      const assertion = expect(pending).resolves.toMatchObject({ ok: false, error: { code: 'AUDIO_RETRY_NOT_AVAILABLE' } })
      release(); await assertion
    } else {
      controller.abort(new Error('Stop before changing state.'))
      const assertion = expect(pending).rejects.toThrow('Stop before changing state.')
      release(); await assertion
    }
    expect(value.retryListeningAudio).not.toHaveBeenCalled()
  })
  it('registers serializable standard metadata with explicit read and output trust hints', async () => {
    await act(async () => root.render(<Harness value={options(true)} />))
    const mutations = new Set(['open_practice', 'retry_ielts_listening_audio', 'install_ielts_practice_set', 'install_assessment',
      'attach_ielts_writing_evaluation', 'attach_ielts_speaking_evaluation', 'attach_assessment_evaluation',
      'set_ielts_speaking_interview', 'save_ielts_objective_explanation'])
    for (const tool of registered.values()) {
      expect(tool.name).toMatch(/^[a-zA-Z0-9_.-]{1,128}$/)
      expect(tool.description.trim()).not.toBe('')
      expect(JSON.parse(JSON.stringify(tool.inputSchema))).toEqual(tool.inputSchema)
      expect(typeof tool.inputSchema).toBe('object')
      expect(tool.annotations?.readOnlyHint).toBe(!mutations.has(tool.name))
      expect(typeof tool.annotations?.untrustedContentHint).toBe('boolean')
      expect(tool).not.toHaveProperty('enabled')
      expect(tool).not.toHaveProperty('outputSchema')
    }
    for (const name of ['open_practice', 'retry_ielts_listening_audio']) expect(registered.get(name)!.annotations?.untrustedContentHint).toBe(true)
    await expect(registered.get('get_practice_context')!.execute({}, undefined as never)).resolves.toMatchObject({ ok: true, data: { capabilities: { available: expect.any(Array) } } })
  })
  it('keeps installed-content discovery live while protecting drafts and authoring access', async () => {
    const value = options(true)
    const packageId = satPracticeAssessment.packageId
    await act(async () => root.render(<Harness value={value} />))
    const read = registered.get('get_assessment_content')!
    const execution = { signal: new AbortController().signal }
    await expect(read.execute({ packageId }, execution)).resolves.toMatchObject({ ok: true, data: { source: 'built-in', canReplace: false, scope: { completePackage: true } } })
    for (const input of [{}, { packageId, itemId: '' }, { packageId, view: 'invalid' }]) {
      await expect(read.execute(input, execution)).resolves.toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } })
    }
    await expect(read.execute({ packageId: 'missing' }, execution)).resolves.toMatchObject({ ok: false, error: { code: 'PRACTICE_NOT_FOUND' } })
    const exam = { ...value, workspace: { ...value.workspace, assessment: { ...initialAssessmentSession, view: 'assessment' as const,
      attemptId: crypto.randomUUID(), packageId, packageSnapshot: satPracticeAssessment } } }
    await act(async () => root.render(<Harness value={exam} />))
    await expect(read.execute({ packageId, itemId: 'rw-1' }, execution)).resolves.toMatchObject({ ok: false, error: { code: 'ACTIVE_ATTEMPT' } })
    const summary = await read.execute({ packageId, view: 'summary' }, execution)
    expect(summary).toMatchObject({ ok: true, data: { authoringAccess: { allowed: false, blockingReason: { code: 'ACTIVE_ATTEMPT' } } } })
    expect(JSON.stringify(summary)).not.toContain('"scoring"')
    const parked = { ...exam, workspace: { ...exam.workspace, assessment: { ...exam.workspace.assessment, view: 'home' as const },
      assessments: [...value.workspace.assessments, { ...satPracticeAssessment, packageId: 'unrelated', source: 'agent' as const }] } }
    await act(async () => root.render(<Harness value={parked} />))
    await expect(read.execute({ packageId }, execution)).resolves.toMatchObject({ ok: false, error: { code: 'ACTIVE_ATTEMPT' } })
    await expect(read.execute({ packageId: 'unrelated' }, execution)).resolves.toMatchObject({ ok: true, data: { canReplace: true } })
    const review = { ...value, workspace: { ...value.workspace, native: { ...initialSession, view: 'review' as const } } }
    await act(async () => root.render(<Harness value={review} />))
    await expect(read.execute({ packageId }, execution)).resolves.toMatchObject({ ok: false, error: { code: 'TOOL_NOT_AVAILABLE' } })
    expect(registered.get('get_assessment_content')).toBe(read)
    expect(register).toHaveBeenCalledTimes(22)
  })
  it('keeps the same activity reader available on home, an active exam, and results', async () => {
    await act(async () => root.render(<Harness value={options(true)} />))
    const tool = registered.get('get_practice_activity')!
    for (const view of ['home', 'exam', 'result'] as const) {
      const value = options(view === 'home')
      value.workspace.native = { ...initialSession, view, currentSection: 'reading' }
      value.context = getPracticeContext(value.workspace.native, value.workspace.assessment)
      const before = JSON.stringify(value.workspace)
      await act(async () => root.render(<Harness value={value} />))
      expect(registered.get('get_practice_activity')).toBe(tool)
      await expect(tool.execute({}, { signal: new AbortController().signal })).resolves.toEqual({ ok: true, data: { items: [], nextOffset: null } })
      expect(JSON.stringify(value.workspace)).toBe(before)
    }
    expect(readActivity).toHaveBeenCalledWith({}, { limit: 5, offset: 0 })
    expect(register).toHaveBeenCalledTimes(22)
  })
  it.each(['reading', 'listening', 'writing', 'speaking', 'assessment'] as const)(
    'returns schemas without examples for a %s draft, including while paused or viewing history', async kind => {
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
          expect(result).toMatchObject({ ok: true, data: { examplesIncluded: false } })
          expect(result).not.toHaveProperty('data.exampleDocument')
          expect(result).not.toHaveProperty('data.examplePackage')
          expect(result).toHaveProperty(name === 'get_ielts_authoring_kit' ? 'data.documentSchema' : 'data.packageSchema')
        }
        await expect(registered.get('get_practice_context')!.execute({}, config)).resolves.toMatchObject({ ok: true })
        expect(JSON.stringify(value.workspace)).toBe(before)
      }
      // The same registered callbacks must unlock after the draft is finished.
      await act(async () => root.render(<Harness value={options(true)} />))
      for (const [name, input] of requests) await expect(registered.get(name)!.execute(input, config)).resolves.toMatchObject({ ok: true, data: { examplesIncluded: true } })
      expect(register).toHaveBeenCalledTimes(22)
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
    expect(register).toHaveBeenCalledTimes(22)
  })
  it('includes examples after completion but omits them while another family has a draft', async () => {
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
    await expect(tool.execute({ section: 'reading' }, config)).resolves.toMatchObject({ ok: true, data: { examplesIncluded: false } })
    expect(register).toHaveBeenCalledTimes(22)
  })
  it('omits examples for a parked IELTS draft even with no current slot', async () => {
    const value = options(true)
    value.workspace.native = { ...initialSession, pausedDrafts: [{ ...initialSession, mode: 'section', currentSection: 'speaking',
      attemptId: '11111111-1111-4111-8111-111111111111' }] }
    await act(async () => root.render(<Harness value={value} />))
    for (const name of ['get_ielts_authoring_kit', 'get_assessment_authoring_kit']) {
      await expect(registered.get(name)!.execute(name === 'get_ielts_authoring_kit' ? { section: 'writing' } : { template: 'minimal-objective' }, { signal: new AbortController().signal })).resolves.toMatchObject({ ok: true, data: { examplesIncluded: false } })
    }
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
    expect(register).toHaveBeenCalledTimes(22)
  })
  it('keeps the same catalog through 30 context changes and rejects wrong-state execution', async () => {
    await act(async () => root.render(<Harness value={options(true)} />))
    expect(registered.size).toBe(22)
    const original = [...registered.values()]
    const metadata = JSON.stringify(original.map(({ execute: _execute, ...descriptor }) => descriptor))
    for (let index = 0; index < 30; index++) {
      await act(async () => root.render(<Harness value={options(index % 2 === 0)} />))
      expect([...registered.values()]).toEqual(original)
    }
    expect(register).toHaveBeenCalledTimes(22)
    expect(JSON.stringify([...registered.values()].map(({ execute: _execute, ...descriptor }) => descriptor))).toBe(metadata)
    const callOptions = { signal: new AbortController().signal }
    await expect(registered.get('install_assessment')!.execute({}, callOptions)).resolves.toMatchObject({ ok: false, error: { code: 'TOOL_NOT_AVAILABLE' } })
    await expect(registered.get('get_ielts_writing_submission')!.execute({}, callOptions)).resolves.toMatchObject({ ok: false, error: { code: 'NO_VISIBLE_SUBMISSION' } })
    await expect(registered.get('set_ielts_speaking_interview')!.execute(defaultSpeakingPlan, callOptions)).resolves.toMatchObject({ ok: false, error: { code: 'SPEAKING_NOT_OPEN' } })
    await act(async () => root.render(<Harness value={options(true)} />))
    await expect(registered.get('get_ielts_authoring_kit')!.execute({ section: 'writing' }, callOptions)).resolves.toMatchObject({ ok: true })
    expect(register).toHaveBeenCalledTimes(22)
  })
  it('surfaces registration failure and removes partial registrations', async () => {
    register.mockRejectedValueOnce(new Error('Registration failed'))
    await act(async () => root.render(<Harness value={options(true)} />))
    expect(container.textContent).toBe('error')
    expect(registered.size).toBe(0)
  })
  it.each([undefined, {}])('reports an absent or incomplete WebMCP API as unavailable', async api => {
    Object.defineProperty(document, 'modelContext', { configurable: true, value: api })
    await act(async () => root.render(<Harness value={options(true)} />))
    expect(container.textContent).toBe('unavailable')
  })
})
