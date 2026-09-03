import type { SQLocal } from "sqlocal";
import { ApplicationError } from '@/domain/errors';
import { prepareEvaluationWrite } from '@/domain/evaluationRevision';
import { completeDraft } from './draftRepository';
import { readRecentHistory } from './historyRepository';
import { recordPracticeActivity } from './practiceActivity';
import type { AssessmentRepository } from "@/application/assessmentRepository";
import { getLocalDatabase } from "./client";
import {
  assessmentEvaluationSchema,
  assessmentResponseMapSchema,
  assessmentResultSchema,
  parseAssessmentPackage,
  type AssessmentEvaluation,
  type AssessmentHistoryEntry,
  type AssessmentPackage,
  type AssessmentResponseMap,
  type AssessmentResult,
  type AssessmentSubmission,
} from "@/domain/assessment";

export async function getAssessmentRepository(): Promise<AssessmentRepository> {
  return createAssessmentRepository(await getLocalDatabase());
}

export function createAssessmentRepository(
  database: SQLocal,
): AssessmentRepository {
  return {
    loadPackages: (onInvalid) => loadAssessmentPackages(database, onInvalid),
    readHistory: (limit, onInvalid) =>
      readAssessmentHistory(database, limit, onInvalid),
    savePackage: (assessment) => saveAssessmentPackage(database, assessment),
    deletePackage: (id) => deleteAssessmentPackage(database, id),
    saveAttempt: (submission) =>
      saveAssessmentAttempt(database, {
        ...submission,
        assessment: submission.package,
      }),
    readAttempt: (id) => readAssessmentAttempt(database, id),
    saveEvaluation: (evaluation, expectedRevision) =>
      saveAssessmentEvaluation(database, evaluation, expectedRevision),
  };
}
type PackageRow = {
  packageId: string;
  revision: number;
  documentJson: string;
};

type AttemptRow = {
  id: string;
  packageId: string;
  packageSnapshotJson: string;
  responsesJson: string;
  resultJson: string;
  startedAt: string;
  submittedAt: string;
  evaluationJson: string | null;
};

export type SaveAssessmentAttemptInput = {
  attemptId: string;
  assessment: AssessmentPackage;
  responses: AssessmentResponseMap;
  result: AssessmentResult;
  startedAt: string;
  submittedAt: string;
};

export type InvalidStoredAssessmentHandler = (
  error: Error,
  row: { kind: "package" | "attempt"; id: string },
) => void;

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

export async function loadAssessmentPackages(
  database: SQLocal,
  onInvalidAssessment?: InvalidStoredAssessmentHandler,
): Promise<AssessmentPackage[]> {
  const rows = await database.sql<PackageRow>`
    SELECT
      package_id AS packageId,
      revision,
      document_json AS documentJson
    FROM assessment_packages
    ORDER BY installed_at DESC
  `;
  return rows.flatMap((row) => {
    try {
      const assessment = parseAssessmentPackage(JSON.parse(row.documentJson));
      if (
        assessment.packageId !== row.packageId ||
        assessment.revision !== Number(row.revision)
      ) {
        throw new Error(
          `Stored assessment package ${row.packageId} does not match its index.`,
        );
      }
      return [assessment];
    } catch (error) {
      onInvalidAssessment?.(asError(error), {
        kind: "package",
        id: row.packageId,
      });
      return [];
    }
  });
}

export async function saveAssessmentPackage(
  database: SQLocal,
  assessment: AssessmentPackage,
): Promise<void> {
  const documentJson = JSON.stringify(assessment);
  await database.transaction(async (transaction) => {
    const [existing] = await transaction.sql<{
      revision: number;
      documentJson: string;
    }>`
      SELECT revision, document_json AS documentJson
      FROM assessment_packages
      WHERE package_id = ${assessment.packageId}
    `;
    if (existing) {
      const existingRevision = Number(existing.revision);
      if (existingRevision > assessment.revision) {
        throw new ApplicationError(
          "ASSESSMENT_INSTALL_CONFLICT",
          `Assessment ${assessment.packageId} already has newer revision ${existingRevision}.`,
          true,
        );
      }
      if (
        existingRevision === assessment.revision &&
        existing.documentJson !== documentJson
      ) {
        throw new ApplicationError(
          "ASSESSMENT_INSTALL_CONFLICT",
          `Assessment ${assessment.packageId} revision ${assessment.revision} already exists with different data.`,
          true,
        );
      }
      if (existingRevision === assessment.revision) return;
    }
    await transaction.sql`
      INSERT INTO assessment_packages (
        package_id, schema_version, revision, document_json, installed_at
      ) VALUES (
        ${assessment.packageId}, ${assessment.schemaVersion},
        ${assessment.revision}, ${documentJson}, ${new Date().toISOString()}
      )
      ON CONFLICT(package_id) DO UPDATE SET
        schema_version = excluded.schema_version,
        revision = excluded.revision,
        document_json = excluded.document_json,
        installed_at = excluded.installed_at
    `;
    await recordPracticeActivity(transaction, {
      type: existing ? 'practice_updated' : 'practice_installed', kind: 'assessment',
      packageId: assessment.packageId, revision: assessment.revision, title: assessment.title,
    });
  });
}

export async function deleteAssessmentPackage(
  database: SQLocal,
  packageId: string,
): Promise<void> {
  await database.sql`
    DELETE FROM assessment_packages
    WHERE package_id = ${packageId}
  `;
}

export async function saveAssessmentAttempt(
  database: SQLocal,
  input: SaveAssessmentAttemptInput,
): Promise<AssessmentSubmission> {
  const submission: AssessmentSubmission = {
    attemptId: input.attemptId,
    packageId: input.assessment.packageId,
    package: structuredClone(input.assessment),
    responses: structuredClone(input.responses),
    result: structuredClone(input.result),
    startedAt: input.startedAt,
    submittedAt: input.submittedAt,
  };
  return database.transaction(async (transaction) => {
    const inserted = await transaction.sql<{ id: string }>`
      INSERT OR IGNORE INTO assessment_attempts (
        id, package_id, package_snapshot_json, responses_json,
        result_json, started_at, submitted_at
      ) VALUES (
        ${submission.attemptId}, ${submission.packageId},
        ${JSON.stringify(submission.package)}, ${JSON.stringify(submission.responses)},
        ${JSON.stringify(submission.result)}, ${submission.startedAt}, ${submission.submittedAt}
      )
      RETURNING id
    `;
    const stored = await readAssessmentAttempt(transaction, submission.attemptId);
    if (!stored) {
      throw new Error(
        `Assessment attempt ${submission.attemptId} could not be persisted.`,
      );
    }
    if (inserted.length) await recordPracticeActivity(transaction, {
      type: 'attempt_submitted', kind: 'assessment', attemptId: stored.submission.attemptId,
      packageId: stored.submission.packageId, revision: stored.submission.package.revision,
      title: stored.submission.package.title,
    });
    await completeDraft(transaction, stored.submission.attemptId);
    return stored.submission;
  });
}

function parseAttemptRow(row: AttemptRow): {
  submission: AssessmentSubmission;
  evaluation: AssessmentEvaluation | null;
} {
  const assessment = parseAssessmentPackage(
    JSON.parse(row.packageSnapshotJson),
  );
  const responses = assessmentResponseMapSchema.parse(
    JSON.parse(row.responsesJson),
  );
  const result = assessmentResultSchema.parse(JSON.parse(row.resultJson));
  if (assessment.packageId !== row.packageId) {
    throw new Error(
      `Stored assessment attempt ${row.id} does not match its package snapshot.`,
    );
  }
  const evaluation = row.evaluationJson
    ? assessmentEvaluationSchema.parse(JSON.parse(row.evaluationJson))
    : null;
  if (evaluation && evaluation.attemptId !== row.id) {
    throw new Error(
      `Stored evaluation does not match assessment attempt ${row.id}.`,
    );
  }
  return {
    submission: {
      attemptId: row.id,
      packageId: row.packageId,
      package: assessment,
      responses,
      result,
      startedAt: row.startedAt,
      submittedAt: row.submittedAt,
    },
    evaluation,
  };
}

export async function readAssessmentAttempt(
  database: Pick<SQLocal, 'sql'>,
  attemptId?: string,
): Promise<{
  submission: AssessmentSubmission;
  evaluation: AssessmentEvaluation | null;
} | null> {
  const rows = attemptId
    ? await database.sql<AttemptRow>`
        SELECT
          assessment_attempts.id,
          assessment_attempts.package_id AS packageId,
          assessment_attempts.package_snapshot_json AS packageSnapshotJson,
          assessment_attempts.responses_json AS responsesJson,
          assessment_attempts.result_json AS resultJson,
          assessment_attempts.started_at AS startedAt,
          assessment_attempts.submitted_at AS submittedAt,
          assessment_evaluations.evaluation_json AS evaluationJson
        FROM assessment_attempts
        LEFT JOIN assessment_evaluations
          ON assessment_evaluations.attempt_id = assessment_attempts.id
        WHERE assessment_attempts.id = ${attemptId}
      `
    : await database.sql<AttemptRow>`
        SELECT
          assessment_attempts.id,
          assessment_attempts.package_id AS packageId,
          assessment_attempts.package_snapshot_json AS packageSnapshotJson,
          assessment_attempts.responses_json AS responsesJson,
          assessment_attempts.result_json AS resultJson,
          assessment_attempts.started_at AS startedAt,
          assessment_attempts.submitted_at AS submittedAt,
          assessment_evaluations.evaluation_json AS evaluationJson
        FROM assessment_attempts
        LEFT JOIN assessment_evaluations
          ON assessment_evaluations.attempt_id = assessment_attempts.id
        ORDER BY assessment_attempts.submitted_at DESC
        LIMIT 1
      `;
  return rows[0] ? parseAttemptRow(rows[0]) : null;
}

export async function saveAssessmentEvaluation(
  database: SQLocal,
  candidate: AssessmentEvaluation,
  expectedRevision?: number,
): Promise<AssessmentEvaluation> {
  return database.transaction(async (transaction) => {
    const [attempt] = await transaction.sql<{ packageId: string; revision: number; title: string }>`
      SELECT package_id AS packageId,
        json_extract(package_snapshot_json, '$.revision') AS revision,
        json_extract(package_snapshot_json, '$.title') AS title
      FROM assessment_attempts WHERE id = ${candidate.attemptId}
    `;
    if (!attempt) {
      throw new Error(
        `Assessment attempt ${candidate.attemptId} was not found.`,
      );
    }
    const [row] = await transaction.sql<{ evaluationJson: string }>`
      SELECT evaluation_json AS evaluationJson FROM assessment_evaluations
      WHERE attempt_id = ${candidate.attemptId}
    `;
    const current = row ? assessmentEvaluationSchema.parse(JSON.parse(row.evaluationJson)) : null;
    const evaluation = prepareEvaluationWrite(candidate, current, expectedRevision);
    if (evaluation === current) return evaluation;
    await transaction.sql`
      INSERT INTO assessment_evaluations (attempt_id, evaluation_json, evaluated_at)
      VALUES (
        ${evaluation.attemptId}, ${JSON.stringify(evaluation)}, ${evaluation.evaluatedAt}
      )
      ON CONFLICT(attempt_id) DO UPDATE SET
        evaluation_json = excluded.evaluation_json, evaluated_at = excluded.evaluated_at
    `;
    await recordPracticeActivity(transaction, {
      ...attempt, type: 'feedback_attached', kind: 'assessment',
      attemptId: evaluation.attemptId, outcome: 'evaluated',
    });
    return evaluation;
  });
}

export async function readAssessmentHistory(
  database: SQLocal, limit = 10, onInvalidAssessment?: InvalidStoredAssessmentHandler,
): Promise<AssessmentHistoryEntry[]> {
  const page = await readRecentHistory(database, 'assessment', Math.max(1, Math.min(50, Math.trunc(limit))));
  for (const row of page.unavailable) onInvalidAssessment?.(new Error(row.message), { kind: 'attempt', id: row.attemptId });
  return page.items.map(row => ({
    attemptId: row.attemptId, packageId: row.packageId!, title: row.title, rawScore: row.rawScore!,
    maximumScore: row.maximumScore!, submittedAt: row.submittedAt,
    evaluationStatus: row.evaluationStatus === 'insufficient_evidence' ? 'awaiting_evaluation' : row.evaluationStatus,
  }));
}
