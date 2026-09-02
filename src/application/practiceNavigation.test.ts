import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { SQLocal } from 'sqlocal'
import { listeningDocument, readingDocument } from '@/content/objective'
import { writingDocument } from '@/content/writing'
import { satPracticeAssessment } from '@/content/sat'
import { initialSession, sessionReducer } from '@/domain/session'
import { initialAssessmentSession, assessmentSessionReducer } from '@/domain/assessmentSession'
import { gradeAssessment } from '@/domain/assessment'
import { createIeltsRepository } from '@/infrastructure/database/ieltsRepository'
import { createAssessmentRepository } from '@/infrastructure/database/assessmentRepository'
import { createContentStore } from '@/infrastructure/database/contentRepository'
import { migrateDatabase } from '@/infrastructure/database/migrations'
import { readPracticeLibrary, readPracticeHistory } from '@/infrastructure/database/practiceDiscovery'
import { createPracticeTools } from '@/webmcp/practiceTools'
import { createIeltsCommands } from './ieltsCommands'
import { createAssessmentCommands } from './assessmentCommands'
import { createPracticeNavigation, getResumablePractices, type PracticeWorkspace } from './practiceNavigation'
import { getPracticeContext } from './practiceContext'
import { defaultSpeakingPlan } from '@/domain/speakingPlan'

let database: SQLocal
const dates = { startedAt: '2026-09-01T10:00:00.000Z', submittedAt: '2026-09-01T10:15:00.000Z' }
const page = { limit: 25, offset: 0 }
beforeAll(() => vi.stubGlobal('Worker', class TestWorker {}))
afterAll(() => vi.unstubAllGlobals())
beforeEach(async () => {
  let connected!: () => void
  const ready = new Promise<void>(resolve => { connected = resolve })
  database = new SQLocal({ databasePath: ':memory:', onConnect: connected, onInit: sql => [sql`PRAGMA foreign_keys = ON`] })
  await ready; await migrateDatabase(database)
})
afterEach(async () => { await database.destroy(true) })

function setup() {
  const workspace: PracticeWorkspace = { native: initialSession, assessment: initialAssessmentSession,
    content: { listening: listeningDocument, reading: readingDocument, writing: writingDocument }, assessments: [satPracticeAssessment],
    listeningAudio: { contentKey: listeningDocument.contentKey, source: 'bundled', phase: 'ready', readyToPlay: true, completedChunks: 0, totalChunks: 1, error: null, canRetry: false } }
  const contentStore = createContentStore(database, undefined, Object.values(workspace.content))
  const nativeRepository = createIeltsRepository(database)
  const assessmentRepository = createAssessmentRepository(database)
  const native = createIeltsCommands({ getState: () => workspace.native, dispatch: action => { workspace.native = sessionReducer(workspace.native, action) },
    getContent: () => workspace.content, setContent: content => { workspace.content = content }, getRepository: async () => nativeRepository, getContentStore: async () => contentStore })
  const assessment = createAssessmentCommands({ getState: () => workspace.assessment, dispatch: action => { workspace.assessment = assessmentSessionReducer(workspace.assessment, action) },
    getAssessments: () => workspace.assessments, setAssessments: update => { workspace.assessments = update(workspace.assessments) }, setHistory: vi.fn(), getRepository: async () => assessmentRepository })
  const deps = { getWorkspace: () => workspace, native, assessment, loadContent: contentStore.loadByKey }
  const navigate = createPracticeNavigation(deps)
  return { workspace, nativeRepository, assessmentRepository, native, assessment, navigate, deps, contentStore }
}

describe('semantic practice navigation and discovery', () => {
  it('reports content activation locks from a Full IELTS draft without blocking reuse of the active set', async () => {
    const h = setup()
    const otherReading = { ...readingDocument, contentKey: 'other-reading' }
    await h.contentStore.saveAndActivate(otherReading)
    await h.navigate({ action: 'start', kind: 'full_ielts' })
    await h.navigate({ action: 'library' })
    const library = await readPracticeLibrary(database, h.workspace, { ...page, kind: 'reading' })
    expect(library.items.find(item => 'contentKey' in item && item.contentKey === otherReading.contentKey)).toMatchObject({ startability: { canStart: false, blockingReason: { code: 'ACTIVE_ATTEMPT' } } })
    expect(library.items.find(item => 'contentKey' in item && item.contentKey === readingDocument.contentKey)).toMatchObject({ startability: { canStart: true } })
    await expect(h.navigate({ action: 'start', kind: 'reading', contentKey: otherReading.contentKey })).rejects.toMatchObject({ code: 'ACTIVE_ATTEMPT' })
  })
  it('reports selection metadata and start blockers that agree with navigation', async () => {
    const h = setup()
    let library = await readPracticeLibrary(database, h.workspace, page)
    expect(library.items).toContainEqual(expect.objectContaining({ kind: 'reading', durationSeconds: 3600, itemCount: 40, partCount: 3, difficulty: null, startability: { canStart: true, blockingReason: null } }))
    expect(library.items).toContainEqual(expect.objectContaining({ kind: 'assessment', itemCount: 12, subject: satPracticeAssessment.metadata.subject, difficulty: satPracticeAssessment.metadata.difficulty }))
    await h.navigate({ action: 'start', kind: 'reading' })
    library = await readPracticeLibrary(database, h.workspace, page)
    expect(library.items.find(item => item.kind === 'reading')).toMatchObject({ startability: { canStart: false, blockingReason: { code: 'ACTIVE_ATTEMPT', attemptId: h.workspace.native.attemptId } } })
    expect(library.items.find(item => item.kind === 'writing')).toMatchObject({ startability: { canStart: true } })
    await expect(h.navigate({ action: 'start', kind: 'reading' })).rejects.toMatchObject({ code: 'ACTIVE_ATTEMPT' })
    h.workspace.listeningAudio.readyToPlay = false
    library = await readPracticeLibrary(database, h.workspace, page)
    expect(library.items.find(item => item.kind === 'listening')).toMatchObject({ startability: { canStart: false, blockingReason: { code: 'LISTENING_AUDIO_NOT_READY' } } })
    h.workspace.native = { ...initialSession, view: 'exam', currentSection: 'speaking' }
    library = await readPracticeLibrary(database, h.workspace, page)
    expect(library.items.every(item => item.startability.blockingReason?.code === 'SPEAKING_IN_PROGRESS')).toBe(true)
    h.workspace.canLeaveSpeaking = true
    library = await readPracticeLibrary(database, h.workspace, page)
    expect(library.items.find(item => item.kind === 'writing')).toMatchObject({ startability: { canStart: true } })
  })
  it('persists unscored Speaking feedback through commands, history and learning summary', async () => {
    const h = setup(); await h.navigate({ action: 'start', kind: 'speaking' })
    const submission = await h.native.submitSpeaking({ contentKey: 'skipped-speaking', startedAt: dates.startedAt,
      recordings: [{ status: 'skipped', promptId: 1, partLabel: 'Part 1', sequence: 0, promptText: 'Describe your hometown.', timeLimitSeconds: 30, durationMs: 0, transcript: '', audio: null }] })
    await expect(h.native.attachSpeakingEvaluation({ attemptId: submission.attemptId, overallBand: 0, fluencyCoherence: 0, lexicalResource: 0, grammaticalRangeAccuracy: 0, summary: 'No evidence.', strengths: ['None'], improvements: ['Record answers.'] })).rejects.toMatchObject({ code: 'INSUFFICIENT_SPEAKING_EVIDENCE' })
    const evaluation = await h.native.attachSpeakingEvaluation({ attemptId: submission.attemptId, status: 'insufficient_evidence', reason: 'Every question was skipped.', summary: 'No band can be assigned.', strengths: [], improvements: ['Record answers.'] })
    expect((await h.nativeRepository.readSpeakingAttempt(submission.attemptId))?.evaluation).toEqual(evaluation)
    expect(getPracticeContext(h.workspace.native, h.workspace.assessment).submissions[0]?.evaluationStatus).toBe('insufficient_evidence')
    const history = await readPracticeHistory(database, { ...page, kind: 'speaking' })
    expect(history.items[0]).toMatchObject({ evaluationStatus: 'insufficient_evidence' })
    expect(history.items[0]).not.toHaveProperty('band')
    expect((await h.nativeRepository.readLearningSummary(5)).sections.speaking.recent?.[0]).toMatchObject({ evaluationStatus: 'insufficient_evidence' })
    await expect(h.native.attachSpeakingEvaluation(evaluation)).rejects.toThrow()
  })
  it('can leave empty Speaking setup and switch sections without losing either draft', async () => {
    const h = setup();
    const navigate = createPracticeNavigation({ ...h.deps, canLeaveSpeaking: () => true });
    await navigate({ action: 'start', kind: 'speaking' });
    const speakingId = h.workspace.native.attemptId!;
    h.native.configureSpeakingPlan({ ...defaultSpeakingPlan, title: 'Preserved questions' });
    await navigate({ action: 'library' });
    await navigate({ action: 'start', kind: 'reading' });
    h.native.setObjectiveAnswer('reading', 1, 'TRUE');
    const readingId = h.workspace.native.attemptId!;
    expect(getResumablePractices(h.workspace)).toHaveLength(2);
    await navigate({ action: 'resume', kind: 'ielts', attemptId: speakingId });
    expect(h.workspace.native).toMatchObject({ attemptId: speakingId, currentSection: 'speaking' });
    expect(h.workspace.native.speakingPlan?.title).toBe('Preserved questions');
    await navigate({ action: 'resume', kind: 'ielts', attemptId: readingId });
    expect(h.workspace.native).toMatchObject({ attemptId: readingId, answers: { reading: { 1: 'TRUE' } } });
  });
  it('allows unrelated content installation but never replaces content used by a parked draft or full exam', async () => {
    const h = setup();
    await h.navigate({ action: 'start', kind: 'speaking' });
    h.native.goHome();
    const speakingId = h.workspace.native.attemptId;
    const custom = { ...readingDocument, contentKey: 'reading-while-speaking-paused' };
    await h.native.installContent(custom);
    expect(h.workspace.native.attemptId).toBe(speakingId);
    await h.navigate({ action: 'start', kind: 'reading', contentKey: custom.contentKey });
    await h.navigate({ action: 'start', kind: 'writing' });
    await expect(h.native.installContent(readingDocument)).rejects.toMatchObject({ code: 'ACTIVE_ATTEMPT' });
    expect(h.workspace.content.reading).toEqual(custom);
    await h.navigate({ action: 'start', kind: 'full_ielts' });
    await h.navigate({ action: 'library' });
    await expect(h.native.installContent(listeningDocument)).rejects.toMatchObject({ code: 'ACTIVE_ATTEMPT' });
    expect(getResumablePractices(h.workspace)).toHaveLength(4);
  });
  it('lists built-in and archived native sets without questions or answers, then starts the chosen archived set', async () => {
    const h = setup()
    const saved = { ...readingDocument, contentKey: 'archived-reading', name: 'Archived Reading' }
    await h.contentStore.saveAndActivate(saved)
    const library = await readPracticeLibrary(database, h.workspace, page)
    expect(library.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ contentKey: saved.contentKey, active: false }),
      expect.objectContaining({ contentKey: readingDocument.contentKey, active: true }),
      expect.objectContaining({ packageId: satPracticeAssessment.packageId }),
      expect.objectContaining({ kind: 'speaking' }),
    ]))
    expect(JSON.stringify(library)).not.toMatch(/"(parts|tasks|questions|answers|scoring)"/)
    await h.navigate({ action: 'start', kind: 'reading', contentKey: saved.contentKey })
    expect(h.workspace.content.reading).toEqual(saved)
    expect(h.workspace.native).toMatchObject({ view: 'exam', currentSection: 'reading', mode: 'section' })
  })

  it('preserves both families’ answers, positions and attempt IDs when opening history, going home and resuming', async () => {
    const h = setup()
    await h.navigate({ action: 'start', kind: 'writing' })
    h.native.setWritingDraft(1, 'My unfinished writing.'); h.native.setPart('writing', 2); h.native.tick('writing')
    const nativeId = h.workspace.native.attemptId!
    await h.navigate({ action: 'start', kind: 'assessment', packageId: satPracticeAssessment.packageId })
    h.assessment.setResponse('rw-1', 'b')
    const assessmentId = h.workspace.assessment.attemptId!
    const saved = await h.assessmentRepository.saveAttempt({ ...dates, attemptId: crypto.randomUUID(), packageId: satPracticeAssessment.packageId,
      package: satPracticeAssessment, responses: {}, result: gradeAssessment(satPracticeAssessment, {}) })
    await h.navigate({ action: 'result', kind: 'assessment', attemptId: saved.attemptId })
    expect(getPracticeContext(h.workspace.native, h.workspace.assessment).submissions[0]?.attemptId).toBe(saved.attemptId)
    expect(getResumablePractices(h.workspace)).toHaveLength(2)
    await h.navigate({ action: 'library' })
    await h.navigate({ action: 'resume', kind: 'ielts', attemptId: nativeId })
    expect(h.workspace.native).toMatchObject({ view: 'exam', attemptId: nativeId, writingDrafts: { 1: 'My unfinished writing.' }, partBySection: { writing: 2 }, secondsRemaining: { writing: 3599 } })
    await h.navigate({ action: 'resume', kind: 'assessment', attemptId: assessmentId })
    expect(h.workspace.assessment).toMatchObject({ view: 'assessment', attemptId: assessmentId, responses: { 'rw-1': 'b' }, itemId: 'rw-1' })
    expect(h.workspace.native.view).toBe('home')
    await expect(h.navigate({ action: 'start', kind: 'writing' })).rejects.toMatchObject({ code: 'ACTIVE_ATTEMPT' })
    await expect(h.navigate({ action: 'start', kind: 'assessment', packageId: satPracticeAssessment.packageId })).rejects.toMatchObject({ code: 'ACTIVE_ATTEMPT' })
    expect(h.workspace.native.writingDrafts[1]).toBe('My unfinished writing.')
  })

  it('gates Listening readiness, starts Full IELTS at Listening and resumes the next canonical section', async () => {
    const h = setup(); h.workspace.listeningAudio.readyToPlay = false
    await expect(h.navigate({ action: 'start', kind: 'full_ielts' })).rejects.toMatchObject({ code: 'LISTENING_AUDIO_NOT_READY' })
    expect(h.workspace.native.attemptId).toBeNull()
    h.workspace.listeningAudio.readyToPlay = true
    await h.navigate({ action: 'start', kind: 'full_ielts' })
    expect(h.workspace.native).toMatchObject({ mode: 'full', currentSection: 'listening' })
    await h.native.submitObjective('listening')
    const completedId = h.workspace.native.attemptId!
    await h.navigate({ action: 'result', kind: 'listening', attemptId: completedId })
    expect(h.workspace.native.review).toMatchObject({ kind: 'objective', section: 'listening', submission: { attemptId: completedId } })
    await h.navigate({ action: 'library' })
    expect(getResumablePractices(h.workspace)[0]).toMatchObject({ section: 'reading', attemptId: completedId })
    await h.navigate({ action: 'resume', kind: 'ielts', attemptId: completedId })
    expect(h.workspace.native).toMatchObject({ view: 'exam', currentSection: 'reading', completedSections: ['listening'] })
    expect(h.workspace.native.attemptId).not.toBe(completedId)
  })

  it('activates a different saved Listening set without starting until its audio is ready', async () => {
    const h = setup()
    const document = { ...listeningDocument, contentKey: 'saved-listening' }
    await h.contentStore.saveAndActivate(document)
    await expect(h.navigate({ action: 'start', kind: 'listening', contentKey: document.contentKey })).resolves.toMatchObject({ status: 'audio_preparing' })
    expect(h.workspace.content.listening.contentKey).toBe(document.contentKey)
    expect(h.workspace.native.attemptId).toBeNull()
    h.workspace.listeningAudio.readyToPlay = false
    await expect(h.navigate({ action: 'start', kind: 'listening', contentKey: document.contentKey })).rejects.toMatchObject({ code: 'LISTENING_AUDIO_NOT_READY' })
    h.workspace.listeningAudio.readyToPlay = true
    await h.navigate({ action: 'start', kind: 'listening', contentKey: document.contentKey })
    expect(h.workspace.native).toMatchObject({ view: 'exam', currentSection: 'listening' })
  })

  it('reports an invalid stored set without deleting it or hiding valid practice', async () => {
    const h = setup()
    await database.sql`INSERT INTO content_documents (content_key, section, schema_version, document_json, installed_at) VALUES ('broken-set', 'reading', 1, '{}', '2026-09-01')`
    const library = await readPracticeLibrary(database, h.workspace, { ...page, kind: 'reading' })
    expect(library.unavailableContentKeys).toEqual(['broken-set'])
    expect(library.items).toEqual([expect.objectContaining({ contentKey: readingDocument.contentKey })])
    expect(await database.sql`SELECT content_key FROM content_documents WHERE content_key = 'broken-set'`).toHaveLength(1)
  })

  it('does not leave Speaking, switch to nonexistent practice, or silently resume another ID', async () => {
    const h = setup()
    await expect(h.navigate({ action: 'start', kind: 'assessment', packageId: 'missing' })).rejects.toMatchObject({ code: 'PRACTICE_NOT_FOUND' })
    await expect(h.navigate({ action: 'start', kind: 'reading', contentKey: 'missing' })).rejects.toMatchObject({ code: 'PRACTICE_NOT_FOUND' })
    await expect(h.navigate({ action: 'resume', kind: 'ielts', attemptId: crypto.randomUUID() })).rejects.toMatchObject({ code: 'RESUMABLE_ATTEMPT_NOT_FOUND' })
    await expect(h.navigate({ action: 'result', kind: 'writing', attemptId: crypto.randomUUID() })).rejects.toMatchObject({ code: 'ATTEMPT_NOT_FOUND' })
    await h.navigate({ action: 'start', kind: 'speaking' })
    const original = h.workspace.native
    await expect(h.navigate({ action: 'library' })).rejects.toMatchObject({ code: 'SPEAKING_IN_PROGRESS' })
    await expect(h.navigate({ action: 'start', kind: 'assessment', packageId: satPracticeAssessment.packageId })).rejects.toMatchObject({ code: 'SPEAKING_IN_PROGRESS' })
    expect(h.workspace.native).toBe(original)
  })

  it('serializes navigation while loading and rechecks drafts before activating content', async () => {
    const h = setup()
    let resolve!: (value: typeof readingDocument) => void
    const pending = new Promise<typeof readingDocument>(r => { resolve = r })
    const navigate = createPracticeNavigation({ ...h.deps, loadContent: () => pending })
    const first = navigate({ action: 'start', kind: 'reading', contentKey: 'other-reading' })
    await expect(navigate({ action: 'library' })).rejects.toMatchObject({ code: 'NAVIGATION_BUSY' })
    h.native.start('section', 'reading')
    resolve({ ...readingDocument, contentKey: 'other-reading' })
    await expect(first).rejects.toMatchObject({ code: 'ACTIVE_ATTEMPT' })
    expect(h.workspace.content.reading.contentKey).toBe(readingDocument.contentKey)
  })

  it.each(['writing', 'speaking'] as const)('opens and evaluates a pending historical %s result without replacing the current draft', async kind => {
    const h = setup(); const attemptId = crypto.randomUUID()
    if (kind === 'writing') await h.nativeRepository.saveWritingAttempt({ ...dates, attemptId, contentKey: writingDocument.contentKey,
      tasks: [{ task: writingDocument.tasks[0], response: 'A test response.', wordCount: 3 }, { task: writingDocument.tasks[1], response: 'A test response.', wordCount: 3 }] })
    else await h.nativeRepository.saveSpeakingAttempt({ ...dates, attemptId, contentKey: 'test-speaking', recordings: [{ status: 'answered',
      promptId: 1, partLabel: 'Part 1', sequence: 0, promptText: 'Where do you live?', transcript: 'I live by the sea.', durationMs: 3000, timeLimitSeconds: 30, audio: new Blob(['private']) }] })
    h.native.start('section', 'reading'); h.native.setObjectiveAnswer('reading', 1, 'TRUE')
    const draftId = h.workspace.native.attemptId
    await h.navigate({ action: 'result', kind, attemptId })
    expect(getPracticeContext(h.workspace.native, h.workspace.assessment).submissions[0]).toMatchObject({ attemptId, evaluationStatus: 'awaiting_evaluation' })
    if (kind === 'writing') {
      const criterion = { band: 6, taskAchievement: 6, coherenceCohesion: 6, lexicalResource: 6, grammaticalRange: 6, feedback: 'Fixture.', annotations: [] }
      await h.native.attachWritingEvaluation({ attemptId, overallBand: 6, summary: 'Fixture.', task1: criterion, task2: criterion })
    } else await h.native.attachSpeakingEvaluation({ attemptId, overallBand: 6, fluencyCoherence: 6, lexicalResource: 6, grammaticalRangeAccuracy: 6, summary: 'Fixture.', strengths: ['Clear.'], improvements: ['Detail.'] })
    expect(h.workspace.native.review).toMatchObject({ evaluation: { attemptId, overallBand: 6 } })
    expect(h.workspace.native).toMatchObject({ attemptId: draftId, answers: { reading: { 1: 'TRUE' } } })
    expect(getPracticeContext(h.workspace.native, h.workspace.assessment).submissions[0]?.evaluationStatus).toBe('evaluated')
    h.native.closeReview(); await h.navigate({ action: 'result', kind, attemptId })
    expect(h.workspace.native.review).toMatchObject({ evaluation: { overallBand: 6 } })
    expect(await readPracticeHistory(database, { ...page, kind })).toMatchObject({ items: [{ attemptId, evaluationStatus: 'evaluated', band: 6 }] })
  })

  it('paginates combined history past 50 attempts and exposes only score metadata', async () => {
    const h = setup()
    expect(await readPracticeHistory(database, page)).toEqual({ items: [], nextOffset: null })
    for (let index = 0; index < 53; index++) await h.assessmentRepository.saveAttempt({ ...dates, attemptId: crypto.randomUUID(),
      packageId: satPracticeAssessment.packageId, package: satPracticeAssessment, responses: { 'rw-1': 'private-answer' }, result: gradeAssessment(satPracticeAssessment, {}) })
    await h.nativeRepository.saveWritingAttempt({ ...dates, submittedAt: '2026-09-02T10:00:00.000Z', attemptId: crypto.randomUUID(), contentKey: writingDocument.contentKey,
      tasks: [{ task: writingDocument.tasks[0], response: 'Private essay.', wordCount: 2 }, { task: writingDocument.tasks[1], response: 'Private essay.', wordCount: 2 }] })
    const first = await readPracticeHistory(database, page)
    expect(first.items[0]).toMatchObject({ kind: 'writing', evaluationStatus: 'awaiting_evaluation' })
    const second = await readPracticeHistory(database, { ...page, offset: first.nextOffset! })
    const third = await readPracticeHistory(database, { ...page, offset: second.nextOffset! })
    expect(new Set([...first.items, ...second.items, ...third.items].map(a => a.attemptId)).size).toBe(54)
    expect(third.nextOffset).toBeNull()
    expect(await readPracticeHistory(database, { ...page, kind: 'writing' })).toMatchObject({ items: [{ kind: 'writing' }], nextOffset: null })
    expect(first.items[1]).toHaveProperty('domains')
    expect(JSON.stringify([first, second, third])).not.toMatch(/private-answer|Private essay|"(responses|scoring|itemResults|tasks)"/)
  })

  it('validates tool inputs, keeps paging optional, and rejects cancelled reads', async () => {
    const h = setup()
    const readLibrary = vi.fn(input => readPracticeLibrary(database, h.workspace, input))
    const tools = createPracticeTools({ readLibrary, readHistory: input => readPracticeHistory(database, input), navigate: h.navigate })
    const options = { signal: new AbortController().signal }
    expect(tools[0]!.inputSchema).not.toHaveProperty('required')
    await expect(tools[0]!.execute({}, options)).resolves.toMatchObject({ ok: true })
    expect(readLibrary).toHaveBeenCalledWith({ limit: 10, offset: 0 })
    for (const input of [{ limit: 26 }, { offset: -1 }, { kind: 'unknown' }]) await expect(tools[0]!.execute(input, options)).resolves.toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } })
    for (const input of [{ action: 'result' }, { action: 'start', kind: 'assessment' }, { action: 'library', attemptId: crypto.randomUUID() }]) await expect(tools[2]!.execute(input, options)).resolves.toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } })
    await expect(tools[2]!.execute({ action: 'result', kind: 'writing', attemptId: crypto.randomUUID() }, options)).resolves.toMatchObject({ ok: false, error: { code: 'ATTEMPT_NOT_FOUND' } })
    const abort = new AbortController(); abort.abort()
    await expect(tools[0]!.execute({}, { signal: abort.signal })).rejects.toThrow()
  })
})
