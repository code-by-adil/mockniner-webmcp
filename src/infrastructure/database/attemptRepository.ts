import type { SQLocal } from 'sqlocal'
import type {
  ObjectiveSubmission,
  WritingEvaluation,
  WritingSubmission,
  WritingSubmittedTask,
} from '@/domain/types'
import type {
  SaveObjectiveAttemptInput,
  SaveWritingAttemptInput,
} from '@/application/attemptWriter'
import {
  parseStoredObjectiveAnswers,
  parseStoredObjectiveResult,
  parseStoredWritingEvaluation,
  parseStoredWritingSubmission,
} from '@/domain/attemptValidation'

type AttemptRow = {
  id: string
  section: 'listening' | 'reading' | 'writing' | 'speaking'
  contentKey: string
  status: 'submitted' | 'evaluated'
  startedAt: string
  submittedAt: string
}

type ObjectiveSubmissionRow = AttemptRow & {
  answersJson: string
  resultJson: string
}

type WritingSubmissionRow = AttemptRow & {
  submissionJson: string
  evaluationJson: string | null
}

export async function saveObjectiveAttempt(
  database: SQLocal,
  input: SaveObjectiveAttemptInput,
): Promise<ObjectiveSubmission> {
  if (input.result.section !== input.section) {
    throw new Error('The objective result section does not match the attempt section.')
  }

  const submission: ObjectiveSubmission = {
    attemptId: crypto.randomUUID(),
    contentKey: input.contentKey,
    section: input.section,
    answers: { ...input.answers },
    result: { ...input.result, correctQuestionIds: [...input.result.correctQuestionIds] },
    startedAt: input.startedAt,
    submittedAt: input.submittedAt,
  }

  await database.batch((sql) => [
    sql`INSERT INTO attempts (
      id, section, content_key, status, started_at, submitted_at
    ) VALUES (
      ${submission.attemptId}, ${submission.section}, ${submission.contentKey},
      'submitted', ${submission.startedAt}, ${submission.submittedAt}
    )`,
    sql`INSERT INTO objective_submissions (attempt_id, answers_json, result_json)
      VALUES (
        ${submission.attemptId},
        ${JSON.stringify(submission.answers)},
        ${JSON.stringify(submission.result)}
      )`,
  ])

  return submission
}

export async function readObjectiveAttempt(
  database: SQLocal,
  attemptId: string,
): Promise<ObjectiveSubmission | null> {
  const [row] = await database.sql<ObjectiveSubmissionRow>`
    SELECT
      attempts.id,
      attempts.section,
      attempts.content_key AS contentKey,
      attempts.status,
      attempts.started_at AS startedAt,
      attempts.submitted_at AS submittedAt,
      objective_submissions.answers_json AS answersJson,
      objective_submissions.result_json AS resultJson
    FROM attempts
    INNER JOIN objective_submissions
      ON objective_submissions.attempt_id = attempts.id
    WHERE attempts.id = ${attemptId}
      AND attempts.section IN ('listening', 'reading')
  `
  if (!row || (row.section !== 'listening' && row.section !== 'reading')) return null
  const result = parseStoredObjectiveResult(row.resultJson)
  if (result.section !== row.section) {
    throw new Error('The stored objective result section does not match its attempt.')
  }

  return {
    attemptId: row.id,
    contentKey: row.contentKey,
    section: row.section,
    answers: parseStoredObjectiveAnswers(row.answersJson),
    result,
    startedAt: row.startedAt,
    submittedAt: row.submittedAt,
  }
}

export async function saveWritingAttempt(
  database: SQLocal,
  input: SaveWritingAttemptInput,
): Promise<WritingSubmission> {
  const submission: WritingSubmission = {
    attemptId: crypto.randomUUID(),
    contentKey: input.contentKey,
    tasks: input.tasks.map((task) => ({
      ...task,
      task: structuredClone(task.task),
    })) as [WritingSubmittedTask, WritingSubmittedTask],
    startedAt: input.startedAt,
    submittedAt: input.submittedAt,
  }

  await database.batch((sql) => [
    sql`INSERT INTO attempts (
      id, section, content_key, status, started_at, submitted_at
    ) VALUES (
      ${submission.attemptId}, 'writing', ${submission.contentKey},
      'submitted', ${submission.startedAt}, ${submission.submittedAt}
    )`,
    sql`INSERT INTO writing_submissions (attempt_id, submission_json)
      VALUES (${submission.attemptId}, ${JSON.stringify(submission)})`,
  ])

  return submission
}

export async function readWritingAttempt(
  database: SQLocal,
  attemptId?: string,
): Promise<{ submission: WritingSubmission; evaluation: WritingEvaluation | null } | null> {
  const rows = attemptId
    ? await database.sql<WritingSubmissionRow>`
        SELECT
          attempts.id,
          attempts.section,
          attempts.content_key AS contentKey,
          attempts.status,
          attempts.started_at AS startedAt,
          attempts.submitted_at AS submittedAt,
          writing_submissions.submission_json AS submissionJson,
          writing_evaluations.evaluation_json AS evaluationJson
        FROM attempts
        INNER JOIN writing_submissions
          ON writing_submissions.attempt_id = attempts.id
        LEFT JOIN writing_evaluations
          ON writing_evaluations.attempt_id = attempts.id
        WHERE attempts.id = ${attemptId} AND attempts.section = 'writing'
      `
    : await database.sql<WritingSubmissionRow>`
        SELECT
          attempts.id,
          attempts.section,
          attempts.content_key AS contentKey,
          attempts.status,
          attempts.started_at AS startedAt,
          attempts.submitted_at AS submittedAt,
          writing_submissions.submission_json AS submissionJson,
          writing_evaluations.evaluation_json AS evaluationJson
        FROM attempts
        INNER JOIN writing_submissions
          ON writing_submissions.attempt_id = attempts.id
        LEFT JOIN writing_evaluations
          ON writing_evaluations.attempt_id = attempts.id
        WHERE attempts.section = 'writing'
        ORDER BY attempts.submitted_at DESC
        LIMIT 1
      `

  const row = rows[0]
  if (!row) return null
  const submission = parseStoredWritingSubmission(row.submissionJson)
  const evaluation = row.evaluationJson
    ? parseStoredWritingEvaluation(row.evaluationJson)
    : null
  if (
    submission.attemptId !== row.id ||
    submission.contentKey !== row.contentKey ||
    evaluation?.attemptId !== row.id
  ) {
    throw new Error('The stored Writing record does not match its attempt.')
  }
  return {
    submission,
    evaluation,
  }
}

export async function saveWritingEvaluation(
  database: SQLocal,
  evaluation: WritingEvaluation,
): Promise<void> {
  await database.transaction(async (transaction) => {
    const [attempt] = await transaction.sql<{ id: string }>`
      SELECT id FROM attempts
      WHERE id = ${evaluation.attemptId} AND section = 'writing'
    `
    if (!attempt) {
      throw new Error(`Writing attempt ${evaluation.attemptId} was not found.`)
    }

    await transaction.sql`
      INSERT INTO writing_evaluations (attempt_id, evaluation_json, evaluated_at)
      VALUES (
        ${evaluation.attemptId},
        ${JSON.stringify(evaluation)},
        ${evaluation.evaluatedAt}
      )
      ON CONFLICT(attempt_id) DO UPDATE SET
        evaluation_json = excluded.evaluation_json,
        evaluated_at = excluded.evaluated_at
    `
    await transaction.sql`
      UPDATE attempts SET status = 'evaluated'
      WHERE id = ${evaluation.attemptId}
    `
  })
}
