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

  it("keeps valid packages when one stored package is malformed", async () => {
    const onInvalidAssessment = vi.fn();
    await saveAssessmentPackage(database, satPracticeAssessment);
    await database.sql`
      INSERT INTO assessment_packages (
        package_id, profile_id, schema_version, revision, document_json, installed_at
      ) VALUES (
        'legacy-package', 'universal', 1, 1, '{"schemaVersion":1}',
        '2026-09-02T10:00:00.000Z'
      )
    `;

    await expect(loadAssessmentPackages(database, onInvalidAssessment)).resolves.toEqual([
      satPracticeAssessment,
    ]);
    expect(onInvalidAssessment).toHaveBeenCalledWith(
      expect.any(Error),
      { kind: "package", id: "legacy-package" },
    );
  });

  it("keeps valid history when one stored attempt is malformed", async () => {
    const onInvalidAssessment = vi.fn();
    const result = gradeAssessment(satPracticeAssessment, { "rw-1": "b" });
    const valid = await saveAssessmentAttempt(database, {
      assessment: satPracticeAssessment,
      responses: { "rw-1": "b" },
      result,
      startedAt: "2026-09-02T10:00:00.000Z",
      submittedAt: "2026-09-02T10:20:00.000Z",
    });
    await database.sql`
      INSERT INTO assessment_attempts (
        id, package_id, profile_id, package_snapshot_json, responses_json,
        result_json, started_at, submitted_at
      ) VALUES (
        'legacy-attempt', 'legacy-package', 'universal', '{"schemaVersion":1}',
        '{}', '{}', '2026-09-02T11:00:00.000Z', '2026-09-02T11:10:00.000Z'
      )
    `;

    await expect(readAssessmentHistory(database, 1, onInvalidAssessment)).resolves.toEqual([
      expect.objectContaining({ attemptId: valid.attemptId }),
    ]);
    expect(onInvalidAssessment).toHaveBeenCalledWith(
      expect.any(Error),
      { kind: "attempt", id: "legacy-attempt" },
    );
  });
});
