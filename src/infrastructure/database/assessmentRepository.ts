import type { SQLocal } from "sqlocal";
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

type PackageRow = {
  packageId: string;
  profileId: AssessmentPackage["profileId"];
  revision: number;
  documentJson: string;
};

type AttemptRow = {
  id: string;
  packageId: string;
  profileId: string;
  packageSnapshotJson: string;
  responsesJson: string;
  resultJson: string;
  startedAt: string;
  submittedAt: string;
  evaluationJson: string | null;
};

export type SaveAssessmentAttemptInput = {
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
      profile_id AS profileId,
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
        assessment.profileId !== row.profileId ||
        assessment.revision !== Number(row.revision)
      ) {
        throw new Error(`Stored assessment package ${row.packageId} does not match its index.`);
      }
      return [assessment];
    } catch (error) {
      onInvalidAssessment?.(asError(error), { kind: "package", id: row.packageId });
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
    const [existing] = await transaction.sql<{ revision: number; documentJson: string }>`
      SELECT revision, document_json AS documentJson
      FROM assessment_packages
      WHERE package_id = ${assessment.packageId}
    `;
    if (existing) {
      const existingRevision = Number(existing.revision);
      if (existingRevision > assessment.revision) {
        throw new Error(
          `Assessment ${assessment.packageId} already has newer revision ${existingRevision}.`,
        );
      }
      if (existingRevision === assessment.revision && existing.documentJson !== documentJson) {
        throw new Error(
          `Assessment ${assessment.packageId} revision ${assessment.revision} already exists with different data.`,
        );
      }
    }
    await transaction.sql`
      INSERT INTO assessment_packages (
        package_id, profile_id, schema_version, revision, document_json, installed_at
      ) VALUES (
        ${assessment.packageId}, ${assessment.profileId}, ${assessment.schemaVersion},
        ${assessment.revision}, ${documentJson}, ${new Date().toISOString()}
      )
      ON CONFLICT(package_id) DO UPDATE SET
        profile_id = excluded.profile_id,
        schema_version = excluded.schema_version,
        revision = excluded.revision,
        document_json = excluded.document_json,
        installed_at = excluded.installed_at
    `;
  });
}

export async function saveAssessmentAttempt(
  database: SQLocal,
  input: SaveAssessmentAttemptInput,
): Promise<AssessmentSubmission> {
  const submission: AssessmentSubmission = {
    attemptId: crypto.randomUUID(),
    packageId: input.assessment.packageId,
    profileId: input.assessment.profileId,
    package: structuredClone(input.assessment),
    responses: structuredClone(input.responses),
    result: structuredClone(input.result),
    startedAt: input.startedAt,
    submittedAt: input.submittedAt,
  };
  await database.sql`
    INSERT INTO assessment_attempts (
      id, package_id, profile_id, package_snapshot_json, responses_json,
      result_json, started_at, submitted_at
    ) VALUES (
      ${submission.attemptId}, ${submission.packageId}, ${submission.profileId},
      ${JSON.stringify(submission.package)}, ${JSON.stringify(submission.responses)},
      ${JSON.stringify(submission.result)}, ${submission.startedAt}, ${submission.submittedAt}
    )
  `;
  return submission;
}

function parseAttemptRow(row: AttemptRow): {
  submission: AssessmentSubmission;
  evaluation: AssessmentEvaluation | null;
} {
  const assessment = parseAssessmentPackage(JSON.parse(row.packageSnapshotJson));
  const responses = assessmentResponseMapSchema.parse(JSON.parse(row.responsesJson));
  const result = assessmentResultSchema.parse(JSON.parse(row.resultJson));
  if (assessment.packageId !== row.packageId || assessment.profileId !== row.profileId) {
    throw new Error(`Stored assessment attempt ${row.id} does not match its package snapshot.`);
  }
  const evaluation = row.evaluationJson
    ? assessmentEvaluationSchema.parse(JSON.parse(row.evaluationJson))
    : null;
  if (evaluation && evaluation.attemptId !== row.id) {
    throw new Error(`Stored evaluation does not match assessment attempt ${row.id}.`);
  }
  return {
    submission: {
      attemptId: row.id,
      packageId: row.packageId,
      profileId: assessment.profileId,
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
  database: SQLocal,
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
          assessment_attempts.profile_id AS profileId,
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
          assessment_attempts.profile_id AS profileId,
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
  evaluation: AssessmentEvaluation,
): Promise<void> {
  await database.transaction(async (transaction) => {
    const [attempt] = await transaction.sql<{ id: string }>`
      SELECT id FROM assessment_attempts WHERE id = ${evaluation.attemptId}
    `;
    if (!attempt) {
      throw new Error(`Assessment attempt ${evaluation.attemptId} was not found.`);
    }
    await transaction.sql`
      INSERT INTO assessment_evaluations (attempt_id, evaluation_json, evaluated_at)
      VALUES (
        ${evaluation.attemptId}, ${JSON.stringify(evaluation)}, ${evaluation.evaluatedAt}
      )
    `;
  });
}

export async function readAssessmentHistory(
  database: SQLocal,
  limit = 10,
  onInvalidAssessment?: InvalidStoredAssessmentHandler,
): Promise<AssessmentHistoryEntry[]> {
  const normalizedLimit = Math.max(1, Math.min(50, Math.trunc(limit)));
  const rows = await database.sql<AttemptRow>`
    SELECT
      assessment_attempts.id,
      assessment_attempts.package_id AS packageId,
      assessment_attempts.profile_id AS profileId,
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
    LIMIT 50
  `;
  return rows.flatMap((row) => {
    try {
      const { submission } = parseAttemptRow(row);
      return [{
        attemptId: submission.attemptId,
        packageId: submission.packageId,
        profileId: submission.profileId,
        title: submission.package.title,
        rawScore: submission.result.rawScore,
        maximumScore: submission.result.maximumScore,
        awaitingEvaluationCount: submission.result.awaitingEvaluationCount,
        submittedAt: submission.submittedAt,
      }];
    } catch (error) {
      onInvalidAssessment?.(asError(error), { kind: "attempt", id: row.id });
      return [];
    }
  }).slice(0, normalizedLimit);
}
