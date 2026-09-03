import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SQLocal } from 'sqlocal';
import { migrateDatabase } from './migrations';
import { inspectBackup, restoreBackup } from './backupRepository';
import { createDraftRepository } from './draftRepository';
import { createIeltsRepository } from './ieltsRepository';
import { initialSession, sessionReducer } from '@/domain/session';
import { listeningDocument, readingDocument } from '@/content/objective';
import { writingDocument } from '@/content/writing';
import { saveAssessmentAttempt, saveAssessmentPackage } from './assessmentRepository';
import { satPracticeAssessment } from '@/content/sat';
import { gradeAssessment } from '@/domain/assessment';

let source: SQLocal;
let destination: SQLocal;
const now = '2026-09-03T01:00:00.000Z';
const content = { listening: listeningDocument, reading: readingDocument, writing: writingDocument };
async function database() {
  let connected!: () => void;
  const ready = new Promise<void>(resolve => { connected = resolve; });
  const db = new SQLocal({ databasePath: ':memory:', onInit: sql => [sql`PRAGMA foreign_keys = ON`], onConnect: connected });
  await ready; await migrateDatabase(db);
  return db;
}
beforeEach(async () => {
  vi.stubGlobal('Worker', class {});
  source = await database(); destination = await database();
});
afterEach(async () => { await source.destroy(true); await destination.destroy(true); vi.unstubAllGlobals(); });

describe('local backup replacement', () => {
  it('round-trips drafts, pinned content, raw recordings, submissions, feedback, audio and activity without merging', async () => {
    let draft = sessionReducer(initialSession, { type: 'START', section: 'writing', mode: 'section', attemptId: crypto.randomUUID(), startedAt: now });
    draft = sessionReducer(draft, { type: 'SET_WRITING', task: 1, value: 'My unfinished essay.' });
    await createDraftRepository(source).saveIelts(draft, content);
    await source.sql`INSERT INTO draft_recordings VALUES (${draft.attemptId}, 0, '{}', ${new Uint8Array([1, 2, 3])}, 'audio/wav')`;
    await saveAssessmentPackage(source, satPracticeAssessment);
    await saveAssessmentAttempt(source, { attemptId: crypto.randomUUID(), assessment: satPracticeAssessment, responses: {}, result: gradeAssessment(satPracticeAssessment, {}), startedAt: now, submittedAt: now });
    await source.sql`INSERT INTO attempts VALUES ('native', 'speaking', 'speaking-practice', 'evaluated', ${now}, ${now})`;
    await source.sql`INSERT INTO speaking_responses VALUES ('recording', 'native', 1, 'Part 1', 0, 'Original question', 60, 1000, 'audio/wav', 3, ${new Uint8Array([4, 5, 6])}, 'Original transcript', 'answered')`;
    await source.sql`INSERT INTO speaking_evaluations VALUES ('native', '{"feedback":"Keep practising"}', ${now})`;
    await source.sql`INSERT INTO storage_imports VALUES ('retained', '{broken legacy draft', 'unavailable', NULL, ${now})`;
    await destination.sql`INSERT INTO attempts VALUES ('not-in-backup', 'writing', 'old', 'submitted', ${now}, ${now})`;

    const summary = await inspectBackup(source, destination);
    expect(summary).toEqual({ practices: 2, drafts: 1, submissions: 2, recordings: 2 });
    const before = await source.getDatabaseFile();
    await restoreBackup(source, destination);
    const tables = await source.sql<{ name: string }>`SELECT name FROM sqlite_master WHERE type = 'table' AND name <> 'sqlite_sequence'`;
    for (const { name } of tables) expect(await destination.sql(`SELECT * FROM "${name}"`), name).toEqual(await source.sql(`SELECT * FROM "${name}"`));
    const restored = await createDraftRepository(destination).loadIelts(createIeltsRepository(destination), content);
    expect(restored.session.writingDrafts[1]).toBe('My unfinished essay.');
    expect(new Uint8Array(await (await source.getDatabaseFile()).arrayBuffer())).toEqual(new Uint8Array(await before.arrayBuffer()));
    // A restart after commit but before clearing the import intent is safe to retry.
    await restoreBackup(source, destination);
    expect(await destination.sql`SELECT id FROM attempts`).toEqual([{ id: 'native' }]);
  });

  it('preserves legacy tables as inert data without importing their SQL', async () => {
    await source.sql`CREATE TABLE legacy_assessment_packages_v8 (package_id TEXT PRIMARY KEY, document_json TEXT NOT NULL)`;
    await source.sql`INSERT INTO legacy_assessment_packages_v8 VALUES ('old', 'original legacy document')`;
    await destination.sql`CREATE TABLE legacy_assessment_packages_v8 (package_id TEXT PRIMARY KEY)`;
    await destination.sql`INSERT INTO legacy_assessment_packages_v8 VALUES ('replaced')`;
    await restoreBackup(source, destination);
    expect(await destination.sql`SELECT * FROM legacy_assessment_packages_v8`).toEqual([{ package_id: 'old', document_json: 'original legacy document' }]);
    await inspectBackup(destination, source);
  });

  it('rolls back every replacement if an insert fails', async () => {
    await source.sql`INSERT INTO attempts VALUES ('new', 'reading', 'new', 'submitted', ${now}, ${now})`;
    await destination.sql`INSERT INTO attempts VALUES ('keep-me', 'writing', 'original', 'submitted', ${now}, ${now})`;
    await destination.sql`CREATE TRIGGER fail_restore BEFORE INSERT ON attempts BEGIN SELECT RAISE(ABORT, 'injected quota failure'); END`;
    await expect(restoreBackup(source, destination)).rejects.toThrow('injected quota failure');
    expect(await destination.sql`SELECT id FROM attempts`).toEqual([{ id: 'keep-me' }]);
    expect(await destination.sql`SELECT version FROM app_schema_migrations`).toHaveLength(10);
  });

  it.each(['trigger', 'view', 'extra table', 'missing table', 'altered columns', 'future version', 'missing migration'])('rejects %s before changing current data', async kind => {
    await destination.sql`INSERT INTO attempts VALUES ('keep-me', 'writing', 'original', 'submitted', ${now}, ${now})`;
    if (kind === 'trigger') await source.sql`CREATE TRIGGER malicious AFTER INSERT ON attempts BEGIN DELETE FROM attempts; END`;
    if (kind === 'view') await source.sql`CREATE VIEW private_view AS SELECT * FROM attempts`;
    if (kind === 'extra table') await source.sql`CREATE TABLE unrelated (id TEXT)`;
    if (kind === 'missing table') await source.sql`DROP TABLE draft_recordings`;
    if (kind === 'altered columns') await source.sql`ALTER TABLE attempts ADD COLUMN surprise TEXT`;
    if (kind === 'future version') await source.sql`INSERT INTO app_schema_migrations VALUES (999, ${now})`;
    if (kind === 'missing migration') await source.sql`DELETE FROM app_schema_migrations WHERE version = 5`;
    await expect(restoreBackup(source, destination)).rejects.toThrow();
    expect(await destination.sql`SELECT id FROM attempts`).toEqual([{ id: 'keep-me' }]);
  });

  it('rejects broken foreign keys before replacement', async () => {
    await source.sql`PRAGMA foreign_keys = OFF`;
    await source.sql`INSERT INTO writing_submissions VALUES ('missing-parent', '{}')`;
    await expect(inspectBackup(source, destination)).rejects.toThrow('damaged or incomplete');
  });

  it('enforces application constraints even if the imported database omits them', async () => {
    await source.sql`PRAGMA ignore_check_constraints = ON`;
    await source.sql`INSERT INTO attempts VALUES ('bad', 'not-a-section', 'new', 'submitted', ${now}, ${now})`;
    await source.sql`PRAGMA ignore_check_constraints = OFF`;
    await expect(restoreBackup(source, destination)).rejects.toThrow();
    expect(await destination.sql`SELECT * FROM attempts`).toEqual([]);
  });
});
