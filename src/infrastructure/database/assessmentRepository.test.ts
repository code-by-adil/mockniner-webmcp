import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { SQLocal } from "sqlocal";
import { satPracticeAssessment } from "@/content/sat";
import { gradeAssessment } from "@/domain/assessment";
import { createAssessmentToolDefinitions } from '@/webmcp/assessmentTools';
import { migrateDatabase } from "./migrations";
import {
  deleteAssessmentPackage,
  loadAssessmentPackages,
  readAssessmentAttempt,
  saveAssessmentAttempt,
  saveAssessmentPackage,
} from "./assessmentRepository";
import { readHistoryPage } from './historyRepository';

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
  it('reads the visible older submission through WebMCP while latest remains explicit', async () => {
    const save = (attemptId: string, submittedAt: string) => saveAssessmentAttempt(database, {
      attemptId, assessment: satPracticeAssessment, responses: {}, result: gradeAssessment(satPracticeAssessment, {}),
      startedAt: '2026-09-01T09:00:00.000Z', submittedAt,
    });
    const older = await save('11111111-1111-4111-8111-111111111111', '2026-09-01T10:00:00.000Z');
    const newer = await save('22222222-2222-4222-8222-222222222222', '2026-09-02T10:00:00.000Z');
    const tool = createAssessmentToolDefinitions({ attachEvaluation: vi.fn(),
      readAssessmentAttempt: id => readAssessmentAttempt(database, id), getCurrentAttemptId: () => older.attemptId,
    })[0]!;
    const options = { signal: new AbortController().signal };
    await expect(tool.execute({}, options)).resolves.toMatchObject({ ok: true, data: { submission: { attemptId: older.attemptId }, selection: { isVisible: true } } });
    await expect(tool.execute({ latest: true }, options)).resolves.toMatchObject({ ok: true, data: { submission: { attemptId: newer.attemptId }, selection: { isVisible: false } } });
    await expect(tool.execute({ attemptId: '33333333-3333-4333-8333-333333333333' }, options)).resolves.toMatchObject({ ok: false, error: { code: 'ASSESSMENT_SUBMISSION_NOT_FOUND' } });
    expect((await readHistoryPage(database, { kind: 'assessment', limit: 10, offset: 0 })).items).toHaveLength(2);
  });
  it("creates only the canonical assessment columns", async () => {
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
    expect((await readHistoryPage(database, { kind: 'assessment', limit: 10, offset: 0 })).items).toEqual([
      expect.objectContaining({
        attemptId: submission.attemptId,
        rawScore: 2,
        maximumScore: 12,
      }),
    ]);
  });

  it("removes an installed package without removing its submitted history", async () => {
    const assessment = {
      ...satPracticeAssessment,
      packageId: "deletable-package",
      source: "agent" as const,
    };
    await saveAssessmentPackage(database, assessment);
    const submission = await saveAssessmentAttempt(database, {
      attemptId: "77777777-7777-4777-8777-777777777777",
      assessment,
      responses: { "rw-1": "b" },
      result: gradeAssessment(assessment, { "rw-1": "b" }),
      startedAt: "2026-09-02T10:00:00.000Z",
      submittedAt: "2026-09-02T10:20:00.000Z",
    });

    await deleteAssessmentPackage(database, assessment.packageId);

    await expect(loadAssessmentPackages(database)).resolves.toEqual([]);
    await expect(readAssessmentAttempt(database, submission.attemptId)).resolves.toEqual({
      submission,
      evaluation: null,
    });
    expect((await readHistoryPage(database, { kind: 'assessment', limit: 10, offset: 0 })).items).toEqual([
      expect.objectContaining({
        attemptId: submission.attemptId,
        packageId: assessment.packageId,
        title: assessment.title,
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
    expect((await readHistoryPage(database, { kind: 'assessment', limit: 10, offset: 0 })).items).toHaveLength(1);
  });

  it("keeps valid packages when one stored package is malformed", async () => {
    const onInvalidAssessment = vi.fn();
    await saveAssessmentPackage(database, satPracticeAssessment);
    await database.sql`
      INSERT INTO assessment_packages (
        package_id, schema_version, revision, document_json, installed_at
      ) VALUES (
        'invalid-package', 4, 1, '{"schemaVersion":1}',
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

    const first = await readHistoryPage(database, { kind: 'assessment', limit: 1, offset: 0 });
    expect(first.items).toEqual([]);
    expect(first.unavailable).toEqual([expect.objectContaining({ attemptId: 'invalid-attempt' })]);
    expect(first.nextOffset).toBe(1);
    expect((await readHistoryPage(database, { kind: 'assessment', limit: 1, offset: first.nextOffset! })).items).toEqual([
      expect.objectContaining({ attemptId: valid.attemptId }),
    ]);
  });
});
