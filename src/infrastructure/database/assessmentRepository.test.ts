import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { SQLocal } from "sqlocal";
import { satPracticeAssessment } from "@/content/sat";
import { gradeAssessment } from "@/domain/assessment";
import { migrateDatabase } from "./migrations";
import {
  loadAssessmentPackages,
  readAssessmentAttempt,
  readAssessmentHistory,
  saveAssessmentAttempt,
  saveAssessmentPackage,
} from "./assessmentRepository";

let database: SQLocal;

beforeAll(() => {
  vi.stubGlobal("Worker", class TestWorker {});
});

afterAll(() => {
  vi.unstubAllGlobals();
});

beforeEach(async () => {
  let resolveConnected!: () => void;
  const connected = new Promise<void>((resolve) => {
    resolveConnected = resolve;
  });
  database = new SQLocal({
    databasePath: ":memory:",
    onInit: (sql) => [sql`PRAGMA foreign_keys = ON`],
    onConnect: resolveConnected,
  });
  await connected;
  await migrateDatabase(database);
});

afterEach(async () => {
  await database.destroy(true);
});

describe("universal assessment repository", () => {
  it("creates only the canonical version-3 assessment columns", async () => {
    const packageColumns = await database.sql<{ name: string }>`PRAGMA table_info(assessment_packages)`;
    const attemptColumns = await database.sql<{ name: string }>`PRAGMA table_info(assessment_attempts)`;

    expect(packageColumns.map((column) => column.name)).toEqual([
      "package_id", "schema_version", "revision", "document_json", "installed_at",
    ]);
    expect(attemptColumns.map((column) => column.name)).toEqual([
      "id", "package_id", "package_snapshot_json", "responses_json",
      "result_json", "started_at", "submitted_at",
    ]);
  });

  it("installs and upgrades validated packages by revision", async () => {
    await saveAssessmentPackage(database, { ...satPracticeAssessment, source: "agent" });
    await saveAssessmentPackage(database, {
      ...satPracticeAssessment,
      revision: 2,
      title: "Updated diagnostic",
      source: "agent",
    });
    const stored = await loadAssessmentPackages(database);
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ revision: 2, title: "Updated diagnostic" });
  });

  it("does not allow one revision to silently change meaning", async () => {
    await saveAssessmentPackage(database, satPracticeAssessment);
    await expect(saveAssessmentPackage(database, {
      ...satPracticeAssessment,
      title: "Different data",
    })).rejects.toThrow(/already exists with different data/);
  });

  it("stores immutable package, response, and result snapshots", async () => {
    const responses = { "rw-1": "b", "math-1": "6" };
    const result = gradeAssessment(satPracticeAssessment, responses);
    const submission = await saveAssessmentAttempt(database, {
      attemptId: "33333333-3333-4333-8333-333333333333",
      assessment: satPracticeAssessment,
      responses,
      result,
      startedAt: "2026-09-02T10:00:00.000Z",
      submittedAt: "2026-09-02T10:20:00.000Z",
    });

    await expect(readAssessmentAttempt(database, submission.attemptId)).resolves.toEqual({
      submission,
      evaluation: null,
    });
    await expect(readAssessmentHistory(database)).resolves.toEqual([
      expect.objectContaining({
        attemptId: submission.attemptId,
        rawScore: 2,
        maximumScore: 12,
      }),
    ]);
  });

  it("treats a repeated attempt ID as the same immutable submission", async () => {
    const input = {
      attemptId: "55555555-5555-4555-8555-555555555555",
      assessment: satPracticeAssessment,
      responses: { "rw-1": "b" },
      result: gradeAssessment(satPracticeAssessment, { "rw-1": "b" }),
      startedAt: "2026-09-02T10:00:00.000Z",
      submittedAt: "2026-09-02T10:20:00.000Z",
    };
    const first = await saveAssessmentAttempt(database, input);
    const retried = await saveAssessmentAttempt(database, {
      ...input,
      submittedAt: "2026-09-02T10:21:00.000Z",
    });

    expect(retried).toEqual(first);
    await expect(readAssessmentHistory(database)).resolves.toHaveLength(1);
  });

  it("keeps valid packages when one stored package is malformed", async () => {
    const onInvalidAssessment = vi.fn();
    await saveAssessmentPackage(database, satPracticeAssessment);
    await database.sql`
      INSERT INTO assessment_packages (
        package_id, schema_version, revision, document_json, installed_at
      ) VALUES (
        'invalid-package', 3, 1, '{"schemaVersion":1}',
        '2026-09-02T10:00:00.000Z'
      )
    `;

    await expect(loadAssessmentPackages(database, onInvalidAssessment)).resolves.toEqual([
      satPracticeAssessment,
    ]);
    expect(onInvalidAssessment).toHaveBeenCalledWith(
      expect.any(Error),
      { kind: "package", id: "invalid-package" },
    );
  });

  it("keeps valid history when one stored attempt is malformed", async () => {
    const onInvalidAssessment = vi.fn();
    const result = gradeAssessment(satPracticeAssessment, { "rw-1": "b" });
    const valid = await saveAssessmentAttempt(database, {
      attemptId: "44444444-4444-4444-8444-444444444444",
      assessment: satPracticeAssessment,
      responses: { "rw-1": "b" },
      result,
      startedAt: "2026-09-02T10:00:00.000Z",
      submittedAt: "2026-09-02T10:20:00.000Z",
    });
    await database.sql`
      INSERT INTO assessment_attempts (
        id, package_id, package_snapshot_json, responses_json,
        result_json, started_at, submitted_at
      ) VALUES (
        'invalid-attempt', 'invalid-package', '{"schemaVersion":1}',
        '{}', '{}', '2026-09-02T11:00:00.000Z', '2026-09-02T11:10:00.000Z'
      )
    `;

    await expect(readAssessmentHistory(database, 1, onInvalidAssessment)).resolves.toEqual([
      expect.objectContaining({ attemptId: valid.attemptId }),
    ]);
    expect(onInvalidAssessment).toHaveBeenCalledWith(
      expect.any(Error),
      { kind: "attempt", id: "invalid-attempt" },
    );
  });
});
