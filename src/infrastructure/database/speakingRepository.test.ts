import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { SQLocal } from 'sqlocal'
import { migrateDatabase } from './migrations'
import { readLearningSummary } from './attemptRepository'
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
  it('stores a skipped question without manufacturing audio or a transcript', async () => {
    const input = {
      attemptId: crypto.randomUUID(), contentKey: 'skip-check', startedAt: '2026-09-03T10:00:00.000Z', submittedAt: '2026-09-03T10:01:00.000Z',
      recordings: [{ status: 'skipped' as const, promptId: 1, partLabel: 'Part 1', sequence: 0, promptText: 'Where do you live?', timeLimitSeconds: 30, durationMs: 0, audio: null, transcript: '' }],
    }
    const submission = await saveSpeakingAttempt(database, input)
    const saved = await readSpeakingAttempt(database, submission.attemptId)
    expect(saved?.submission.responses[0]).toMatchObject({ status: 'skipped', transcript: '', durationMs: 0 })
    const [row] = await database.sql<{ audio: unknown; size: number }>`SELECT audio, byte_length AS size FROM speaking_responses WHERE attempt_id = ${submission.attemptId}`
    expect(row).toMatchObject({ audio: null, size: 0 })
    await expect(saveSpeakingAttempt(database, { ...input, attemptId: crypto.randomUUID(), recordings: [{ ...input.recordings[0]!, transcript: 'Invented speech' }] })).rejects.toThrow('Skipped responses')
  })
  it('stores an immutable attempt and its ordered audio BLOBs atomically', async () => {
    const submission = await saveSpeakingAttempt(database, {
      attemptId: crypto.randomUUID(),
      contentKey: 'speaking-test-v1',
      startedAt: '2026-08-31T10:00:00.000Z',
      submittedAt: '2026-08-31T10:10:00.000Z',
      recordings: [
        {
          status: 'answered' as const, promptId: 7,
          partLabel: 'Part 2',
          sequence: 0,
          promptText: 'Describe a public place where you enjoy spending time.',
          timeLimitSeconds: 120,
          durationMs: 61_250,
          transcript: 'I enjoy spending time in the public library.',
          audio: new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/webm' }),
        },
        {
          status: 'answered' as const, promptId: 8,
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
      status: 'answered' as const, promptId: 1,
      partLabel: 'Part 1',
      promptText: 'Where do you live?',
      timeLimitSeconds: 35,
      durationMs: 10_000,
      transcript: 'I live in Dhaka.',
      audio: new Blob([new Uint8Array([1])], { type: 'audio/webm' }),
    }

    await expect(
      saveSpeakingAttempt(database, {
      attemptId: crypto.randomUUID(),
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
    expect(rows.map((row) => Number(row.version))).toEqual([1, 2, 3, 4, 5, 6, 9, 10, 11])
  })

  it('stores one transcript-based evaluation and marks the attempt evaluated', async () => {
    const submission = await saveSpeakingAttempt(database, {
      attemptId: crypto.randomUUID(),
      contentKey: 'agent-speaking-interview-v1',
      startedAt: '2026-08-31T10:00:00.000Z',
      submittedAt: '2026-08-31T10:05:00.000Z',
      recordings: [{
        status: 'answered' as const, promptId: 1,
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
    expect(stored?.evaluation).toMatchObject({ overallBand: 6.5 })
    const history = await readLearningSummary(database, 5)
    expect(history.sections.speaking.recent).toEqual([
      { attemptId: submission.attemptId, submittedAt: submission.submittedAt, overallBand: 6.5, evaluationStatus: 'evaluated' },
    ])
    expect(JSON.stringify(history.sections.speaking)).not.toContain(submission.responses[0]!.transcript)
  })
})
