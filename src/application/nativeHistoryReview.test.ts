import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { SQLocal } from 'sqlocal'
import { listeningDocument, readingDocument } from '@/content/objective'
import { writingDocument } from '@/content/writing'
import { initialSession, sessionReducer, type ExamSession } from '@/domain/session'
import { createAttemptReader } from '@/infrastructure/database/attemptReader'
import { saveObjectiveAttempt } from '@/infrastructure/database/attemptRepository'
import {
  createContentStore,
  saveAndActivateContent,
} from '@/infrastructure/database/contentRepository'
import { migrateDatabase } from '@/infrastructure/database/migrations'
import { createExamApplicationCommands } from './commands'

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
    const reader = createAttemptReader(database)
    const history = await reader.readLearningSummary(5)
    expect(history.sections.reading.recent.map((attempt) => attempt.attemptId)).toEqual([
      newerAttempt.attemptId,
      olderAttempt.attemptId,
    ])

    let state: ExamSession = initialSession
    let content = {
      listening: listeningDocument,
      reading: newerDocument,
      writing: writingDocument,
    }
    const unavailable = async (): Promise<never> => {
      throw new Error('This writer is not used by the review query.')
    }
    const commands = createExamApplicationCommands({
      getState: () => state,
      dispatch: (action) => {
        state = sessionReducer(state, action)
      },
      getContent: () => content,
      setContent: (documents) => {
        content = documents
      },
      getContentStore: async () => createContentStore(database),
      getAttemptReader: async () => reader,
      getAttemptWriter: async () => ({
        saveObjectiveAttempt: unavailable,
        saveWritingAttempt: unavailable,
        saveWritingEvaluation: unavailable,
        saveSpeakingAttempt: unavailable,
        saveSpeakingEvaluation: unavailable,
      }),
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
