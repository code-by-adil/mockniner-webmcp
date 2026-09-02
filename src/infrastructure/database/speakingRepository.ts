import type { SQLocal } from "sqlocal";
import { recordNativeAttemptActivity } from './practiceActivity';
import { ApplicationError } from "@/domain/errors";
import type { SpeakingEvaluation, SpeakingSubmission } from "@/domain/types";
import { parseStoredSpeakingEvaluation } from "@/domain/attemptValidation";
import type {
  SaveSpeakingAttemptInput,
  SpeakingRecordingInput,
} from "@/application/attemptWriter";

type StoredSpeakingAttemptRow = {
  id: string;
  contentKey: string;
  startedAt: string;
  submittedAt: string;
};

type StoredSpeakingResponseRow = {
  status: "answered" | "skipped";
  id: string;
  promptId: number;
  partLabel: string;
  sequence: number;
  promptText: string;
  timeLimitSeconds: number;
  durationMs: number;
  transcript: string;
};

type StoredSpeakingEvaluationRow = {
  evaluationJson: string;
};

function validateRecordings(recordings: SpeakingRecordingInput[]): void {
  if (recordings.length === 0) {
    throw new Error("A Speaking attempt must contain at least one recording.");
  }

  const promptIds = new Set<number>();
  const sequences = new Set<number>();

  for (const recording of recordings) {
    if (recording.status === 'answered' && (!recording.audio || recording.audio.size === 0)) {
      throw new Error(
        `The recording for prompt ${recording.promptId} is empty.`,
      );
    }
    if (recording.status === 'answered' && !recording.transcript.trim()) {
      throw new Error(
        `The transcript for prompt ${recording.promptId} is empty.`,
      );
    }
    if (recording.status === 'skipped' && (recording.audio !== null || recording.transcript !== '' || recording.durationMs !== 0)) throw new Error('Skipped responses cannot contain audio, transcript or duration.');
    if (recording.status !== 'answered' && recording.status !== 'skipped') throw new Error('Invalid Speaking response status.');
    if (promptIds.has(recording.promptId)) {
      throw new Error(
        `Prompt ${recording.promptId} has more than one recording.`,
      );
    }
    if (sequences.has(recording.sequence)) {
      throw new Error(
        `Speaking response sequence ${recording.sequence} is duplicated.`,
      );
    }
    promptIds.add(recording.promptId);
    sequences.add(recording.sequence);
  }
}

export async function saveSpeakingAttempt(
  database: SQLocal,
  input: SaveSpeakingAttemptInput,
): Promise<SpeakingSubmission> {
  validateRecordings(input.recordings);

  const attemptId = input.attemptId;
  const { submittedAt } = input;
  const preparedRecordings = await Promise.all(
    input.recordings.map(async (recording) => ({
      ...recording,
      id: crypto.randomUUID(),
      mimeType: recording.audio?.type || null,
      byteLength: recording.audio?.size ?? 0,
      audioBytes: recording.audio ? new Uint8Array(await recording.audio.arrayBuffer()) : null,
    })),
  );

  return database.transaction(async (transaction) => {
    const stored = await readSpeakingAttempt(transaction, input.attemptId);
    if (stored) return stored.submission;
    await transaction.batch((sql) => [
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
        audio,
        transcript,
        response_status
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
        ${recording.audioBytes},
        ${recording.transcript.trim()},
        ${recording.status}
      )`,
      ),
    ]);

    await recordNativeAttemptActivity(transaction, attemptId, 'attempt_submitted');
    return {
      attemptId,
      contentKey: input.contentKey,
      responses: preparedRecordings.map((recording) => ({
        status: recording.status,
        recordingId: recording.id,
        promptId: recording.promptId,
        partLabel: recording.partLabel,
        sequence: recording.sequence,
        promptText: recording.promptText,
        timeLimitSeconds: recording.timeLimitSeconds,
        durationMs: Math.max(0, Math.round(recording.durationMs)),
        transcript: recording.transcript.trim(),
      })),
      startedAt: input.startedAt,
      submittedAt,
    };
  });
}

export async function readSpeakingAttempt(
  database: Pick<SQLocal, "sql">,
  attemptId?: string,
): Promise<{
  submission: SpeakingSubmission;
  evaluation: SpeakingEvaluation | null;
} | null> {
  const attempts = attemptId
    ? await database.sql<StoredSpeakingAttemptRow>`
    SELECT
      id,
      content_key AS contentKey,
      started_at AS startedAt,
      submitted_at AS submittedAt
    FROM attempts
    WHERE id = ${attemptId} AND section = 'speaking'
    `
    : await database.sql<StoredSpeakingAttemptRow>`
      SELECT
        id,
        content_key AS contentKey,
        started_at AS startedAt,
        submitted_at AS submittedAt
      FROM attempts
      WHERE section = 'speaking'
      ORDER BY submitted_at DESC
      LIMIT 1
    `;
  const [attempt] = attempts;
  if (!attempt) return null;

  const responses = await database.sql<StoredSpeakingResponseRow>`
    SELECT
      id,
      prompt_id AS promptId,
      part_label AS partLabel,
      sequence,
      prompt_text AS promptText,
      time_limit_seconds AS timeLimitSeconds,
      duration_ms AS durationMs,
      transcript,
      response_status AS status
    FROM speaking_responses
    WHERE attempt_id = ${attempt.id}
    ORDER BY sequence
  `;

  const [evaluationRow] = await database.sql<StoredSpeakingEvaluationRow>`
    SELECT evaluation_json AS evaluationJson
    FROM speaking_evaluations
    WHERE attempt_id = ${attempt.id}
  `;

  const submission: SpeakingSubmission = {
    attemptId: attempt.id,
    contentKey: attempt.contentKey,
    responses: responses.map((response) => ({
      status: response.status,
      recordingId: response.id,
      promptId: response.promptId,
      partLabel: response.partLabel,
      sequence: response.sequence,
      promptText: response.promptText,
      timeLimitSeconds: response.timeLimitSeconds,
      durationMs: response.durationMs,
      transcript: response.transcript,
    })),
    startedAt: attempt.startedAt,
    submittedAt: attempt.submittedAt,
  };

  return {
    submission,
    evaluation: evaluationRow
      ? parseStoredSpeakingEvaluation(evaluationRow.evaluationJson)
      : null,
  };
}

export async function saveSpeakingEvaluation(
  database: SQLocal,
  evaluation: SpeakingEvaluation,
): Promise<void> {
  await database.transaction(async (transaction) => {
    const [attempt] = await transaction.sql<{
      id: string;
    }>`SELECT id FROM attempts WHERE id = ${evaluation.attemptId} AND section = 'speaking'`;
    if (!attempt)
      throw new ApplicationError(
        "SPEAKING_SUBMISSION_NOT_FOUND",
        `Speaking attempt ${evaluation.attemptId} was not found.`,
      );
    const inserted = await transaction.sql<{
      attemptId: string;
    }>`INSERT INTO speaking_evaluations (
      attempt_id, evaluation_json, evaluated_at
    ) VALUES (
      ${evaluation.attemptId}, ${JSON.stringify(evaluation)}, ${evaluation.evaluatedAt}
    ) ON CONFLICT(attempt_id) DO NOTHING RETURNING attempt_id AS attemptId`;
    if (!inserted.length)
      throw new ApplicationError(
        "EVALUATION_EXISTS",
        `Speaking attempt ${evaluation.attemptId} already has an evaluation.`,
      );
    await transaction.sql`UPDATE attempts
      SET status = 'evaluated'
      WHERE id = ${evaluation.attemptId} AND section = 'speaking'`;
    await recordNativeAttemptActivity(transaction, evaluation.attemptId, 'feedback_attached',
      evaluation.status === 'insufficient_evidence' ? 'insufficient_evidence' : 'evaluated');
  });
}
