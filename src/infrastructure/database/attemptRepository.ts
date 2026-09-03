import type { SQLocal } from "sqlocal";
import { completeDraft } from './draftRepository';
import { readRecentHistory, type HistoryEntry } from './historyRepository';
import { recordNativeAttemptActivity } from './practiceActivity';
import { resolveWritingEvaluation } from "@/domain/writingAnnotations";
import { prepareEvaluationWrite } from '@/domain/evaluationRevision';
import type {
  ObjectiveSubmission,
  WritingEvaluation,
  WritingSubmission,
  WritingSubmittedTask,
} from "@/domain/types";
import type {
  LearningSummary,
  ObjectiveLearningSummary,
  WritingCriteriaSummary,
} from "@/domain/learningSummary";
import type {
  SaveObjectiveAttemptInput,
  SaveWritingAttemptInput,
} from "@/application/attemptWriter";
import {
  parseStoredObjectiveAnswers,
  parseStoredObjectiveResult,
  parseStoredWritingEvaluation,
  parseStoredWritingSubmission,
} from "@/domain/attemptValidation";

type AttemptRow = {
  id: string;
  section: "listening" | "reading" | "writing" | "speaking";
  contentKey: string;
  status: "submitted" | "evaluated";
  startedAt: string;
  submittedAt: string;
};

type ObjectiveSubmissionRow = AttemptRow & {
  answersJson: string;
  resultJson: string;
};

type WritingSubmissionRow = AttemptRow & {
  submissionJson: string;
  evaluationJson: string | null;
};

type AttemptCountRow = {
  section: AttemptRow["section"];
  status: AttemptRow["status"];
  attemptCount: number;
};

function roundedAverage(values: number[]): number | null {
  return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length * 10) / 10 : null;
}

export async function readLearningSummary(database: SQLocal, recentLimit: number): Promise<LearningSummary> {
  const countRows = await database.sql<AttemptCountRow>`SELECT section, status, COUNT(*) AS attemptCount FROM attempts GROUP BY section, status`;
  const count = (section: AttemptRow['section'], status?: AttemptRow['status']) =>
    countRows.filter(row => row.section === section && (!status || row.status === status)).reduce((sum, row) => sum + Number(row.attemptCount), 0);
  const limit = Math.max(1, Math.min(50, Math.trunc(recentLimit)));
  const [listeningRows, readingRows, writingRows, speakingRows] = await Promise.all(
    (['listening', 'reading', 'writing', 'speaking'] as const).map(kind => readRecentHistory(database, kind, limit)),
  );
  const objective = (section: 'reading' | 'listening', rows: HistoryEntry[]): ObjectiveLearningSummary => ({
    attemptCount: count(section), recentAverageBand: roundedAverage(rows.map(row => row.band!)),
    recent: rows.map(row => ({ attemptId: row.attemptId, contentKey: row.contentKey!, submittedAt: row.submittedAt,
      band: row.band!, raw: row.rawScore!, total: 40, answered: row.answered! })),
  });
  const evaluated = writingRows!.items.filter(row => row.band !== undefined);
  const criteriaKeys = ['taskAchievement', 'coherenceCohesion', 'lexicalResource', 'grammaticalRange'] as const;
  const averageCriteria = evaluated.length ? Object.fromEntries(criteriaKeys.map(key => [key, roundedAverage(evaluated.map(row => row.criteria![key]))!])) as WritingCriteriaSummary : null;
  return {
    totalAttempts: countRows.reduce((sum, row) => sum + Number(row.attemptCount), 0),
    sections: {
      listening: objective('listening', listeningRows!.items), reading: objective('reading', readingRows!.items),
      writing: {
        attemptCount: count('writing'), evaluatedCount: count('writing', 'evaluated'),
        recentAverageOverallBand: roundedAverage(evaluated.map(row => row.band!)), recentAverageCriteria: averageCriteria,
        recent: writingRows!.items.map(row => ({ attemptId: row.attemptId, contentKey: row.contentKey!, submittedAt: row.submittedAt,
          status: row.evaluationStatus === 'evaluated' ? 'evaluated' : 'submitted',
          ...(row.band !== undefined ? { overallBand: row.band, criteria: row.criteria } : {}) })),
      },
      speaking: { attemptCount: count('speaking'), recent: speakingRows!.items.map(row => ({
        attemptId: row.attemptId, submittedAt: row.submittedAt,
        evaluationStatus: row.evaluationStatus === 'not_required' ? 'awaiting_evaluation' : row.evaluationStatus,
        ...(row.band !== undefined ? { overallBand: row.band } : {}),
      })) },
    },
  };
}

export async function saveObjectiveAttempt(
  database: SQLocal,
  input: SaveObjectiveAttemptInput,
): Promise<ObjectiveSubmission> {
  if (input.result.section !== input.section) {
    throw new Error(
      "The objective result section does not match the attempt section.",
    );
  }

  const submission: ObjectiveSubmission = {
    attemptId: input.attemptId,
    contentKey: input.contentKey,
    section: input.section,
    answers: { ...input.answers },
    result: {
      ...input.result,
      correctQuestionIds: [...input.result.correctQuestionIds],
    },
    startedAt: input.startedAt,
    submittedAt: input.submittedAt,
  };

  return database.transaction(async (transaction) => {
    const stored = await readObjectiveAttempt(transaction, input.attemptId);
    if (stored) return stored;
    await transaction.batch((sql) => [
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
    ]);

    await recordNativeAttemptActivity(transaction, submission.attemptId, 'attempt_submitted');
    await completeDraft(transaction, submission.attemptId);
    return submission;
  });
}

export async function readObjectiveAttempt(
  database: Pick<SQLocal, "sql">,
  attemptId?: string,
  section?: 'listening' | 'reading',
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
    WHERE (${attemptId ?? null} IS NULL OR attempts.id = ${attemptId ?? null})
      AND attempts.section IN ('listening', 'reading')
      AND (${section ?? null} IS NULL OR attempts.section = ${section ?? null})
    ORDER BY attempts.submitted_at DESC, attempts.id DESC LIMIT 1
  `;
  if (!row || (row.section !== "listening" && row.section !== "reading"))
    return null;
  const result = parseStoredObjectiveResult(row.resultJson);
  if (result.section !== row.section) {
    throw new Error(
      "The stored objective result section does not match its attempt.",
    );
  }

  return {
    attemptId: row.id,
    contentKey: row.contentKey,
    section: row.section,
    answers: parseStoredObjectiveAnswers(row.answersJson),
    result,
    startedAt: row.startedAt,
    submittedAt: row.submittedAt,
  };
}

export async function saveWritingAttempt(
  database: SQLocal,
  input: SaveWritingAttemptInput,
): Promise<WritingSubmission> {
  const submission: WritingSubmission = {
    attemptId: input.attemptId,
    contentKey: input.contentKey,
    tasks: input.tasks.map((task) => ({
      ...task,
      task: structuredClone(task.task),
    })) as [WritingSubmittedTask, WritingSubmittedTask],
    startedAt: input.startedAt,
    submittedAt: input.submittedAt,
  };

  return database.transaction(async (transaction) => {
    const stored = await readWritingAttempt(transaction, input.attemptId);
    if (stored) return stored.submission;
    await transaction.batch((sql) => [
      sql`INSERT INTO attempts (
      id, section, content_key, status, started_at, submitted_at
    ) VALUES (
      ${submission.attemptId}, 'writing', ${submission.contentKey},
      'submitted', ${submission.startedAt}, ${submission.submittedAt}
    )`,
      sql`INSERT INTO writing_submissions (attempt_id, submission_json)
      VALUES (${submission.attemptId}, ${JSON.stringify(submission)})`,
    ]);

    await recordNativeAttemptActivity(transaction, submission.attemptId, 'attempt_submitted');
    await completeDraft(transaction, submission.attemptId);
    return submission;
  });
}

export async function readWritingAttempt(
  database: Pick<SQLocal, "sql">,
  attemptId?: string,
): Promise<{
  submission: WritingSubmission;
  evaluation: WritingEvaluation | null;
} | null> {
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
      `;

  const row = rows[0];
  if (!row) return null;
  const submission = parseStoredWritingSubmission(row.submissionJson);
  const evaluation = row.evaluationJson
    ? parseStoredWritingEvaluation(row.evaluationJson)
    : null;
  if (
    submission.attemptId !== row.id ||
    submission.contentKey !== row.contentKey ||
    (evaluation && evaluation.attemptId !== row.id)
  ) {
    throw new Error("The stored Writing record does not match its attempt.");
  }
  return {
    submission,
    evaluation: evaluation
      ? resolveWritingEvaluation(submission, evaluation)
      : null,
  };
}

export async function saveWritingEvaluation(
  database: SQLocal,
  candidate: WritingEvaluation,
  expectedRevision?: number,
): Promise<WritingEvaluation> {
  return database.transaction(async (transaction) => {
    const [attempt] = await transaction.sql<{ id: string }>`
      SELECT id FROM attempts
      WHERE id = ${candidate.attemptId} AND section = 'writing'
    `;
    if (!attempt) {
      throw new Error(`Writing attempt ${candidate.attemptId} was not found.`);
    }

    const [row] = await transaction.sql<{ evaluationJson: string; submissionJson: string }>`
      SELECT writing_evaluations.evaluation_json AS evaluationJson,
        writing_submissions.submission_json AS submissionJson
      FROM writing_evaluations JOIN writing_submissions USING (attempt_id)
      WHERE attempt_id = ${candidate.attemptId}
    `;
    const current = row ? resolveWritingEvaluation(
      parseStoredWritingSubmission(row.submissionJson), parseStoredWritingEvaluation(row.evaluationJson),
    ) : null;
    const evaluation = prepareEvaluationWrite(candidate, current, expectedRevision);
    if (evaluation === current) return evaluation;
    await transaction.sql`
      INSERT INTO writing_evaluations (attempt_id, evaluation_json, evaluated_at)
      VALUES (
        ${evaluation.attemptId},
        ${JSON.stringify(evaluation)},
        ${evaluation.evaluatedAt}
      )
      ON CONFLICT(attempt_id) DO UPDATE SET
        evaluation_json = excluded.evaluation_json, evaluated_at = excluded.evaluated_at
    `;
    await transaction.sql`
      UPDATE attempts SET status = 'evaluated'
      WHERE id = ${evaluation.attemptId}
    `;
    await recordNativeAttemptActivity(transaction, evaluation.attemptId, 'feedback_attached', 'evaluated');
    return evaluation;
  });
}
