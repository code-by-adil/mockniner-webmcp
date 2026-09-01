import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { SQLocal } from 'sqlocal'
import { migrateDatabase } from './migrations'
import {
  readSpeakingAttempt,
  saveSpeakingAttempt,
  saveSpeakingEvaluation,
} from './speakingRepository'

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
          transcript: 'I enjoy spending time in the public library.',
          audio: new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/webm' }),
        },
        {
          promptId: 8,
          partLabel: 'Part 3',
          sequence: 1,
          promptText: 'Why are public spaces important?',
          timeLimitSeconds: 55,
          durationMs: 32_500,
          transcript: 'They give people room to meet and relax.',
          audio: new Blob([new Uint8Array([4, 5])], { type: 'audio/webm' }),
        },
      ],
    })

    expect(submission.responses).toHaveLength(2)

    const stored = await readSpeakingAttempt(database, submission.attemptId)
    expect(stored?.submission).toMatchObject({
      attemptId: submission.attemptId,
      contentKey: 'speaking-test-v1',
      startedAt: '2026-08-31T10:00:00.000Z',
    })
    expect(stored?.submission.responses.map((response) => response.promptId)).toEqual([7, 8])
    expect(stored?.submission.responses[0]?.durationMs).toBe(61_250)
    expect(stored?.submission.responses[0]?.transcript).toBe(
      'I enjoy spending time in the public library.',
    )
    const [recording] = await database.sql<{ audio: Uint8Array<ArrayBuffer> }>`
      SELECT audio FROM speaking_responses WHERE attempt_id = ${submission.attemptId} AND sequence = 0
    `
    expect(Array.from(recording?.audio ?? [])).toEqual([1, 2, 3])
  })

  it('rejects duplicate prompt recordings before writing an attempt', async () => {
    const duplicate = {
      promptId: 1,
      partLabel: 'Part 1',
      promptText: 'Where do you live?',
      timeLimitSeconds: 35,
      durationMs: 10_000,
      transcript: 'I live in Dhaka.',
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
    expect(rows.map((row) => Number(row.version))).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  it('stores one transcript-based evaluation and marks the attempt evaluated', async () => {
    const submission = await saveSpeakingAttempt(database, {
      contentKey: 'agent-speaking-interview-v1',
      startedAt: '2026-08-31T10:00:00.000Z',
      submittedAt: '2026-08-31T10:05:00.000Z',
      recordings: [{
        promptId: 1,
        partLabel: 'Part 1',
        sequence: 0,
        promptText: 'Tell me about your hometown.',
        timeLimitSeconds: 45,
        durationMs: 20_000,
        transcript: 'My hometown is a busy coastal city.',
        audio: new Blob([new Uint8Array([1])], { type: 'audio/webm' }),
      }],
    })
    await saveSpeakingEvaluation(database, {
      attemptId: submission.attemptId,
      overallBand: 6.5,
      fluencyCoherence: 6.5,
      lexicalResource: 6.5,
      grammaticalRangeAccuracy: 6,
      summary: 'The response is clear and relevant.',
      strengths: ['Direct answer with useful detail.'],
      improvements: ['Develop the answer with a specific example.'],
      evaluatedAt: '2026-08-31T10:06:00.000Z',
    })

    const stored = await readSpeakingAttempt(database, submission.attemptId)
    expect(stored?.evaluation?.overallBand).toBe(6.5)
  })
})
