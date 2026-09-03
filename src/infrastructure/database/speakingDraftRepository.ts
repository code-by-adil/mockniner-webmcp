import { z } from 'zod';
import type { SQLocal } from 'sqlocal';
import type { SpeakingRecordingInput } from '@/application/attemptWriter';
import { defaultSpeakingPlan, speakingPlanSchema, speakingQuestionText } from '@/domain/speakingPlan';
import { attemptSnapshotSchema } from '../ieltsDraftCodec';

const responseSchema = z.object({
  status: z.enum(['answered', 'skipped']), promptId: z.number().int().positive(),
  partLabel: z.string(), sequence: z.number().int().nonnegative(), promptText: z.string(),
  timeLimitSeconds: z.number().positive(), durationMs: z.number().nonnegative(), transcript: z.string(),
});

async function readPlan(db: Pick<SQLocal, 'sql'>, id: string) {
  const [row] = await db.sql<{ json: string }>`SELECT state_json AS json FROM practice_drafts WHERE id = ${id} AND family = 'ielts'`;
  if (!row) throw new Error('The Speaking draft is not available. Your recording has not been discarded.');
  const { draft } = attemptSnapshotSchema.parse(JSON.parse(row.json));
  if (draft.currentSection !== 'speaking' || draft.attemptId !== id) throw new Error('The Speaking draft identity does not match.');
  return speakingPlanSchema.parse(draft.speakingPlan ?? defaultSpeakingPlan);
}

function validate(response: SpeakingRecordingInput, plan: Awaited<ReturnType<typeof readPlan>>) {
  const parsed = responseSchema.parse(response);
  const question = plan.questions[parsed.sequence];
  if (!question || question.id !== parsed.promptId || speakingQuestionText(question) !== parsed.promptText || question.responseSeconds !== parsed.timeLimitSeconds)
    throw new Error('The saved recording does not match its interview question.');
  if (parsed.status === 'answered' ? !response.audio?.size : response.audio !== null || parsed.durationMs !== 0 || parsed.transcript !== '')
    throw new Error('The saved recording is incomplete.');
  return parsed;
}

export async function saveDraftRecording(db: SQLocal, attemptId: string, response: SpeakingRecordingInput) {
  const bytes = response.audio ? new Uint8Array(await response.audio.arrayBuffer()) : null;
  await db.transaction(async tx => {
    const parsed = validate(response, await readPlan(tx, attemptId));
    const [count] = await tx.sql<{ count: number }>`SELECT COUNT(*) AS count FROM draft_recordings WHERE attempt_id = ${attemptId}`;
    if (parsed.sequence > Number(count?.count ?? 0)) throw new Error('Save the previous answer before continuing.');
    await tx.sql`INSERT INTO draft_recordings (attempt_id, sequence, response_json, audio, mime_type)
      VALUES (${attemptId}, ${parsed.sequence}, ${JSON.stringify(parsed)}, ${bytes}, ${response.audio?.type ?? null})
      ON CONFLICT(attempt_id, sequence) DO UPDATE SET response_json = excluded.response_json, audio = excluded.audio, mime_type = excluded.mime_type`;
  });
}

export async function loadDraftRecordings(db: SQLocal, attemptId: string): Promise<SpeakingRecordingInput[]> {
  const plan = await readPlan(db, attemptId);
  const rows = await db.sql<{ sequence: number; json: string; audio: Uint8Array | null; mime: string | null }>`
    SELECT sequence, response_json AS json, audio, mime_type AS mime FROM draft_recordings WHERE attempt_id = ${attemptId} ORDER BY sequence`;
  return rows.map((row, index) => {
    const response = { ...responseSchema.parse(JSON.parse(row.json)), audio: row.audio ? new Blob([new Uint8Array(row.audio)], { type: row.mime ?? 'audio/webm' }) : null };
    if (row.sequence !== index || response.sequence !== index) throw new Error('The saved interview has a missing answer. Its recordings have been kept.');
    validate(response, plan);
    return response;
  });
}
