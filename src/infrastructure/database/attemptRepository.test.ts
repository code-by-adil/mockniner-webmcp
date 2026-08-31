import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { SQLocal } from 'sqlocal'
import { writingDocument } from '@/content/writing'
import type { WritingEvaluation } from '@/domain/types'
import { migrateDatabase } from './migrations'
import {
  readObjectiveAttempt,
  readLearningSummary,
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
        { task: writingDocument.tasks[0], response: 'Task one answer.', wordCount: 3 },
        { task: writingDocument.tasks[1], response: 'Task two answer.', wordCount: 3 },
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
    const storedTask1 = stored?.submission.tasks[0]?.task
    expect(storedTask1?.type).toBe('academic_task_1_bar_chart')
    if (storedTask1?.type !== 'academic_task_1_bar_chart') {
      throw new Error('Expected the stored first Writing task to be Task 1.')
    }
    expect(storedTask1.chart.rows).toHaveLength(7)
    expect(stored?.evaluation).toEqual(evaluation)
    const [attempt] = await database.sql<{ status: string }>`
      SELECT status FROM attempts WHERE id = ${submission.attemptId}
    `
    expect(attempt?.status).toBe('evaluated')
  })

  it('reads a submitted Writing attempt before it has an evaluation', async () => {
    const submission = await saveWritingAttempt(database, {
      contentKey: 'local-writing-v1',
      tasks: [
        { task: writingDocument.tasks[0], response: 'Task one answer.', wordCount: 3 },
        { task: writingDocument.tasks[1], response: 'Task two answer.', wordCount: 3 },
      ],
      startedAt: '2026-08-31T10:00:00.000Z',
      submittedAt: '2026-08-31T11:00:00.000Z',
    })

    await expect(readWritingAttempt(database, submission.attemptId)).resolves.toEqual({
      submission,
      evaluation: null,
    })
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

  it('builds a bounded learning summary without exposing responses or answer keys', async () => {
    await saveObjectiveAttempt(database, {
      section: 'reading',
      contentKey: 'reading-one',
      answers: { 1: 'TRUE' },
      result: {
        section: 'reading', raw: 30, total: 40, band: 7, answered: 40,
        correctQuestionIds: Array.from({ length: 30 }, (_, index) => index + 1),
      },
      startedAt: '2026-08-31T10:00:00.000Z',
      submittedAt: '2026-08-31T11:00:00.000Z',
    })
    await saveObjectiveAttempt(database, {
      section: 'reading',
      contentKey: 'reading-two',
      answers: { 1: 'FALSE' },
      result: {
        section: 'reading', raw: 27, total: 40, band: 6.5, answered: 40,
        correctQuestionIds: Array.from({ length: 27 }, (_, index) => index + 1),
      },
      startedAt: '2026-09-01T10:00:00.000Z',
      submittedAt: '2026-09-01T11:00:00.000Z',
    })
    const writing = await saveWritingAttempt(database, {
      contentKey: 'writing-one',
      tasks: [
        { task: writingDocument.tasks[0], response: 'Private response one.', wordCount: 3 },
        { task: writingDocument.tasks[1], response: 'Private response two.', wordCount: 3 },
      ],
      startedAt: '2026-09-01T12:00:00.000Z',
      submittedAt: '2026-09-01T13:00:00.000Z',
    })
    const taskEvaluation = {
      band: 7,
      taskAchievement: 7,
      coherenceCohesion: 6.5,
      lexicalResource: 6,
      grammaticalRange: 5.5,
      feedback: 'Private feedback.',
      annotations: [],
    }
    await saveWritingEvaluation(database, {
      attemptId: writing.attemptId,
      overallBand: 6.5,
      summary: 'Private evaluation summary.',
      task1: taskEvaluation,
      task2: taskEvaluation,
      evaluatedAt: '2026-09-01T13:05:00.000Z',
    })

    const summary = await readLearningSummary(database, 1)

    expect(summary.totalAttempts).toBe(3)
    expect(summary.sections.reading).toMatchObject({
      attemptCount: 2,
      recentAverageBand: 6.5,
      recent: [{ contentKey: 'reading-two', band: 6.5 }],
    })
    expect(summary.sections.writing).toMatchObject({
      attemptCount: 1,
      evaluatedCount: 1,
      recentAverageOverallBand: 6.5,
      recentAverageCriteria: {
        taskAchievement: 7,
        coherenceCohesion: 6.5,
        lexicalResource: 6,
        grammaticalRange: 5.5,
      },
    })
    expect(JSON.stringify(summary)).not.toContain('Private response')
    expect(JSON.stringify(summary)).not.toContain('Private feedback')
    expect(JSON.stringify(summary)).not.toContain('Private evaluation summary')
  })
})
