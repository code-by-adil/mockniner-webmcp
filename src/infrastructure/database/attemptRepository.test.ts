import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { SQLocal } from 'sqlocal'
import { writingTasks } from '@/content/writing'
import type { WritingEvaluation } from '@/domain/types'
import { migrateDatabase } from './migrations'
import {
  readObjectiveAttempt,
  readWritingAttempt,
  saveObjectiveAttempt,
  saveWritingAttempt,
  saveWritingEvaluation,
} from './attemptRepository'

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
    onConnect: () => resolveConnected(),
  })
  await connected
  await migrateDatabase(database)
})

afterEach(async () => {
  await database.destroy(true)
})

describe('local attempt repository', () => {
  it('stores and reloads an immutable objective answer snapshot and result', async () => {
    const submission = await saveObjectiveAttempt(database, {
      section: 'reading',
      contentKey: 'local-reading-v1',
      answers: { 1: 'TRUE', 2: 'paragraph C' },
      result: {
        section: 'reading',
        raw: 1,
        total: 40,
        band: 0,
        answered: 2,
        correctQuestionIds: [1],
      },
      startedAt: '2026-08-31T10:00:00.000Z',
      submittedAt: '2026-08-31T11:00:00.000Z',
    })

    const stored = await readObjectiveAttempt(database, submission.attemptId)
    expect(stored).toEqual(submission)
    expect(stored?.answers).toEqual({ 1: 'TRUE', 2: 'paragraph C' })
    expect(stored?.result.correctQuestionIds).toEqual([1])
  })

  it('stores the exact Writing tasks and responses, then attaches an evaluation', async () => {
    const submission = await saveWritingAttempt(database, {
      contentKey: 'local-writing-v1',
      tasks: [
        { task: writingTasks[0], response: 'Task one answer.', wordCount: 3 },
        { task: writingTasks[1], response: 'Task two answer.', wordCount: 3 },
      ],
      startedAt: '2026-08-31T10:00:00.000Z',
      submittedAt: '2026-08-31T11:00:00.000Z',
    })
    const taskEvaluation = {
      band: 7,
      taskAchievement: 7,
      coherenceCohesion: 7,
      lexicalResource: 7,
      grammaticalRange: 6.5,
      feedback: 'A clear response with some grammatical limitations.',
      annotations: [],
    }
    const evaluation: WritingEvaluation = {
      attemptId: submission.attemptId,
      overallBand: 7,
      summary: 'A competent response across both tasks.',
      task1: taskEvaluation,
      task2: { ...taskEvaluation, band: 7.5 },
      evaluatedAt: '2026-08-31T11:05:00.000Z',
    }

    await saveWritingEvaluation(database, evaluation)
    const stored = await readWritingAttempt(database, submission.attemptId)

    expect(stored?.submission).toEqual(submission)
    expect(stored?.submission.tasks[0]?.task.chart?.rows).toHaveLength(7)
    expect(stored?.evaluation).toEqual(evaluation)
    const [attempt] = await database.sql<{ status: string }>`
      SELECT status FROM attempts WHERE id = ${submission.attemptId}
    `
    expect(attempt?.status).toBe('evaluated')
  })

  it('rejects corrupted JSON instead of casting it into the domain', async () => {
    const submission = await saveObjectiveAttempt(database, {
      section: 'reading',
      contentKey: 'local-reading-v1',
      answers: { 1: 'TRUE' },
      result: {
        section: 'reading',
        raw: 1,
        total: 40,
        band: 0,
        answered: 1,
        correctQuestionIds: [1],
      },
      startedAt: '2026-08-31T10:00:00.000Z',
      submittedAt: '2026-08-31T11:00:00.000Z',
    })
    await database.sql`
      UPDATE objective_submissions
      SET result_json = ${JSON.stringify({ section: 'reading', raw: 99 })}
      WHERE attempt_id = ${submission.attemptId}
    `

    await expect(
      readObjectiveAttempt(database, submission.attemptId),
    ).rejects.toThrow()
  })
})
