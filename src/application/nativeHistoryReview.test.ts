import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { SQLocal } from 'sqlocal'
import { listeningDocument, readingDocument } from '@/content/objective'
import { writingDocument } from '@/content/writing'
import { initialSession, sessionReducer, type IeltsSession } from '@/domain/session'
import { createIeltsRepository } from '@/infrastructure/database/ieltsRepository'
import { saveObjectiveAttempt } from '@/infrastructure/database/attemptRepository'
import {
  createContentStore,
  saveAndActivateContent,
} from '@/infrastructure/database/contentRepository'
import { migrateDatabase } from '@/infrastructure/database/migrations'
import { createIeltsCommands } from './ieltsCommands'
import { getPracticeContext } from './practiceContext'
import { initialAssessmentSession } from '@/domain/assessmentSession'
import { createWritingToolDefinitions } from '@/webmcp/writingTools'
import { createSpeakingToolDefinitions } from '@/webmcp/speakingTools'

let database: SQLocal

beforeAll(() => {
  vi.stubGlobal('Worker', class TestWorker {})
})

afterAll(() => {
  vi.unstubAllGlobals()
})

beforeEach(async () => {
  let resolveConnected!: () => void
  const connected = new Promise<void>((resolve) => {
    resolveConnected = resolve
  })
  database = new SQLocal({
    databasePath: ':memory:',
    onInit: (sql) => [sql`PRAGMA foreign_keys = ON`],
    onConnect: resolveConnected,
  })
  await connected
  await migrateDatabase(database)
})

afterEach(async () => {
  await database.destroy(true)
})

describe('database-backed native history review', () => {
  it('opens pending Writing from results and history, then attaches feedback to that exact saved submission', async () => {
    const repository = createIeltsRepository(database)
    let state: IeltsSession = initialSession
    const commands = createIeltsCommands({
      getState: () => state, dispatch: action => { state = sessionReducer(state, action) },
      getContent: () => ({ listening: listeningDocument, reading: readingDocument, writing: writingDocument }),
      setContent: vi.fn(), getContentStore: async () => createContentStore(database), getRepository: async () => repository,
    })
    await commands.start('section', 'writing')
    commands.setWritingDraft(1, 'Saved report.\n\nSecond paragraph.')
    commands.setWritingDraft(2, 'Saved essay.')
    const submission = await commands.submitWriting()
    commands.continueExam()
    await commands.openReview('writing')
    expect(state.review).toMatchObject({ kind: 'writing', evaluation: null, returnTo: 'result', submission })
    expect(() => commands.setWritingDraft(1, 'Must not change submitted work.')).toThrow('writing is not the active exam section')
    expect((await repository.readWritingAttempt(submission.attemptId))?.submission).toEqual(submission)
    commands.closeReview()
    expect(state.view).toBe('result')
    await commands.goHome()
    await commands.start('section', 'writing')
    commands.setWritingDraft(1, 'Unrelated new draft.')
    await commands.goHome()
    await commands.openAttempt(submission.attemptId, 'writing')
    expect(state.review).toMatchObject({ evaluation: null, returnTo: 'home', submission })

    const definitions = createWritingToolDefinitions({
      readWritingAttempt: repository.readWritingAttempt,
      attachWritingEvaluation: commands.attachWritingEvaluation,
      getCurrentWritingAttemptId: () => getPracticeContext(state, initialAssessmentSession).submissions.find(item => item.kind === 'writing')?.attemptId,
    })
    const options = { signal: new AbortController().signal }
    await expect(definitions[0]!.execute({}, options)).resolves.toMatchObject({ ok: true, data: { submission, canAttachEvaluation: true } })
    const task = { band: 5, taskAchievement: 5, coherenceCohesion: 5, lexicalResource: 5, grammaticalRange: 5, feedback: 'Test feedback.', annotations: [] }
    await expect(definitions[1]!.execute({ attemptId: submission.attemptId, overallBand: 5, summary: 'Saved test evaluation.', task1: task, task2: task }, options)).resolves.toMatchObject({ ok: true, sideEffect: { visibleView: 'writing_review' } })
    expect(state.review).toMatchObject({ submission, evaluation: { summary: 'Saved test evaluation.' }, returnTo: 'home' })
    expect(state.writingDrafts[1]).toBe('Unrelated new draft.')
    commands.closeReview()
    await commands.openAttempt(submission.attemptId, 'writing')
    expect(state.review).toMatchObject({ submission, evaluation: { summary: 'Saved test evaluation.' } })
  })
  it('reopens a persisted Speaking interview from home without replacing an unrelated draft', async () => {
    const repository = createIeltsRepository(database)
    const submission = await repository.saveSpeakingAttempt({
      attemptId: crypto.randomUUID(), contentKey: 'speaking-history',
      startedAt: '2026-09-03T10:00:00.000Z', submittedAt: '2026-09-03T10:01:00.000Z',
      recordings: [{ status: 'answered' as const, promptId: 1, partLabel: 'Part 1', sequence: 0, promptText: 'Where do you live?',
        timeLimitSeconds: 30, durationMs: 3000, audio: new Blob(['audio']), transcript: 'I live near the sea.' }],
    })
    await repository.saveSpeakingEvaluation({ attemptId: submission.attemptId, overallBand: 6, fluencyCoherence: 6,
      lexicalResource: 6, grammaticalRangeAccuracy: 6, summary: 'Test evaluation', strengths: ['Clear.'], improvements: ['More detail.'], evaluatedAt: '2026-09-03T10:02:00.000Z' })
    let state: IeltsSession = { ...initialSession, writingDrafts: { 1: 'Unrelated draft', 2: '' } }
    const commands = createIeltsCommands({ getState: () => state,
      dispatch: action => { state = sessionReducer(state, action) },
      getContent: () => ({ listening: listeningDocument, reading: readingDocument, writing: writingDocument }),
      setContent: vi.fn(), getContentStore: async () => createContentStore(database), getRepository: async () => repository,
    })
    await commands.openAttempt(submission.attemptId, 'speaking')
    expect(state).toMatchObject({ view: 'review', review: { kind: 'speaking', returnTo: 'home', submission: { attemptId: submission.attemptId } },
      writingDrafts: { 1: 'Unrelated draft' } })
    const tool = createSpeakingToolDefinitions({ readSpeakingAttempt: repository.readSpeakingAttempt,
      attachSpeakingEvaluation: commands.attachSpeakingEvaluation,
      getCurrentSpeakingAttemptId: () => getPracticeContext(state, initialAssessmentSession).submissions.find(s => s.kind === 'speaking')?.attemptId,
    }, 'results')[0]!
    await expect(tool.execute({}, { signal: new AbortController().signal })).resolves.toMatchObject({ ok: true,
      data: { submission: { attemptId: submission.attemptId }, evaluation: { attemptId: submission.attemptId }, selection: { isVisible: true } } })
    commands.closeReview(); expect(state.view).toBe('home')
  })
  it('reads the historical Writing review instead of a newer stored or retained submission', async () => {
    const repository = createIeltsRepository(database)
    const older = await repository.saveWritingAttempt({ attemptId: crypto.randomUUID(), contentKey: writingDocument.contentKey,
      tasks: [{ task: writingDocument.tasks[0], response: 'Older response one.', wordCount: 3 }, { task: writingDocument.tasks[1], response: 'Older response two.', wordCount: 3 }],
      startedAt: '2026-09-01T10:00:00.000Z', submittedAt: '2026-09-01T11:00:00.000Z' })
    const newer = await repository.saveWritingAttempt({ ...older, attemptId: crypto.randomUUID(), submittedAt: '2026-09-02T11:00:00.000Z' })
    const criterion = { band: 6, taskAchievement: 6, coherenceCohesion: 6, lexicalResource: 6, grammaticalRange: 6, feedback: 'Test feedback.', annotations: [] }
    await repository.saveWritingEvaluation({ attemptId: older.attemptId, overallBand: 6, summary: 'Older evaluation.',
      task1: criterion, task2: criterion, evaluatedAt: '2026-09-01T11:10:00.000Z' })
    let state: IeltsSession = { ...initialSession, currentSection: 'speaking', writingSubmission: newer }
    const commands = createIeltsCommands({ getState: () => state, dispatch: action => { state = sessionReducer(state, action) },
      getContent: () => ({ listening: listeningDocument, reading: readingDocument, writing: writingDocument }),
      setContent: vi.fn(), getContentStore: async () => createContentStore(database), getRepository: async () => repository })
    await commands.openAttempt(older.attemptId, 'writing')
    const tool = createWritingToolDefinitions({ readWritingAttempt: repository.readWritingAttempt,
      attachWritingEvaluation: commands.attachWritingEvaluation,
      getCurrentWritingAttemptId: () => getPracticeContext(state, initialAssessmentSession).submissions.find(s => s.kind === 'writing')?.attemptId,
    }, 'results')[0]!
    const options = { signal: new AbortController().signal }
    await expect(tool.execute({}, options)).resolves.toMatchObject({ ok: true, data: { submission: { attemptId: older.attemptId }, evaluation: { summary: 'Older evaluation.' }, selection: { isVisible: true } } })
    await expect(tool.execute({ latest: true }, options)).resolves.toMatchObject({ ok: true, data: { submission: { attemptId: newer.attemptId }, evaluation: null, canAttachEvaluation: false } })
    expect(state.review?.submission.attemptId).toBe(older.attemptId)
    expect(state.writingSubmission?.attemptId).toBe(newer.attemptId)
  })
  it('opens the selected rehydrated Reading attempt with its persisted content', async () => {
    const olderDocument = {
      ...readingDocument,
      contentKey: 'agent-reading-history-v1',
      name: 'Archived Reading practice',
    }
    const newerDocument = {
      ...readingDocument,
      contentKey: 'agent-reading-current-v2',
      name: 'Current Reading practice',
    }
    await saveAndActivateContent(database, olderDocument)
    await saveAndActivateContent(database, newerDocument)
    const olderAttempt = await saveObjectiveAttempt(database, {
      attemptId: crypto.randomUUID(),
      section: 'reading',
      contentKey: olderDocument.contentKey,
      answers: { 1: 'TRUE' },
      result: {
        section: 'reading', raw: 1, total: 40, band: 0, answered: 1,
        correctQuestionIds: [1],
      },
      startedAt: '2026-08-31T10:00:00.000Z',
      submittedAt: '2026-08-31T11:00:00.000Z',
    })
    const newerAttempt = await saveObjectiveAttempt(database, {
      attemptId: crypto.randomUUID(),
      section: 'reading',
      contentKey: newerDocument.contentKey,
      answers: { 1: 'FALSE' },
      result: {
        section: 'reading', raw: 0, total: 40, band: 0, answered: 1,
        correctQuestionIds: [],
      },
      startedAt: '2026-09-01T10:00:00.000Z',
      submittedAt: '2026-09-01T11:00:00.000Z',
    })
    const reader = createIeltsRepository(database)
    const history = await reader.readLearningSummary(5)
    expect(history.sections.reading.recent.map((attempt) => attempt.attemptId)).toEqual([
      newerAttempt.attemptId,
      olderAttempt.attemptId,
    ])

    let state: IeltsSession = initialSession
    let content = {
      listening: listeningDocument,
      reading: newerDocument,
      writing: writingDocument,
    }
    const commands = createIeltsCommands({
      getState: () => state,
      dispatch: (action) => {
        state = sessionReducer(state, action)
      },
      getContent: () => content,
      setContent: (documents) => {
        content = documents
      },
      getContentStore: async () => createContentStore(database),
      getRepository: async () => reader,
    })

    await commands.openAttempt(olderAttempt.attemptId, 'reading')

    expect(state).toMatchObject({
      view: 'review',
      currentSection: null,
      objectiveSubmissions: {},
      review: {
        kind: 'objective',
        section: 'reading',
        submission: {
          attemptId: olderAttempt.attemptId,
          answers: { 1: 'TRUE' },
        },
        document: {
          contentKey: olderDocument.contentKey,
          name: olderDocument.name,
        },
        part: 1,
        returnTo: 'home',
      },
    })
    expect(content.reading).toEqual(newerDocument)
    commands.closeReview()
    expect(state.view).toBe('home')
  })
})
