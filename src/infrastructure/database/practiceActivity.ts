import type { SQLocal } from 'sqlocal'
import { activityPageSchema, practiceActivitySchema, type ActivityPage, type PracticeActivity, type PracticeActivityPage } from '@/domain/practiceActivity'

type ActivityInput = Pick<PracticeActivity, 'type' | 'kind'> &
  Partial<Pick<PracticeActivity, 'contentKey' | 'packageId' | 'revision' | 'attemptId' | 'title' | 'outcome'>>

// Call only inside the transaction that saves the corresponding business record.
// Retrying that operation is handled by its repository, not by this bounded log.
export async function recordPracticeActivity(transaction: Pick<SQLocal, 'sql'>, input: ActivityInput): Promise<void> {
  await transaction.sql`
    INSERT INTO practice_activity (
      recorded_at, event_type, kind, content_key, package_id, revision, attempt_id, title, outcome
    ) VALUES (
      ${new Date().toISOString()}, ${input.type}, ${input.kind},
      ${input.contentKey ?? null}, ${input.packageId ?? null}, ${input.revision ?? null},
      ${input.attemptId ?? null}, ${input.title?.slice(0, 160) ?? null}, ${input.outcome ?? null}
    )
  `
  await transaction.sql`
    DELETE FROM practice_activity WHERE id NOT IN (
      SELECT id FROM practice_activity ORDER BY id DESC LIMIT 100
    )
  `
}

export async function recordNativeAttemptActivity(
  transaction: Pick<SQLocal, 'sql'>,
  attemptId: string,
  type: 'attempt_submitted' | 'feedback_attached',
  outcome?: 'evaluated' | 'insufficient_evidence',
): Promise<void> {
  const [attempt] = await transaction.sql<{
    kind: Exclude<PracticeActivity['kind'], 'assessment'>; contentKey: string; title: unknown
  }>`
    SELECT attempts.section AS kind, attempts.content_key AS contentKey,
      CASE WHEN json_valid(content_documents.document_json)
        THEN json_extract(content_documents.document_json, '$.name') END AS title
    FROM attempts LEFT JOIN content_documents ON content_documents.content_key = attempts.content_key
    WHERE attempts.id = ${attemptId}
  `
  if (!attempt) throw new Error('Cannot record activity for a missing attempt.')
  await recordPracticeActivity(transaction, { ...attempt, title: typeof attempt.title === 'string' ? attempt.title : null, attemptId, type, outcome })
}

export async function readPracticeActivity(database: Pick<SQLocal, 'sql'>, input: ActivityPage): Promise<PracticeActivityPage> {
  const { kind, limit, offset } = activityPageSchema.parse(input)
  const rows = await database.sql<PracticeActivity>`
    SELECT id AS eventId, recorded_at AS recordedAt, event_type AS type, kind,
      content_key AS contentKey, package_id AS packageId, revision,
      attempt_id AS attemptId, title, outcome
    FROM practice_activity
    WHERE (${kind ?? null} IS NULL OR kind = ${kind ?? null})
    ORDER BY id DESC LIMIT ${limit + 1} OFFSET ${offset}
  `
  return {
    items: rows.slice(0, limit).map(row => practiceActivitySchema.parse(row)),
    nextOffset: rows.length > limit ? offset + limit : null,
  }
}
