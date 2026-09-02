import type { SQLocal } from "sqlocal";
import { resolveWritingEvaluation } from "@/domain/writingAnnotations";
import { ApplicationError } from "@/domain/errors";
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
  parseStoredSpeakingEvaluation,
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

type ObjectiveLearningRow = {
  id: string;
  contentKey: string;
  submittedAt: string;
  resultJson: string;
};

type WritingLearningRow = {
  id: string;
  contentKey: string;
  status: AttemptRow["status"];
  submittedAt: string;
  evaluationJson: string | null;
};

function roundedAverage(values: number[]): number | null {
  if (values.length === 0) return null;
  return (
    Math.round(
      (values.reduce((sum, value) => sum + value, 0) / values.length) * 10,
    ) / 10
  );
}

function averageCriteria(
  values: WritingCriteriaSummary[],
): WritingCriteriaSummary | null {
  if (values.length === 0) return null;
  return {
    taskAchievement: roundedAverage(
      values.map((value) => value.taskAchievement),
    )!,
    coherenceCohesion: roundedAverage(
      values.map((value) => value.coherenceCohesion),
    )!,
    lexicalResource: roundedAverage(
      values.map((value) => value.lexicalResource),
    )!,
    grammaticalRange: roundedAverage(
      values.map((value) => value.grammaticalRange),
    )!,
  };
}

function evaluationCriteria(
  evaluation: WritingEvaluation,
): WritingCriteriaSummary {
  return {
    taskAchievement:
      (evaluation.task1.taskAchievement + evaluation.task2.taskAchievement) / 2,
    coherenceCohesion:
      (evaluation.task1.coherenceCohesion +
        evaluation.task2.coherenceCohesion) /
      2,
    lexicalResource:
      (evaluation.task1.lexicalResource + evaluation.task2.lexicalResource) / 2,
    grammaticalRange:
      (evaluation.task1.grammaticalRange + evaluation.task2.grammaticalRange) /
      2,
  };
}

async function readObjectiveLearningSummary(
  database: SQLocal,
  section: "listening" | "reading",
  attemptCount: number,
  recentLimit: number,
): Promise<ObjectiveLearningSummary> {
  const rows = await database.sql<ObjectiveLearningRow>`
    SELECT
      attempts.id,
      attempts.content_key AS contentKey,
      attempts.submitted_at AS submittedAt,
      objective_submissions.result_json AS resultJson
    FROM attempts
    INNER JOIN objective_submissions
      ON objective_submissions.attempt_id = attempts.id
    WHERE attempts.section = ${section}
    ORDER BY attempts.submitted_at DESC
    LIMIT ${recentLimit}
  `;
  const recent = rows.map((row) => {
    const result = parseStoredObjectiveResult(row.resultJson);
    if (result.section !== section) {
      throw new Error(`The stored ${section} result has the wrong section.`);
    }
    return {
      attemptId: row.id,
      contentKey: row.contentKey,
      band: result.band,
      raw: result.raw,
      total: result.total,
      answered: result.answered,
      submittedAt: row.submittedAt,
    };
  });
  return {
    attemptCount,
    recentAverageBand: roundedAverage(recent.map((attempt) => attempt.band)),
    recent,
  };
}

export async function readLearningSummary(
  database: SQLocal,
  recentLimit: number,
): Promise<LearningSummary> {
  const countRows = await database.sql<AttemptCountRow>`
    SELECT section, status, COUNT(*) AS attemptCount
    FROM attempts
    GROUP BY section, status
  `;
  const counts = new Map(
    countRows.map((row) => [
      `${row.section}:${row.status}`,
      Number(row.attemptCount),
    ]),
  );
  const statusCount = (
    section: AttemptRow["section"],
    status: AttemptRow["status"],
  ) => counts.get(`${section}:${status}`) ?? 0;
  const count = (section: AttemptRow["section"]) =>
    statusCount(section, "submitted") + statusCount(section, "evaluated");

  const [listening, reading, writingRows, speakingRows] = await Promise.all([
    readObjectiveLearningSummary(
      database,
      "listening",
      count("listening"),
      recentLimit,
    ),
    readObjectiveLearningSummary(
      database,
      "reading",
      count("reading"),
      recentLimit,
    ),
    database.sql<WritingLearningRow>`
      SELECT
        attempts.id,
        attempts.content_key AS contentKey,
        attempts.status,
        attempts.submitted_at AS submittedAt,
        writing_evaluations.evaluation_json AS evaluationJson
      FROM attempts
      LEFT JOIN writing_evaluations
        ON writing_evaluations.attempt_id = attempts.id
      WHERE attempts.section = 'writing'
      ORDER BY attempts.submitted_at DESC
      LIMIT ${recentLimit}
    `,
    database.sql<{ id: string; submittedAt: string; evaluationJson: string | null }>`
      SELECT attempts.id, attempts.submitted_at AS submittedAt,
        speaking_evaluations.evaluation_json AS evaluationJson
      FROM attempts LEFT JOIN speaking_evaluations ON speaking_evaluations.attempt_id = attempts.id
      WHERE attempts.section = 'speaking'
      ORDER BY attempts.submitted_at DESC LIMIT ${recentLimit}
    `,
  ]);

  const writingRecent = writingRows.map((row) => {
    const evaluation = row.evaluationJson
      ? parseStoredWritingEvaluation(row.evaluationJson)
      : null;
    if (evaluation && evaluation.attemptId !== row.id) {
      throw new Error(
        "The stored Writing evaluation does not match its attempt.",
      );
    }
    return {
      attemptId: row.id,
      contentKey: row.contentKey,
      status: row.status,
      ...(evaluation
        ? {
            overallBand: evaluation.overallBand,
            criteria: evaluationCriteria(evaluation),
          }
        : {}),
      submittedAt: row.submittedAt,
    };
  });
  const evaluated = writingRecent.filter(
    (attempt) => attempt.overallBand !== undefined,
  );
  const writing = {
    attemptCount: count("writing"),
    evaluatedCount: statusCount("writing", "evaluated"),
    recentAverageOverallBand: roundedAverage(
      evaluated.map((attempt) => attempt.overallBand!),
    ),
    recentAverageCriteria: averageCriteria(
      evaluated.map((attempt) => attempt.criteria!),
    ),
    recent: writingRecent,
  };

  return {
    totalAttempts: [...counts.values()].reduce((sum, value) => sum + value, 0),
    sections: {
      listening,
      reading,
      writing,
      speaking: { attemptCount: count("speaking"), recent: speakingRows.map((row) => {
        const evaluation = row.evaluationJson ? parseStoredSpeakingEvaluation(row.evaluationJson) : null;
        if (evaluation && evaluation.attemptId !== row.id) throw new Error('The stored Speaking evaluation does not match its attempt.');
        return { attemptId: row.id, submittedAt: row.submittedAt,
          evaluationStatus: evaluation?.status === 'insufficient_evidence' ? 'insufficient_evidence' as const : evaluation ? 'evaluated' as const : 'awaiting_evaluation' as const,
          ...(evaluation && evaluation.status !== 'insufficient_evidence' ? { overallBand: evaluation.overallBand } : {}) };
      }) },
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
  evaluation: WritingEvaluation,
): Promise<void> {
  await database.transaction(async (transaction) => {
    const [attempt] = await transaction.sql<{ id: string }>`
      SELECT id FROM attempts
      WHERE id = ${evaluation.attemptId} AND section = 'writing'
    `;
    if (!attempt) {
      throw new Error(`Writing attempt ${evaluation.attemptId} was not found.`);
    }

    const inserted = await transaction.sql<{ attemptId: string }>`
      INSERT INTO writing_evaluations (attempt_id, evaluation_json, evaluated_at)
      VALUES (
        ${evaluation.attemptId},
        ${JSON.stringify(evaluation)},
        ${evaluation.evaluatedAt}
      )
      ON CONFLICT(attempt_id) DO NOTHING
      RETURNING attempt_id AS attemptId
    `;
    if (!inserted.length)
      throw new ApplicationError(
        "EVALUATION_EXISTS",
        `Writing attempt ${evaluation.attemptId} already has an evaluation.`,
      );
    await transaction.sql`
      UPDATE attempts SET status = 'evaluated'
      WHERE id = ${evaluation.attemptId}
    `;
  });
}
