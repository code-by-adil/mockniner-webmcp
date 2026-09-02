import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SQLocal } from 'sqlocal';
import { migrateDatabase } from './migrations';
import { createDraftRepository } from './draftRepository';
import { createIeltsRepository } from './ieltsRepository';
import { saveAssessmentAttempt, saveAssessmentPackage, readAssessmentHistory } from './assessmentRepository';
import { readHistoryPage } from './historyRepository';
import { saveDraftRecording, loadDraftRecordings } from './speakingDraftRepository';
import { initialSession, sessionReducer } from '@/domain/session';
import { initialAssessmentSession, assessmentSessionReducer } from '@/domain/assessmentSession';
import { ASSESSMENT_SESSION_STORAGE_KEY } from '../assessmentSessionStorage';
import { STORAGE_KEY, snapshotAttempt } from '../ieltsSessionStorage';
import { listeningDocument, readingDocument } from '@/content/objective';
import { writingDocument } from '@/content/writing';
import { satPracticeAssessment } from '@/content/sat';
import { defaultSpeakingPlan, speakingQuestionText } from '@/domain/speakingPlan';
import { gradeAssessment } from '@/domain/assessment';
import { gradeObjectiveDocument } from '@/domain/objectiveScoring';

let db: SQLocal;
const content = { listening: listeningDocument, reading: readingDocument, writing: writingDocument };
const startedAt = '2026-09-03T00:00:00.000Z';
const native = (section: 'listening' | 'reading' | 'writing' | 'speaking' = 'reading', mode: 'full' | 'section' = 'section') => sessionReducer(initialSession, { type: 'START', section, mode, attemptId: crypto.randomUUID(), startedAt });
const universal = () => assessmentSessionReducer(initialAssessmentSession, { type: 'START', assessment: satPracticeAssessment, attemptId: crypto.randomUUID(), startedAt, nowMs: Date.parse(startedAt) });
beforeEach(async () => {
  vi.stubGlobal('Worker', class {});
  let connected!: () => void;
  const ready = new Promise<void>(resolve => { connected = resolve; });
  db = new SQLocal({ databasePath: ':memory:', onInit: sql => [sql`PRAGMA foreign_keys = ON`], onConnect: connected });
  await ready; await migrateDatabase(db);
});
afterEach(async () => { await db.destroy(true); vi.unstubAllGlobals(); });

describe('durable practice drafts', () => {
  it('pins built-in content and restores independent native slots without localStorage', async () => {
    const repo = createDraftRepository(db);
    let state = native('writing');
    state = sessionReducer(state, { type: 'SET_WRITING', task: 1, value: 'Original saved draft.' });
    const writingId = state.attemptId;
    state = sessionReducer(state, { type: 'START', section: 'reading', mode: 'section', attemptId: crypto.randomUUID(), startedAt });
    await repo.saveIelts(state, content);
    const restored = await createDraftRepository(db).loadIelts(createIeltsRepository(db), content);
    expect(restored.session.pausedDrafts[0]).toMatchObject({ attemptId: writingId, writingDrafts: { 1: 'Original saved draft.' } });
    expect(restored.documents.map(doc => doc.contentKey)).toEqual(expect.arrayContaining([readingDocument.contentKey, writingDocument.contentKey]));
    expect(await db.sql`SELECT id FROM practice_drafts`).toHaveLength(2);
    expect(await db.sql`SELECT * FROM practice_activity`).toHaveLength(0);
  });

  it('keeps a universal draft on its original revision after the catalog changes', async () => {
    const state = universal();
    await createDraftRepository(db).saveAssessment(state);
    await saveAssessmentPackage(db, { ...satPracticeAssessment, revision: 2, title: 'Changed title' });
    const restored = await createDraftRepository(db).loadAssessment([{ ...satPracticeAssessment, revision: 2 }]);
    expect(restored.packageSnapshot).toEqual(satPracticeAssessment);
    const resumed = assessmentSessionReducer(restored, { type: 'RESUME', assessment: { ...satPracticeAssessment, revision: 2 }, nowMs: Date.parse(startedAt) });
    expect(resumed.packageSnapshot?.revision).toBe(1);
  });

  it('atomically submits and prevents an old autosave from resurrecting the attempt', async () => {
    const repo = createDraftRepository(db);
    const state = native();
    await repo.saveIelts(state, content);
    await createIeltsRepository(db).saveObjectiveAttempt({ attemptId: state.attemptId!, section: 'reading', contentKey: readingDocument.contentKey,
      answers: {}, result: gradeObjectiveDocument(readingDocument, {}), startedAt, submittedAt: startedAt });
    expect(await db.sql`SELECT * FROM practice_drafts`).toHaveLength(0);
    await repo.saveIelts(state, content);
    expect(await db.sql`SELECT * FROM practice_drafts`).toHaveLength(0);
    const assessment = universal();
    await repo.saveAssessment(assessment);
    await saveAssessmentAttempt(db, { attemptId: assessment.attemptId!, assessment: satPracticeAssessment, responses: {}, result: gradeAssessment(satPracticeAssessment, {}), startedAt, submittedAt: startedAt });
    await repo.saveAssessment(assessment);
    expect(await db.sql`SELECT * FROM practice_drafts`).toHaveLength(0);
  });

  it('retains the rest of a full IELTS run in the submission transaction', async () => {
    const repo = createDraftRepository(db);
    const state = native('listening', 'full');
    await repo.saveIelts(state, content);
    await createIeltsRepository(db).saveObjectiveAttempt({ attemptId: state.attemptId!, section: 'listening', contentKey: listeningDocument.contentKey,
      answers: {}, result: gradeObjectiveDocument(listeningDocument, {}), startedAt, submittedAt: startedAt });
    const restored = await createDraftRepository(db).loadIelts(createIeltsRepository(db), content);
    expect(restored.session.completedSections).toEqual(['listening']);
    expect(restored.session.objectiveSubmissions.listening?.attemptId).toBe(state.attemptId);
    const resumed = sessionReducer(restored.session, { type: 'RESUME', attemptId: crypto.randomUUID(), startedAt });
    expect(resumed.currentSection).toBe('reading');
    expect(resumed.attemptId).not.toBe(state.attemptId);
    expect(restored.session.speakingPlan).toEqual(defaultSpeakingPlan);
    expect(await db.sql`SELECT * FROM practice_drafts`).toHaveLength(1);
  });

  it('rolls back submission and draft retirement together when a write fails', async () => {
    const state = native();
    await createDraftRepository(db).saveIelts(state, content);
    await db.sql`CREATE TRIGGER fail_activity BEFORE INSERT ON practice_activity BEGIN SELECT RAISE(ABORT, 'injected storage failure'); END`;
    await expect(createIeltsRepository(db).saveObjectiveAttempt({ attemptId: state.attemptId!, section: 'reading', contentKey: readingDocument.contentKey,
      answers: {}, result: gradeObjectiveDocument(readingDocument, {}), startedAt, submittedAt: startedAt })).rejects.toThrow();
    expect(await db.sql`SELECT * FROM attempts`).toHaveLength(0);
    expect(await db.sql`SELECT * FROM practice_drafts`).toHaveLength(1);
  });

  it('archives invalid legacy bytes and keeps invalid rows when valid drafts change', async () => {
    const raw = '{a broken draft with private work';
    const storage = { getItem: (key: string) => key === ASSESSMENT_SESSION_STORAGE_KEY ? raw : null, removeItem: vi.fn() };
    const repo = createDraftRepository(db, storage);
    expect(await repo.loadAssessment([satPracticeAssessment])).toEqual(initialAssessmentSession);
    expect(storage.removeItem).not.toHaveBeenCalled();
    expect(await db.sql`SELECT raw_value, status FROM storage_imports`).toEqual([{ raw_value: raw, status: 'unavailable' }]);
    const invalidId = crypto.randomUUID();
    await db.sql`INSERT INTO practice_drafts VALUES (${invalidId}, 'ielts', 0, '{}', ${startedAt})`;
    await repo.loadIelts(createIeltsRepository(db), content);
    await repo.saveIelts(native(), content);
    expect(await db.sql`SELECT * FROM practice_drafts WHERE id = ${invalidId}`).toHaveLength(1);
    expect(repo.issues).toHaveLength(2);
  });

  it('imports valid legacy drafts once, retaining an exportable copy', async () => {
    const state = native('writing');
    const raw = JSON.stringify({ version: 2, ...snapshotAttempt(state), pausedDrafts: [] });
    const values = new Map([[STORAGE_KEY, raw]]);
    const storage = { getItem: (key: string) => values.get(key) ?? null, removeItem: (key: string) => { values.delete(key); } };
    const repo = createDraftRepository(db, storage);
    const simultaneous = await Promise.all([repo.loadIelts(createIeltsRepository(db), content), repo.loadIelts(createIeltsRepository(db), content)]);
    expect(simultaneous.every(result => result.session.attemptId === state.attemptId)).toBe(true);
    expect(repo.issues).toEqual([]);
    expect(values.size).toBe(0);
    expect(await db.sql`SELECT raw_value, status FROM storage_imports`).toEqual([{ raw_value: raw, status: 'imported' }]);
    expect((await repo.loadIelts(createIeltsRepository(db), content)).session.attemptId).toBe(state.attemptId);
    expect(await db.sql`SELECT * FROM practice_drafts`).toHaveLength(1);
    values.set(STORAGE_KEY, 'different legacy draft from an older app');
    await repo.loadIelts(createIeltsRepository(db), content);
    expect(values.get(STORAGE_KEY)).toBe('different legacy draft from an older app');
    expect(await db.sql`SELECT * FROM storage_imports`).toHaveLength(2);
  });

  it('persists raw Speaking audio before transcription and keeps it private until submission', async () => {
    const state = { ...native('speaking'), speakingPlan: defaultSpeakingPlan };
    await createDraftRepository(db).saveIelts(state, content);
    const question = defaultSpeakingPlan.questions[0]!;
    const recording = { promptId: question.id, partLabel: 'Part 1', sequence: 0, promptText: speakingQuestionText(question), timeLimitSeconds: question.responseSeconds,
      durationMs: 1200, transcript: '', status: 'answered' as const, audio: new Blob(['raw recording bytes'], { type: 'audio/webm' }) };
    await saveDraftRecording(db, state.attemptId!, recording);
    let restored = await loadDraftRecordings(db, state.attemptId!);
    expect(await restored[0]!.audio!.text()).toBe('raw recording bytes');
    expect(restored[0]!.transcript).toBe('');
    expect(await createIeltsRepository(db).readSpeakingAttempt(state.attemptId!)).toBeNull();
    await saveDraftRecording(db, state.attemptId!, { ...restored[0]!, transcript: 'Now transcribed.' });
    restored = await loadDraftRecordings(db, state.attemptId!);
    expect(restored[0]!.transcript).toBe('Now transcribed.');
    await createIeltsRepository(db).saveSpeakingAttempt({ attemptId: state.attemptId!, contentKey: defaultSpeakingPlan.contentKey, startedAt, submittedAt: startedAt, recordings: restored });
    expect(await db.sql`SELECT * FROM draft_recordings`).toHaveLength(0);
    expect((await createIeltsRepository(db).readSpeakingAttempt(state.attemptId!))?.submission.responses[0]?.transcript).toBe('Now transcribed.');
  });

  it('isolates malformed history rows for both UI summaries and tool paging', async () => {
    const validId = crypto.randomUUID();
    await createIeltsRepository(db).saveObjectiveAttempt({ attemptId: validId, section: 'reading', contentKey: readingDocument.contentKey,
      answers: {}, result: gradeObjectiveDocument(readingDocument, {}), startedAt, submittedAt: startedAt });
    const badId = crypto.randomUUID();
    await db.sql`INSERT INTO attempts VALUES (${badId}, 'reading', 'broken', 'submitted', ${startedAt}, ${startedAt})`;
    await db.sql`INSERT INTO objective_submissions VALUES (${badId}, '{}', 'private broken result')`;
    const page = await readHistoryPage(db, { limit: 10, offset: 0 });
    expect(page.items.map(row => row.attemptId)).toEqual([validId]);
    expect(page.unavailable[0]?.attemptId).toBe(badId);
    expect(JSON.stringify(page)).not.toContain('private broken');
    expect((await createIeltsRepository(db).readLearningSummary(5)).sections.reading.recent).toHaveLength(1);
    const assessment = universal();
    await saveAssessmentAttempt(db, { attemptId: assessment.attemptId!, assessment: satPracticeAssessment, responses: {}, result: gradeAssessment(satPracticeAssessment, {}), startedAt, submittedAt: startedAt });
    await db.sql`UPDATE assessment_attempts SET result_json = 'bad' WHERE id = ${assessment.attemptId}`;
    expect(await readAssessmentHistory(db)).toEqual([]);
    expect(await db.sql`PRAGMA quick_check`).toEqual([{ quick_check: 'ok' }]);
  });

  it('upgrades audio-only Speaking rows from before migration 10 without dropping audio', async () => {
    await db.sql`DELETE FROM app_schema_migrations WHERE version >= 10`;
    await db.sql`DROP TABLE draft_recordings`; await db.sql`DROP TABLE practice_drafts`; await db.sql`DROP TABLE storage_imports`; await db.sql`DROP TABLE practice_activity`;
    await db.sql`DROP TABLE speaking_responses`;
    await db.sql`CREATE TABLE speaking_responses (id TEXT PRIMARY KEY, attempt_id TEXT, prompt_id INTEGER, part_label TEXT, sequence INTEGER, prompt_text TEXT,
      time_limit_seconds INTEGER, duration_ms INTEGER, mime_type TEXT, byte_length INTEGER, audio BLOB, transcript TEXT NOT NULL DEFAULT '')`;
    const id = crypto.randomUUID();
    await db.sql`INSERT INTO attempts VALUES (${id}, 'speaking', 'legacy', 'submitted', ${startedAt}, ${startedAt})`;
    await db.sql`INSERT INTO speaking_responses VALUES ('legacy-recording', ${id}, 1, 'Part 1', 0, 'Question', 60, 1000, 'audio/webm', 3, ${new Uint8Array([1,2,3])}, '')`;
    await migrateDatabase(db); await migrateDatabase(db);
    expect(await db.sql`SELECT byte_length, transcript, response_status FROM speaking_responses`).toEqual([{ byte_length: 3, transcript: '', response_status: 'answered' }]);
    const audio = await db.sql<{ audio: Uint8Array }>`SELECT audio FROM speaking_responses`;
    expect(Array.from(audio[0]!.audio)).toEqual([1, 2, 3]);
    expect(await db.sql`PRAGMA foreign_key_check`).toEqual([]);
  });

  it('archives pre-v9 universal tables instead of deleting their data', async () => {
    await db.sql`DELETE FROM app_schema_migrations WHERE version = 9`;
    await db.sql`INSERT INTO assessment_packages VALUES ('legacy-id', 3, 1, 'legacy unconvertible bytes', ${startedAt})`;
    const id = crypto.randomUUID();
    await db.sql`INSERT INTO assessment_attempts VALUES (${id}, 'legacy-id', 'old package', 'old answers', 'old result', ${startedAt}, ${startedAt})`;
    await db.sql`INSERT INTO assessment_evaluations VALUES (${id}, 'old feedback', ${startedAt})`;
    await migrateDatabase(db);
    expect(await db.sql`SELECT document_json FROM legacy_assessment_packages_v8`).toEqual([{ document_json: 'legacy unconvertible bytes' }]);
    expect(await db.sql`SELECT * FROM assessment_packages`).toHaveLength(0);
    expect(await db.sql`SELECT id, responses_json FROM legacy_assessment_attempts_v8`).toEqual([{ id, responses_json: 'old answers' }]);
    expect(await db.sql`SELECT attempt_id, evaluation_json FROM legacy_assessment_evaluations_v8`).toEqual([{ attempt_id: id, evaluation_json: 'old feedback' }]);
    expect(await db.sql`PRAGMA foreign_key_check`).toEqual([]);
  });
  it('refuses to write a database from a newer application version', async () => {
    await db.sql`INSERT INTO app_schema_migrations VALUES (999, ${startedAt})`;
    await expect(migrateDatabase(db)).rejects.toThrow('newer app version');
    expect(await db.sql`SELECT * FROM app_schema_migrations WHERE version = 999`).toHaveLength(1);
  });
});
