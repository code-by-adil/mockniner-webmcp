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
    commands.closeReview(); expect(state.view).toBe('home')
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
