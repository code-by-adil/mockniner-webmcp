import type { SQLocal } from 'sqlocal'
import type { SpeakingSubmission } from '@/domain/types'
import type {
  SaveSpeakingAttemptInput,
  SpeakingRecordingInput,
} from '@/application/attemptWriter'

export type StoredSpeakingResponse = {
  id: string
  attemptId: string
  promptId: number
  partLabel: string
  sequence: number
  promptText: string
  timeLimitSeconds: number
  durationMs: number
  mimeType: string
  byteLength: number
  audio: Uint8Array<ArrayBuffer>
}

type StoredSpeakingAttemptRow = {
  id: string
  contentKey: string
  status: 'submitted' | 'evaluated'
  startedAt: string
  submittedAt: string
}

type StoredSpeakingResponseRow = {
  id: string
  attemptId: string
  promptId: number
  partLabel: string
  sequence: number
  promptText: string
  timeLimitSeconds: number
  durationMs: number
  mimeType: string
  byteLength: number
  audio: Uint8Array<ArrayBuffer>
}

function validateRecordings(recordings: SpeakingRecordingInput[]): void {
  if (recordings.length === 0) {
    throw new Error('A Speaking attempt must contain at least one recording.')
  }

  const promptIds = new Set<number>()
  const sequences = new Set<number>()

  for (const recording of recordings) {
    if (recording.audio.size === 0) {
      throw new Error(`The recording for prompt ${recording.promptId} is empty.`)
    }
    if (promptIds.has(recording.promptId)) {
      throw new Error(`Prompt ${recording.promptId} has more than one recording.`)
    }
    if (sequences.has(recording.sequence)) {
      throw new Error(`Speaking response sequence ${recording.sequence} is duplicated.`)
    }
    promptIds.add(recording.promptId)
    sequences.add(recording.sequence)
  }
}

export async function saveSpeakingAttempt(
  database: SQLocal,
  input: SaveSpeakingAttemptInput,
): Promise<SpeakingSubmission> {
  validateRecordings(input.recordings)

  const attemptId = crypto.randomUUID()
  const { submittedAt } = input
  const preparedRecordings = await Promise.all(
    input.recordings.map(async (recording) => ({
      ...recording,
      id: crypto.randomUUID(),
      mimeType: recording.audio.type || 'audio/webm',
      byteLength: recording.audio.size,
      audioBytes: new Uint8Array(await recording.audio.arrayBuffer()),
    })),
  )

  await database.batch((sql) => [
    sql`INSERT INTO attempts (
      id, section, content_key, status, started_at, submitted_at
    ) VALUES (
      ${attemptId}, 'speaking', ${input.contentKey}, 'submitted', ${input.startedAt}, ${submittedAt}
    )`,
    ...preparedRecordings.map(
      (recording) => sql`INSERT INTO speaking_responses (
        id,
        attempt_id,
        prompt_id,
        part_label,
        sequence,
        prompt_text,
        time_limit_seconds,
        duration_ms,
        mime_type,
        byte_length,
        audio
      ) VALUES (
        ${recording.id},
        ${attemptId},
        ${recording.promptId},
        ${recording.partLabel},
        ${recording.sequence},
        ${recording.promptText},
        ${recording.timeLimitSeconds},
        ${Math.max(0, Math.round(recording.durationMs))},
        ${recording.mimeType},
        ${recording.byteLength},
        ${recording.audioBytes}
      )`,
    ),
  ])

  return {
    attemptId,
    promptCount: input.recordings.length,
    recordedCount: preparedRecordings.length,
    recordingIds: preparedRecordings.map((recording) => recording.id),
    submittedAt,
  }
}

export async function readSpeakingAttempt(
  database: SQLocal,
  attemptId: string,
): Promise<{
  attempt: StoredSpeakingAttemptRow
  responses: StoredSpeakingResponse[]
} | null> {
  const [attempt] = await database.sql<StoredSpeakingAttemptRow>`
    SELECT
      id,
      content_key AS contentKey,
      status,
      started_at AS startedAt,
      submitted_at AS submittedAt
    FROM attempts
    WHERE id = ${attemptId} AND section = 'speaking'
  `
  if (!attempt) return null

  const responses = await database.sql<StoredSpeakingResponseRow>`
    SELECT
      id,
      attempt_id AS attemptId,
      prompt_id AS promptId,
      part_label AS partLabel,
      sequence,
      prompt_text AS promptText,
      time_limit_seconds AS timeLimitSeconds,
      duration_ms AS durationMs,
      mime_type AS mimeType,
      byte_length AS byteLength,
      audio
    FROM speaking_responses
    WHERE attempt_id = ${attemptId}
    ORDER BY sequence
  `

  return { attempt, responses }
}
