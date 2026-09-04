import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { SQLocal } from 'sqlocal'
import { listeningDocument, readingDocument } from '@/content/objective'
import { writingDocument } from '@/content/writing'
import { satPracticeAssessment } from '@/content/sat'
import { initialSession, sessionReducer } from '@/domain/session'
import { initialAssessmentSession, assessmentSessionReducer } from '@/domain/assessmentSession'
import { gradeAssessment, parseAssessmentAuthoringPackage } from '@/domain/assessment'
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
import { gradeObjectiveDocument } from '@/domain/objectiveScoring'
import { createObjectiveReviewTool } from '@/webmcp/objectiveReviewTool'
import { createObjectiveExplanationTool } from '@/webmcp/objectiveExplanationTool'
import { restoreBackup } from '@/infrastructure/database/backupRepository'
import { createAssessmentContentTool } from '@/webmcp/assessmentContentTool'
import { createAssessmentAuthoringToolDefinitions } from '@/webmcp/assessmentTools'

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
    publishSession: (next, content) => { workspace.native = next; if (content) workspace.content = content }, persistSession: () => {},
    getContent: () => workspace.content, setContent: content => { workspace.content = content }, getRepository: async () => nativeRepository, getContentStore: async () => contentStore })
  const assessment = createAssessmentCommands({ getState: () => workspace.assessment, dispatch: action => { workspace.assessment = assessmentSessionReducer(workspace.assessment, action) },
    getAssessments: () => workspace.assessments, setAssessments: update => { workspace.assessments = update(workspace.assessments) }, getRepository: async () => assessmentRepository })
  const deps = { getWorkspace: () => workspace, native, assessment, loadContent: contentStore.loadByKey }
  const navigate = createPracticeNavigation(deps)
  return { workspace, nativeRepository, assessmentRepository, native, assessment, navigate, deps, contentStore }
}

describe('semantic practice navigation and discovery', () => {
  it('retrieves installed authoring content after reload and revises one question without changing history or other content', async () => {
    const h = setup()
    const { source: _source, ...original } = structuredClone(satPracticeAssessment)
    const packageId = 'round-trip-revision'
    await h.assessment.installAssessment({ ...original, packageId })
    const snapshot = h.workspace.assessments.find(assessment => assessment.packageId === packageId)!
    const attemptId = crypto.randomUUID()
    await h.assessmentRepository.saveAttempt({ ...dates, attemptId, packageId, package: snapshot, responses: {}, result: gradeAssessment(snapshot, {}) })
    h.workspace.assessments = await h.assessmentRepository.loadPackages()
    h.native.start('section', 'writing'); h.native.setWritingDraft(1, 'Keep this unfinished report.'); await h.native.goHome()
    const read = createAssessmentContentTool(() => h.workspace)
    const options = { signal: new AbortController().signal }
    const output = await read.execute({ packageId }, options) as { data: { package: unknown } }
    const replacement = parseAssessmentAuthoringPackage(output.data.package)
    expect(replacement).toEqual({ ...original, packageId })
    const lastPart = replacement.parts.at(-1)!
    lastPart.items.at(-1)!.prompt = [{ type: 'text', text: 'Revised final question with the same response contract.' }]
    replacement.revision += 1
    const install = createAssessmentAuthoringToolDefinitions({ openPractice: vi.fn(async () => ({ view: 'exam' })), installAssessment: h.assessment.installAssessment }).find(tool => tool.name === 'install_assessment')!
    await expect(install.execute(replacement, options)).resolves.toMatchObject({ ok: true })
    h.workspace.assessments = await h.assessmentRepository.loadPackages()
    const changed = h.workspace.assessments.find(assessment => assessment.packageId === packageId)!
    expect(changed).toEqual({ ...replacement, source: 'agent' })
    expect(changed.parts.slice(0, -1)).toEqual(snapshot.parts.slice(0, -1))
    expect(changed.parts.at(-1)!.items.slice(0, -1)).toEqual(snapshot.parts.at(-1)!.items.slice(0, -1))
    expect((await h.assessmentRepository.readAttempt(attemptId))?.submission.package).toEqual(snapshot)
    expect(h.workspace.native.writingDrafts[1]).toBe('Keep this unfinished report.')
    await expect(read.execute({ packageId, revision: 1 }, options)).resolves.toMatchObject({ ok: false, error: { code: 'ASSESSMENT_REVISION_CHANGED' } })
    await expect(install.execute({ ...replacement, title: 'Conflicting stale revision' }, options)).resolves.toMatchObject({ ok: false, error: { code: 'ASSESSMENT_INSTALL_CONFLICT' } })
    await expect(read.execute({ packageId, itemId: lastPart.items.at(-1)!.id, revision: 2 }, options)).resolves.toMatchObject({ data: { scope: { completePackage: false }, package: { parts: [{ items: [lastPart.items.at(-1)] }] } } })
    const fragment = await read.execute({ packageId, itemId: lastPart.items.at(-1)!.id }, options) as { data: { package: Record<string, unknown> } }
    await expect(install.execute(fragment.data.package, options)).resolves.toMatchObject({ ok: false, error: { code: 'INVALID_ASSESSMENT' } })
    expect(h.workspace.assessments.find(assessment => assessment.packageId === packageId)).toEqual(changed)
    h.assessment.start(packageId); h.assessment.goHome()
    await expect(read.execute({ packageId }, options)).resolves.toMatchObject({ ok: false, error: { code: 'ACTIVE_ATTEMPT' } })
    const summary = await read.execute({ packageId, view: 'summary' }, options)
    expect(summary).toMatchObject({ ok: true })
    expect(JSON.stringify(summary)).not.toContain('"scoring"')
    expect(JSON.stringify(summary)).not.toContain('Revised final question')
  })
  it.each(['reading', 'listening'] as const)('focuses a saved %s question and persists revisable explanations without changing answers or drafts', async section => {
    const h = setup()
    const document = h.workspace.content[section]
    const attemptId = crypto.randomUUID()
    const submission = await h.nativeRepository.saveObjectiveAttempt({ ...dates, attemptId, section, contentKey: document.contentKey, answers: { 28: 'Original response' }, result: gradeObjectiveDocument(document, { 28: 'Original response' }) })
    h.native.start('section', 'writing')
    h.native.setWritingDraft(1, 'Unfinished work to preserve.')
    const draftId = h.workspace.native.attemptId
    const navigation = createPracticeTools({ readLibrary: vi.fn(), readHistory: vi.fn(), navigate: h.navigate }).find(tool => tool.name === 'open_practice')!
    const options = { signal: new AbortController().signal }
    await expect(navigation.execute({ action: 'result', kind: section, attemptId, location: { questionId: 28 } }, options)).resolves.toMatchObject({ ok: true })
    expect(h.workspace.native.review).toMatchObject({ part: 3, selectedQuestionId: 28 })
    expect(getPracticeContext(h.workspace.native, h.workspace.assessment).reviewLocation).toMatchObject({ questionId: 28, part: 3, attemptId })
    const read = createObjectiveReviewTool({ readAttempt: h.nativeRepository.readObjectiveAttempt, readExplanations: h.nativeRepository.readObjectiveExplanations, loadContent: async () => document, visibleId: () => attemptId })
    const save = createObjectiveExplanationTool(h.native.saveObjectiveExplanation)
    const input = { attemptId, section, questionId: 28, explanation: 'Compare the wording in the passage or script with the submitted response.' }
    for (const invalid of [{ ...input, explanation: ' ' }, { ...input, questionId: 41 }, { ...input, expectedRevision: -1 }]) {
      await expect(save.execute(invalid, options)).resolves.toMatchObject({ ok: false, error: { code: 'INVALID_EXPLANATION' } })
    }
    await expect(save.execute({ ...input, attemptId: crypto.randomUUID() }, options)).resolves.toMatchObject({ ok: false, error: { code: 'ATTEMPT_NOT_CURRENT' } })
    expect(await h.nativeRepository.readObjectiveExplanations(attemptId)).toEqual([])
    const first = await save.execute(input, options)
    expect(first).toMatchObject({ ok: true, data: { explanation: { revision: 1 } } })
    await expect(save.execute(input, options)).resolves.toEqual(first)
    await expect(save.execute({ ...input, explanation: 'Changed feedback.' }, options)).resolves.toMatchObject({ ok: false, error: { code: 'EVALUATION_REVISION_REQUIRED' } })
    const revisions = await Promise.all([
      save.execute({ ...input, expectedRevision: 1, explanation: 'Corrected explanation A.' }, options),
      save.execute({ ...input, expectedRevision: 1, explanation: 'Corrected explanation B.' }, options),
    ])
    expect(revisions).toEqual(expect.arrayContaining([
      expect.objectContaining({ ok: true, data: expect.objectContaining({ explanation: expect.objectContaining({ revision: 2 }) }) }),
      expect.objectContaining({ ok: false, error: expect.objectContaining({ code: 'EVALUATION_REVISION_CONFLICT' }) }),
    ]))
    const [saved] = await h.nativeRepository.readObjectiveExplanations(attemptId)
    await expect(read.execute({ section, part: 3 }, options)).resolves.toMatchObject({ data: { questions: expect.arrayContaining([expect.objectContaining({ questionId: 28, explanation: saved })]) } })
    await h.navigate({ action: 'library' })
    await expect(save.execute(input, options)).resolves.toMatchObject({ ok: false, error: { code: 'ATTEMPT_NOT_CURRENT' } })
    await h.navigate({ action: 'result', kind: section, attemptId, location: { questionId: 28 } })
    expect(h.workspace.native.review).toMatchObject({ explanations: [saved] })
    expect(h.workspace.native).toMatchObject({ attemptId: draftId, writingDrafts: { 1: 'Unfinished work to preserve.' } })
    expect(await h.nativeRepository.readObjectiveAttempt(attemptId)).toEqual(submission)
    const before = structuredClone(h.workspace)
    for (const location of [{ questionId: 41 }, { correctionId: 'wrong-kind' }]) await expect(navigation.execute({ action: 'result', kind: section, attemptId, location }, options)).resolves.toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } })
    expect(h.workspace).toEqual(before)
    // The explanation and its revision are included in a real backup round trip.
    let connected!: () => void
    const ready = new Promise<void>(resolve => { connected = resolve })
    const destination = new SQLocal({ databasePath: ':memory:', onConnect: connected })
    try {
      await ready
      await migrateDatabase(destination)
      await restoreBackup(database, destination)
      expect(await createIeltsRepository(destination).readObjectiveExplanations(attemptId)).toEqual([saved])
    } finally { await destination.destroy(true) }
  })

  it('focuses exact Writing corrections across tasks and rejects missing or ambiguous IDs without navigation', async () => {
    const h = setup(); const attemptId = crypto.randomUUID()
    const submission = await h.nativeRepository.saveWritingAttempt({ ...dates, attemptId, contentKey: writingDocument.contentKey,
      tasks: [{ task: writingDocument.tasks[0], response: 'First response.', wordCount: 2 }, { task: writingDocument.tasks[1], response: 'Second response.', wordCount: 2 }] })
    const task = { band: 6, taskAchievement: 6, coherenceCohesion: 6, lexicalResource: 6, grammaticalRange: 6, feedback: 'Develop this response.' }
    await h.nativeRepository.saveWritingEvaluation({ attemptId, overallBand: 6, summary: 'Develop both responses.', evaluatedAt: dates.submittedAt,
      task1: { ...task, annotations: [{ id: 'detail', taskNumber: 1, originalText: 'First response.', type: 'coherence', suggestion: 'Add evidence.', explanation: 'Support the claim.' }] },
      task2: { ...task, annotations: [{ id: 'detail', taskNumber: 2, originalText: 'Second response.', type: 'coherence', suggestion: 'Give an example.', explanation: 'Make the argument concrete.' }, { id: 'unique', taskNumber: 2, originalText: 'Second response.', type: 'other', suggestion: 'Expand.', explanation: 'The essay is short.' }] } })
    await h.navigate({ action: 'result', kind: 'writing', attemptId, location: { correctionId: 'unique' } })
    expect(h.workspace.native.review).toMatchObject({ part: 2, selectedCorrectionId: 'unique' })
    const before = structuredClone(h.workspace)
    await expect(h.navigate({ action: 'result', kind: 'writing', attemptId, location: { correctionId: 'detail' } })).rejects.toMatchObject({ code: 'AMBIGUOUS_CORRECTION' })
    await expect(h.navigate({ action: 'result', kind: 'writing', attemptId, location: { correctionId: 'missing' } })).rejects.toMatchObject({ code: 'REVIEW_LOCATION_NOT_FOUND' })
    expect(h.workspace).toEqual(before)
    h.native.setReviewLocation({ taskNumber: 1, correctionId: 'detail' })
    expect(getPracticeContext(h.workspace.native, h.workspace.assessment).reviewLocation).toMatchObject({ taskNumber: 1, correctionId: 'detail' })
    expect((await h.nativeRepository.readWritingAttempt(attemptId))?.submission).toEqual(submission)
  })

  it('opens a universal review at an item and respects the saved review policy', async () => {
    const h = setup(); const attemptId = crypto.randomUUID()
    const assessment = satPracticeAssessment
    await h.assessmentRepository.saveAttempt({ ...dates, attemptId, packageId: assessment.packageId, package: assessment, responses: {}, result: gradeAssessment(assessment, {}) })
    await h.navigate({ action: 'result', kind: 'assessment', attemptId, location: { itemId: 'math-1' } })
    expect(h.workspace.assessment.review).toEqual({ filter: 'all', itemId: 'math-1' })
    expect(getPracticeContext(h.workspace.native, h.workspace.assessment).reviewLocation).toMatchObject({ itemId: 'math-1' })
    const before = structuredClone(h.workspace)
    await expect(h.navigate({ action: 'result', kind: 'assessment', attemptId, location: { itemId: 'missing' } })).rejects.toMatchObject({ code: 'REVIEW_LOCATION_NOT_FOUND' })
    expect(h.workspace).toEqual(before)
    const hidden = { ...assessment, review: { mode: 'none' as const } }; const hiddenId = crypto.randomUUID()
    await h.assessmentRepository.saveAttempt({ ...dates, attemptId: hiddenId, packageId: hidden.packageId, package: hidden, responses: {}, result: gradeAssessment(hidden, {}) })
    await expect(h.navigate({ action: 'result', kind: 'assessment', attemptId: hiddenId, location: { itemId: 'math-1' } })).rejects.toMatchObject({ code: 'REVIEW_UNAVAILABLE' })
    expect(h.workspace).toEqual(before)
  })
  it('discovers the saved standalone Speaking plan while open, parked and restored', async () => {
    const h = setup()
    const navigate = createPracticeNavigation({ ...h.deps, canLeaveSpeaking: () => true })
    const readSpeaking = async () => (await readPracticeLibrary(database, h.workspace, { ...page, kind: 'speaking' })).items[0]
    expect(await readSpeaking()).toMatchObject({ title: defaultSpeakingPlan.title, contentKey: defaultSpeakingPlan.contentKey, itemCount: 12 })
    await navigate({ action: 'start', kind: 'speaking' })
    const speakingId = h.workspace.native.attemptId!
    const customPlan = { ...defaultSpeakingPlan, contentKey: 'saved-community-interview', title: 'Saved community interview', questions: defaultSpeakingPlan.questions.filter(question => ![2, 3].includes(question.id)) }
    await h.native.configureSpeakingPlan(customPlan)
    const expected = { title: customPlan.title, contentKey: customPlan.contentKey, itemCount: 10 }
    expect(await readSpeaking()).toMatchObject(expected)
    await navigate({ action: 'library' })
    expect(await readSpeaking()).toMatchObject(expected)
    await navigate({ action: 'start', kind: 'full_ielts' })
    expect(await readSpeaking()).toMatchObject(expected)
    // A restored session must use its parked plan, not the visible Full IELTS plan.
    h.workspace.native = sessionReducer(initialSession, { type: 'RESTORE', session: structuredClone(h.workspace.native) })
    expect(await readSpeaking()).toMatchObject(expected)
    await navigate({ action: 'resume', kind: 'ielts', attemptId: speakingId })
    expect(await readSpeaking()).toMatchObject(expected)
    h.workspace.native = initialSession
    expect(await readSpeaking()).toMatchObject({ title: defaultSpeakingPlan.title, itemCount: 12 })
  })
  it('starts another content set alongside a pinned Full IELTS draft', async () => {
    const h = setup()
    const otherReading = { ...readingDocument, contentKey: 'other-reading' }
    await h.contentStore.saveAndActivate(otherReading)
    await h.navigate({ action: 'start', kind: 'full_ielts' })
    await h.navigate({ action: 'library' })
    const library = await readPracticeLibrary(database, h.workspace, { ...page, kind: 'reading' })
    expect(library.items.find(item => 'contentKey' in item && item.contentKey === otherReading.contentKey)).toMatchObject({ startability: { canStart: true, blockingReason: null } })
    expect(library.items.find(item => 'contentKey' in item && item.contentKey === readingDocument.contentKey)).toMatchObject({ startability: { canStart: true } })
    await expect(h.navigate({ action: 'start', kind: 'reading', contentKey: otherReading.contentKey })).resolves.toMatchObject({ view: 'exam' })
    expect(h.workspace.native.pausedDrafts[0]?.contentKeys?.reading).toBe(readingDocument.contentKey)
  })
  it('reports selection metadata and start blockers that agree with navigation', async () => {
    const h = setup()
    let library = await readPracticeLibrary(database, h.workspace, page)
    expect(library.items).toContainEqual(expect.objectContaining({ kind: 'reading', durationSeconds: 3600, itemCount: 40, partCount: 3, difficulty: null, startability: { canStart: true, blockingReason: null } }))
    expect(library.items).toContainEqual(expect.objectContaining({ kind: 'assessment', itemCount: 12, subject: satPracticeAssessment.metadata.subject, difficulty: satPracticeAssessment.metadata.difficulty }))
    await h.navigate({ action: 'start', kind: 'reading' })
    library = await readPracticeLibrary(database, h.workspace, page)
    expect(library.items.find(item => item.kind === 'reading')).toMatchObject({ startability: { canStart: true, blockingReason: null } })
    expect(library.items.find(item => item.kind === 'writing')).toMatchObject({ startability: { canStart: true } })
    await expect(h.navigate({ action: 'start', kind: 'reading' })).resolves.toMatchObject({ view: 'exam' })
    h.workspace.listeningAudio.readyToPlay = false
    library = await readPracticeLibrary(database, h.workspace, page)
    expect(library.items.find(item => item.kind === 'listening')).toMatchObject({ startability: { canStart: true, blockingReason: null } })
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
  it('installs new content while retaining parked drafts and full exams', async () => {
    const h = setup();
    await h.navigate({ action: 'start', kind: 'speaking' });
    h.native.goHome();
    const speakingId = h.workspace.native.attemptId;
    const custom = { ...readingDocument, contentKey: 'reading-while-speaking-paused' };
    await h.native.installContent(custom);
    expect(h.workspace.native.attemptId).toBe(speakingId);
    await h.navigate({ action: 'start', kind: 'reading', contentKey: custom.contentKey });
    await h.navigate({ action: 'start', kind: 'writing' });
    await expect(h.native.installContent(readingDocument)).resolves.toEqual(readingDocument);
    expect(h.workspace.native.pausedDrafts.some(draft => draft.contentKeys?.reading === custom.contentKey)).toBe(true);
    await h.navigate({ action: 'start', kind: 'full_ielts' });
    await h.navigate({ action: 'library' });
    await expect(h.native.installContent(listeningDocument)).resolves.toEqual(listeningDocument);
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
    await expect(h.navigate({ action: 'start', kind: 'writing' })).resolves.toMatchObject({ view: 'exam' })
    await expect(h.navigate({ action: 'start', kind: 'assessment', packageId: satPracticeAssessment.packageId })).rejects.toMatchObject({ code: 'ACTIVE_ATTEMPT' })
    expect(h.workspace.native.pausedDrafts.find(draft => draft.attemptId === nativeId)?.writingDrafts[1]).toBe('My unfinished writing.')
  })

  it('opens Full IELTS during Listening preparation and resumes the next canonical section', async () => {
    const h = setup(); h.workspace.listeningAudio.readyToPlay = false
    await expect(h.navigate({ action: 'start', kind: 'full_ielts' })).resolves.toMatchObject({ view: 'exam', status: 'audio_preparing' })
    expect(h.workspace.native.attemptId).not.toBeNull()
    h.workspace.listeningAudio.readyToPlay = true
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

  it('activates and opens a saved Listening set while its audio prepares, without requiring another start', async () => {
    const h = setup()
    const document = { ...listeningDocument, contentKey: 'saved-listening' }
    await h.contentStore.saveAndActivate(document)
    h.workspace.listeningAudio.readyToPlay = false
    await expect(h.navigate({ action: 'start', kind: 'listening', contentKey: document.contentKey })).resolves.toMatchObject({ status: 'audio_preparing' })
    expect(h.workspace.content.listening.contentKey).toBe(document.contentKey)
    const attemptId = h.workspace.native.attemptId
    expect(attemptId).not.toBeNull()
    await expect(h.navigate({ action: 'start', kind: 'listening', contentKey: document.contentKey })).resolves.toMatchObject({ view: 'exam' })
    h.workspace.listeningAudio.readyToPlay = true
    expect(h.workspace.native.pausedDrafts.some(draft => draft.attemptId === attemptId)).toBe(true)
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

  it('serializes navigation while loading and preserves a draft started during the read', async () => {
    const h = setup()
    let resolve!: (value: typeof readingDocument) => void
    const pending = new Promise<typeof readingDocument>(r => { resolve = r })
    const navigate = createPracticeNavigation({ ...h.deps, loadContent: () => pending })
    const first = navigate({ action: 'start', kind: 'reading', contentKey: 'other-reading' })
    await expect(navigate({ action: 'library' })).rejects.toMatchObject({ code: 'NAVIGATION_BUSY' })
    h.native.start('section', 'reading')
    resolve({ ...readingDocument, contentKey: 'other-reading' })
    await expect(first).resolves.toMatchObject({ view: 'exam' })
    expect(h.workspace.content.reading.contentKey).toBe('other-reading')
    expect(h.workspace.native.pausedDrafts[0]?.contentKeys?.reading).toBe(readingDocument.contentKey)
  })

  it('does not start or publish an assessment when pausing IELTS fails', async () => {
    const h = setup()
    h.native.start('section', 'reading')
    const before = structuredClone(h.workspace)
    const pause = vi.fn(async () => { throw new Error('Draft save failed') })
    const navigate = createPracticeNavigation({ ...h.deps, native: { ...h.native, goHome: pause } })
    await expect(navigate({ action: 'start', kind: 'assessment', packageId: satPracticeAssessment.packageId })).rejects.toThrow('Draft save failed')
    expect(h.workspace).toEqual(before)
    const saved = await h.assessmentRepository.saveAttempt({ ...dates, attemptId: crypto.randomUUID(), packageId: satPracticeAssessment.packageId,
      package: satPracticeAssessment, responses: {}, result: gradeAssessment(satPracticeAssessment, {}) })
    await expect(navigate({ action: 'result', kind: 'assessment', attemptId: saved.attemptId })).rejects.toThrow('Draft save failed')
    expect(h.workspace).toEqual(before)
    pause.mockClear()
    await expect(navigate({ action: 'result', kind: 'assessment', attemptId: saved.attemptId, location: { itemId: 'missing' } })).rejects.toMatchObject({ code: 'REVIEW_LOCATION_NOT_FOUND' })
    expect(pause).not.toHaveBeenCalled()
    expect(h.workspace).toEqual(before)
  })

  it('cancels a tool navigation during content loading before installation or state changes', async () => {
    const h = setup()
    let resolve!: (value: typeof readingDocument) => void
    const pending = new Promise<typeof readingDocument>(done => { resolve = done })
    const navigate = createPracticeNavigation({ ...h.deps, loadContent: () => pending })
    const open = createPracticeTools({ readLibrary: vi.fn(), readHistory: vi.fn(), navigate }).find(tool => tool.name === 'open_practice')!
    const controller = new AbortController()
    const before = structuredClone(h.workspace)
    const opening = open.execute({ action: 'start', kind: 'reading', contentKey: 'cancelled-reading' }, { signal: controller.signal })
    const rejected = expect(opening).rejects.toMatchObject({ name: 'AbortError' })
    controller.abort()
    resolve({ ...readingDocument, contentKey: 'cancelled-reading' })
    await rejected
    expect(h.workspace).toEqual(before)
    expect(await h.contentStore.loadByKey('cancelled-reading')).toBeNull()
    await navigate({ action: 'start', kind: 'reading' })
    expect(h.workspace.native.view).toBe('exam')
  })

  it.each(['writing', 'assessment'] as const)('does not publish a %s result when cancellation arrives during its read', async kind => {
    const h = setup()
    const attemptId = crypto.randomUUID()
    if (kind === 'writing') await h.nativeRepository.saveWritingAttempt({ ...dates, attemptId, contentKey: writingDocument.contentKey,
      tasks: [{ task: writingDocument.tasks[0], response: 'First answer.', wordCount: 2 }, { task: writingDocument.tasks[1], response: 'Second answer.', wordCount: 2 }] })
    else await h.assessmentRepository.saveAttempt({ ...dates, attemptId, packageId: satPracticeAssessment.packageId, package: satPracticeAssessment,
      responses: {}, result: gradeAssessment(satPracticeAssessment, {}) })
    h.native.start('section', 'reading')
    const before = structuredClone(h.workspace)
    let release!: () => void
    let began!: () => void
    const held = new Promise<void>(resolve => { release = resolve })
    const reading = new Promise<void>(resolve => { began = resolve })
    if (kind === 'writing') {
      const read = h.nativeRepository.readWritingAttempt
      vi.spyOn(h.nativeRepository, 'readWritingAttempt').mockImplementationOnce(async id => { began(); await held; return read(id) })
    } else {
      const read = h.assessmentRepository.readAttempt
      vi.spyOn(h.assessmentRepository, 'readAttempt').mockImplementationOnce(async id => { began(); await held; return read(id) })
    }
    const controller = new AbortController()
    const opening = h.navigate({ action: 'result', kind, attemptId }, { signal: controller.signal })
    const rejected = expect(opening).rejects.toMatchObject({ name: 'AbortError' })
    await reading
    controller.abort()
    release()
    await rejected
    expect(h.workspace).toEqual(before)
  })

  it('shares its in-flight navigation lock between UI and tool calls', async () => {
    const h = setup()
    let release!: () => void
    const pending = new Promise<void>(resolve => { release = resolve })
    const navigate = createPracticeNavigation({ ...h.deps, native: { ...h.native, goHome: async () => { await pending; await h.native.goHome() } } })
    const opening = navigate({ action: 'start', kind: 'assessment', packageId: satPracticeAssessment.packageId })
    const open = createPracticeTools({ readLibrary: vi.fn(), readHistory: vi.fn(), navigate }).find(tool => tool.name === 'open_practice')!
    await expect(open.execute({ action: 'library' }, { signal: new AbortController().signal })).resolves.toMatchObject({ ok: false, error: { code: 'NAVIGATION_BUSY' } })
    release()
    await opening
    expect(h.workspace.assessment.view).toBe('assessment')
    expect(h.workspace.native.view).toBe('home')
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
    expect(await readPracticeHistory(database, page)).toEqual({ items: [], unavailable: [], nextOffset: null })
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
