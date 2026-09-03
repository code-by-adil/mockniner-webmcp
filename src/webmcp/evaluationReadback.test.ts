import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { SQLocal } from 'sqlocal'
import { writingDocument } from '@/content/writing'
import { listeningDocument, readingDocument } from '@/content/objective'
import { getAssessmentAuthoringKit } from '@/content/assessmentExamples'
import { gradeAssessment, parseAssessmentPackage } from '@/domain/assessment'
import { initialSession, sessionReducer, type IeltsSession } from '@/domain/session'
import { initialAssessmentSession, assessmentSessionReducer, type AssessmentSession } from '@/domain/assessmentSession'
import { createIeltsCommands } from '@/application/ieltsCommands'
import { createAssessmentCommands } from '@/application/assessmentCommands'
import { createIeltsRepository } from '@/infrastructure/database/ieltsRepository'
import { createAssessmentRepository } from '@/infrastructure/database/assessmentRepository'
import { createContentStore } from '@/infrastructure/database/contentRepository'
import { migrateDatabase } from '@/infrastructure/database/migrations'
import { readPracticeActivity } from '@/infrastructure/database/practiceActivity'
import { createAssessmentToolDefinitions } from './assessmentTools'
import { createWritingToolDefinitions } from './writingTools'
import { createSpeakingToolDefinitions } from './speakingTools'

let database: SQLocal
const attemptId = '11111111-1111-4111-8111-111111111111'
const dates = { startedAt: '2026-09-01T10:00:00.000Z', submittedAt: '2026-09-01T10:15:00.000Z' }
const options = () => ({ signal: new AbortController().signal })
const wire = (value: unknown) => JSON.parse(JSON.stringify(value))

beforeAll(() => vi.stubGlobal('Worker', class TestWorker {}))
afterAll(() => vi.unstubAllGlobals())
beforeEach(async () => {
  let connected!: () => void
  const ready = new Promise<void>(resolve => { connected = resolve })
  database = new SQLocal({ databasePath: ':memory:', onConnect: connected, onInit: sql => [sql`PRAGMA foreign_keys = ON`] })
  await ready
  await migrateDatabase(database)
})
afterEach(async () => { await database.destroy(true) })

function nativeCommands(initial: IeltsSession) {
  let state = initial
  return createIeltsCommands({ getState: () => state, dispatch: action => { state = sessionReducer(state, action) },
    getContent: () => ({ writing: writingDocument, listening: listeningDocument, reading: readingDocument }),
    setContent: vi.fn(), getContentStore: async () => createContentStore(database),
    getRepository: async () => createIeltsRepository(database),
  })
}

describe('persisted evaluation readback through WebMCP', () => {
  it.each(['writing', 'assessment'] as const)('safely retries and revises %s feedback without changing the submission', async kind => {
    let tools: WebMCP.ModelContextTool[]
    let input: Record<string, unknown>
    let original: unknown
    let visibleEvaluation: () => unknown
    const task = { band: 6, taskAchievement: 6, coherenceCohesion: 6, lexicalResource: 6, grammaticalRange: 6, feedback: 'Develop the evidence.', annotations: [] }
    if (kind === 'writing') {
      const repository = createIeltsRepository(database)
      const submission = await repository.saveWritingAttempt({ ...dates, attemptId, contentKey: writingDocument.contentKey,
        tasks: [{ task: writingDocument.tasks[0], response: 'A measured response.', wordCount: 3 }, { task: writingDocument.tasks[1], response: 'An original essay.', wordCount: 3 }] })
      original = submission
      let state: IeltsSession = { ...initialSession, view: 'transition', currentSection: 'writing', writingSubmission: submission }
      const commands = createIeltsCommands({ getState: () => state, dispatch: action => { state = sessionReducer(state, action) },
        getContent: () => ({ writing: writingDocument, listening: listeningDocument, reading: readingDocument }),
        setContent: vi.fn(), getContentStore: async () => createContentStore(database), getRepository: async () => repository })
      visibleEvaluation = () => state.review?.kind === 'writing' ? state.review.evaluation : null
      tools = createWritingToolDefinitions({ readWritingAttempt: id => createIeltsRepository(database).readWritingAttempt(id), attachWritingEvaluation: commands.attachWritingEvaluation, getCurrentWritingAttemptId: () => attemptId }, 'results')
      input = { attemptId, overallBand: 6, summary: 'Initial feedback.', task1: task, task2: task }
    } else {
      const repository = createAssessmentRepository(database)
      const assessment = parseAssessmentPackage({ ...getAssessmentAuthoringKit('writing-with-rubric').examplePackage, source: 'agent' })
      const responses = { 'public-library-essay': 'Libraries should remain accessible.' }
      const submission = await repository.saveAttempt({ ...dates, attemptId, packageId: assessment.packageId, package: assessment, responses, result: gradeAssessment(assessment, responses) })
      original = submission
      let state: AssessmentSession = { ...initialAssessmentSession, view: 'result', submission }
      const commands = createAssessmentCommands({ getState: () => state, dispatch: action => { state = assessmentSessionReducer(state, action) },
        getAssessments: () => [assessment], setAssessments: vi.fn(), setHistory: vi.fn(), getRepository: async () => repository })
      visibleEvaluation = () => state.evaluation
      tools = createAssessmentToolDefinitions({ installAssessment: commands.installAssessment, readAssessmentAttempt: id => createAssessmentRepository(database).readAttempt(id), attachEvaluation: commands.attachEvaluation, getCurrentAttemptId: () => attemptId }, 'results')
      input = { attemptId, rubricId: 'argument-writing', overallScore: 3, summary: 'Initial feedback.',
        criteria: ['claim', 'evidence'].map(criterionId => ({ criterionId, score: 3, feedback: 'A clear claim.', evidence: ['Libraries should remain accessible.'] })), strengths: ['Clear.'], improvements: ['Add detail.'], annotations: [] }
    }
    const read = async () => wire(await tools[0]!.execute({}, options()))
    const save = async (payload: Record<string, unknown>): Promise<{ ok: boolean }> => wire(await tools[1]!.execute(payload, options()))
    const first = await save(input)
    expect(first).toMatchObject({ ok: true, data: { status: 'saved', revision: 1 } })
    // Pre-revision databases contain this exact feedback without revision metadata.
    if (kind === 'writing') await database.sql`UPDATE writing_evaluations SET evaluation_json = json_remove(evaluation_json, '$.revision') WHERE attempt_id = ${attemptId}`
    else await database.sql`UPDATE assessment_evaluations SET evaluation_json = json_remove(evaluation_json, '$.revision') WHERE attempt_id = ${attemptId}`
    expect(await save(input)).toEqual(first)
    expect(await read()).toMatchObject({ data: { evaluationRevision: 1, canAttachEvaluation: false, canReviseEvaluation: true } })
    const corrected = { ...input, summary: 'Reconsidered feedback.', expectedRevision: 1 }
    expect(await save({ ...input, summary: corrected.summary })).toMatchObject({ ok: false, error: { code: 'EVALUATION_REVISION_REQUIRED', retryable: true } })
    expect(await save({ ...corrected, expectedRevision: 0 })).toMatchObject({ ok: false, error: { code: 'EVALUATION_REVISION_CONFLICT', issues: [{ path: 'expectedRevision' }] } })
    const second = await save(corrected)
    expect(second).toMatchObject({ ok: true, data: { revision: 2 } })
    const invalid = kind === 'writing'
      ? { ...corrected, expectedRevision: 2, task1: { ...task, annotations: [{ id: 'bad', taskNumber: 1, originalText: 'Not in the essay.', suggestion: 'Change it.', explanation: 'Fixture.', type: 'other' }] } }
      : { ...corrected, expectedRevision: 2, rubricId: 'not-the-submitted-rubric' }
    expect(await save(invalid)).toMatchObject({ ok: false, error: { code: kind === 'writing' ? 'INVALID_ANNOTATION' : 'EVALUATION_CONTRACT_MISMATCH' } })
    // A lost-response retry carries the old expected revision and must still succeed.
    expect(await save(corrected)).toEqual(second)
    expect(visibleEvaluation()).toMatchObject({ revision: 2, summary: corrected.summary })
    const concurrent = await Promise.all([
      save({ ...input, summary: 'Correction from agent A.', expectedRevision: 2 }),
      save({ ...input, summary: 'Correction from agent B.', expectedRevision: 2 }),
    ])
    expect(concurrent.filter(result => result.ok)).toHaveLength(1)
    expect(concurrent.find(result => !result.ok)).toMatchObject({ error: { code: 'EVALUATION_REVISION_CONFLICT' } })
    const stored = kind === 'writing' ? await createIeltsRepository(database).readWritingAttempt(attemptId) : await createAssessmentRepository(database).readAttempt(attemptId)
    expect(stored?.submission).toEqual(original)
    expect(stored?.evaluation).toMatchObject({ revision: 3 })
    expect(visibleEvaluation()).toEqual(stored?.evaluation)
    expect(await read()).toMatchObject({ data: { evaluation: stored?.evaluation, evaluationRevision: 3 } })
    const activity = await readPracticeActivity(database, { kind, limit: 25, offset: 0 })
    expect(activity.items.filter(item => item.type === 'feedback_attached')).toHaveLength(3)
    expect(stored?.evaluation).not.toHaveProperty('expectedRevision')
  })
  it('returns the complete universal evaluation after attachment, including evidence and annotations', async () => {
    const repository = createAssessmentRepository(database)
    const assessment = parseAssessmentPackage({ ...getAssessmentAuthoringKit('writing-with-rubric').examplePackage, source: 'built-in' })
    const responses = { 'public-library-essay': 'Libraries should remain accessible. Fines can discourage readers.' }
    const submission = await repository.saveAttempt({ ...dates, attemptId, packageId: assessment.packageId, package: assessment,
      responses, result: gradeAssessment(assessment, responses) })
    let state: AssessmentSession = { ...initialAssessmentSession, view: 'result', submission }
    const commands = createAssessmentCommands({ getState: () => state, dispatch: action => { state = assessmentSessionReducer(state, action) },
      getAssessments: () => [assessment], setAssessments: vi.fn(), setHistory: vi.fn(), getRepository: async () => repository })
    const dependencies = { installAssessment: commands.installAssessment, attachEvaluation: commands.attachEvaluation,
      readAssessmentAttempt: repository.readAttempt, getCurrentAttemptId: () => attemptId }
    const tools = createAssessmentToolDefinitions(dependencies, 'evaluation')
    await expect(tools[0]!.execute({}, options())).resolves.toMatchObject({ ok: true, data: { evaluation: null, evaluationStatus: 'awaiting_evaluation', canAttachEvaluation: true } })
    const input = { attemptId, rubricId: 'argument-writing', overallScore: 3,
      criteria: [{ criterionId: 'claim', score: 3, feedback: 'Clear position.', evidence: ['Libraries should remain accessible.'] },
        { criterionId: 'evidence', score: 2, feedback: 'Add a measured example.', evidence: ['Fines can discourage readers.'] }],
      summary: 'Clear claim; support needs detail.', strengths: ['Direct position.'], improvements: ['Give a concrete example.'],
      annotations: [{ itemId: 'public-library-essay', originalText: 'Fines can discourage readers.', suggestion: 'Give a specific example of this effect.', explanation: 'Evidence would make the claim persuasive.' }] }
    await expect(tools[1]!.execute(input, options())).resolves.toMatchObject({ ok: true })
    // Recreate the reader over storage, as a fresh agent on the results page would.
    const result = wire(await createAssessmentToolDefinitions(dependencies, 'results')[0]!.execute({}, options()))
    const stored = await createAssessmentRepository(database).readAttempt(attemptId)
    expect(result.data.evaluation).toEqual(stored!.evaluation)
    expect(result.data.evaluation).toMatchObject(input)
    expect(result.data.evaluation.evaluatedAt).toEqual(expect.any(String))
    expect(result.data.evaluationStatus).toBe('evaluated')
    expect(result.data.canAttachEvaluation).toBe(false)
    expect(result.data.submission.responses).toEqual(responses)
    expect(JSON.stringify(result.data.submission.package)).not.toContain('"scoring"')
  })

  it('returns both Writing tasks, every criterion and exact correction annotations after attachment', async () => {
    const repository = createIeltsRepository(database)
    const submission = await repository.saveWritingAttempt({ ...dates, attemptId, contentKey: writingDocument.contentKey,
      tasks: [{ task: writingDocument.tasks[0], response: 'Task one answer.', wordCount: 3 }, { task: writingDocument.tasks[1], response: 'Task two answer.', wordCount: 3 }] })
    const commands = nativeCommands({ ...initialSession, view: 'transition', currentSection: 'writing', writingSubmission: submission })
    const dependencies = { readWritingAttempt: repository.readWritingAttempt, attachWritingEvaluation: commands.attachWritingEvaluation, getCurrentWritingAttemptId: () => attemptId }
    const tools = createWritingToolDefinitions(dependencies)
    await expect(tools[0]!.execute({}, options())).resolves.toMatchObject({ ok: true, data: { evaluation: null } })
    const task = (taskNumber: 1 | 2) => ({ band: 6, taskAchievement: 6, coherenceCohesion: 6, lexicalResource: 6, grammaticalRange: 6,
      feedback: `Develop task ${taskNumber} with specific details.`, annotations: [{ id: `correction-${taskNumber}`, taskNumber,
        originalText: taskNumber === 1 ? 'Task one answer.' : 'Task two answer.', suggestion: 'Expand the answer.', explanation: 'The response needs supporting detail.', type: 'coherence' as const }] })
    const input = { attemptId, overallBand: 6, summary: 'Both responses need development.', task1: task(1), task2: task(2) }
    const attached = await tools[1]!.execute(input, options())
    expect(attached).toMatchObject({ ok: true })
    // Retrying the original quote-only payload matches the persisted resolved offsets.
    await expect(tools[1]!.execute(input, options())).resolves.toEqual(attached)
    const result = wire(await createWritingToolDefinitions(dependencies, 'results')[0]!.execute({}, options()))
    const stored = await createIeltsRepository(database).readWritingAttempt(attemptId)
    expect(result.data.evaluation).toEqual(stored!.evaluation)
    expect(result.data.evaluation).toMatchObject(input)
    expect(result.data.evaluation.task1.annotations[0]).toMatchObject({ startOffset: 0, endOffset: 16 })
    expect(result.data.evaluation.task2.annotations).toHaveLength(1)
    expect(result.data.evaluationStatus).toBe('evaluated')
    expect(result.data.canAttachEvaluation).toBe(false)
    expect(result.data.submission).toEqual(submission)
  })

  it('returns complete Speaking feedback while keeping audio private and pronunciation unscored', async () => {
    const repository = createIeltsRepository(database)
    const submission = await repository.saveSpeakingAttempt({ ...dates, attemptId, contentKey: 'speaking-readback', recordings: [{
      status: 'answered', promptId: 1, partLabel: 'Part 1', sequence: 0, promptText: 'Where do you live?', timeLimitSeconds: 30,
      durationMs: 3000, audio: new Blob(['private test audio']), transcript: 'I live near the sea.' }] })
    const commands = nativeCommands({ ...initialSession, view: 'transition', currentSection: 'speaking', speakingSubmission: submission })
    const dependencies = { readSpeakingAttempt: repository.readSpeakingAttempt, attachSpeakingEvaluation: commands.attachSpeakingEvaluation, getCurrentSpeakingAttemptId: () => attemptId }
    const tools = createSpeakingToolDefinitions(dependencies)
    await expect(tools[0]!.execute({}, options())).resolves.toMatchObject({ ok: true, data: { evaluation: null } })
    const input = { attemptId, overallBand: 6, fluencyCoherence: 6, lexicalResource: 6, grammaticalRangeAccuracy: 6,
      summary: 'A clear but brief response.', strengths: ['Direct answer.'], improvements: ['Add detail about the area.'] }
    await expect(tools[1]!.execute(input, options())).resolves.toMatchObject({ ok: true })
    const result = wire(await createSpeakingToolDefinitions(dependencies, 'results')[0]!.execute({}, options()))
    const stored = await createIeltsRepository(database).readSpeakingAttempt(attemptId)
    expect(result.data.evaluation).toEqual(stored!.evaluation)
    expect(result.data.evaluation).toMatchObject(input)
    expect(result.data.evaluation).not.toHaveProperty('pronunciation')
    expect(result.data.evaluationStatus).toBe('evaluated')
    expect(result.data.canAttachEvaluation).toBe(false)
    expect(result.data.submission).toEqual(submission)
    expect(JSON.stringify(result)).not.toContain('private test audio')
    expect(result.data.submission.responses[0]).not.toHaveProperty('audio')
  })
})
