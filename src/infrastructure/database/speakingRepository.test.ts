import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { SQLocal } from 'sqlocal'
import { migrateDatabase } from './migrations'
import { readSpeakingAttempt, saveSpeakingAttempt } from './speakingRepository'

let database: SQLocal

beforeAll(() => {
  // SQLocal supports an in-memory processor in non-browser environments, but its
  // transaction lock selection still performs an `instanceof Worker` check.
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

describe('Speaking SQLite repository', () => {
  it('stores an immutable attempt and its ordered audio BLOBs atomically', async () => {
    const submission = await saveSpeakingAttempt(database, {
      contentKey: 'speaking-test-v1',
      startedAt: '2026-08-31T10:00:00.000Z',
      submittedAt: '2026-08-31T10:10:00.000Z',
      recordings: [
        {
          promptId: 7,
          partLabel: 'Part 2',
          sequence: 0,
          promptText: 'Describe a public place where you enjoy spending time.',
          timeLimitSeconds: 120,
          durationMs: 61_250,
          audio: new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/webm' }),
        },
        {
          promptId: 8,
          partLabel: 'Part 3',
          sequence: 1,
          promptText: 'Why are public spaces important?',
          timeLimitSeconds: 55,
          durationMs: 32_500,
          audio: new Blob([new Uint8Array([4, 5])], { type: 'audio/webm' }),
        },
      ],
    })

    expect(submission.promptCount).toBe(2)
    expect(submission.recordedCount).toBe(2)
    expect(submission.recordingIds).toHaveLength(2)

    const stored = await readSpeakingAttempt(database, submission.attemptId)
    expect(stored?.attempt).toMatchObject({
      id: submission.attemptId,
      contentKey: 'speaking-test-v1',
      status: 'submitted',
      startedAt: '2026-08-31T10:00:00.000Z',
    })
    expect(stored?.responses.map((response) => response.promptId)).toEqual([7, 8])
    expect(Array.from(stored?.responses[0]?.audio ?? [])).toEqual([1, 2, 3])
    expect(stored?.responses[0]?.durationMs).toBe(61_250)
  })

  it('rejects duplicate prompt recordings before writing an attempt', async () => {
    const duplicate = {
      promptId: 1,
      partLabel: 'Part 1',
      promptText: 'Where do you live?',
      timeLimitSeconds: 35,
      durationMs: 10_000,
      audio: new Blob([new Uint8Array([1])], { type: 'audio/webm' }),
    }

    await expect(
      saveSpeakingAttempt(database, {
        contentKey: 'speaking-test-v1',
        startedAt: '2026-08-31T10:00:00.000Z',
        submittedAt: '2026-08-31T10:10:00.000Z',
        recordings: [
          { ...duplicate, sequence: 0 },
          { ...duplicate, sequence: 1 },
        ],
      }),
    ).rejects.toThrow('Prompt 1 has more than one recording.')

    const [row] = await database.sql<{ count: number }>`SELECT COUNT(*) AS count FROM attempts`
    expect(Number(row?.count)).toBe(0)
  })

  it('applies the initial schema migration once', async () => {
    await migrateDatabase(database)
    const rows = await database.sql<{ version: number }>`
      SELECT version FROM app_schema_migrations ORDER BY version
    `
    expect(rows.map((row) => Number(row.version))).toEqual([1, 2, 3])
  })
})
