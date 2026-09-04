import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SQLocal } from 'sqlocal';
import { migrateDatabase } from './migrations';
import { createDraftRepository } from './draftRepository';
import { createIeltsRepository } from './ieltsRepository';
import { saveAssessmentAttempt, saveAssessmentPackage } from './assessmentRepository';
import { readHistoryPage } from './historyRepository';
import { saveDraftRecording, loadDraftRecordings } from './speakingDraftRepository';
import { getIeltsDrafts, initialSession, sessionReducer } from '@/domain/session';
import { initialAssessmentSession, assessmentSessionReducer } from '@/domain/assessmentSession';
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
    const restored = await createDraftRepository(db).loadIelts(createIeltsRepository(db));
    expect(restored.session.pausedDrafts[0]).toMatchObject({ attemptId: writingId, writingDrafts: { 1: 'Original saved draft.' } });
    expect(restored.documents.map(doc => doc.contentKey)).toEqual(expect.arrayContaining([readingDocument.contentKey, writingDocument.contentKey]));
    expect(await db.sql`SELECT id FROM practice_drafts`).toHaveLength(2);
    expect(await db.sql`SELECT * FROM practice_activity`).toHaveLength(0);
  });

  it('round-trips all five IELTS slots with their answers, positions and timers', async () => {
    let state = initialSession;
    for (const [index, section] of (['speaking', 'reading', 'writing', 'listening', 'listening'] as const).entries()) {
      state = sessionReducer(state, { type: 'START', mode: index === 4 ? 'full' : 'section', section, attemptId: crypto.randomUUID(), startedAt });
      if (section === 'speaking') state = sessionReducer(state, { type: 'SET_SPEAKING_PLAN', plan: defaultSpeakingPlan });
      if (section === 'reading') state = sessionReducer(state, { type: 'SET_ANSWER', section, questionId: 1, value: 'TRUE' });
      if (section === 'writing') state = sessionReducer(state, { type: 'SET_WRITING', task: 1, value: 'My saved essay.' });
      state = sessionReducer(state, { type: 'SET_PART', section, part: 2 });
      state = sessionReducer(state, { type: 'TICK', section });
    }
    await createDraftRepository(db).saveIelts(state, content);
    const restored = (await createDraftRepository(db).loadIelts(createIeltsRepository(db))).session;
    expect(getIeltsDrafts(restored)).toHaveLength(5);
    for (const draft of getIeltsDrafts(state)) {
      const resumed = sessionReducer(restored, { type: 'RESUME', targetAttemptId: draft.attemptId!, attemptId: crypto.randomUUID(), startedAt });
      expect(resumed).toMatchObject({ attemptId: draft.attemptId, answers: draft.answers,
        writingDrafts: draft.writingDrafts, partBySection: draft.partBySection, secondsRemaining: draft.secondsRemaining });
      expect(getIeltsDrafts(resumed)).toHaveLength(5);
    }
  });

  it('keeps a universal draft on its original revision after the catalog changes', async () => {
    const state = universal();
    await createDraftRepository(db).saveAssessment(state);
    await saveAssessmentPackage(db, { ...satPracticeAssessment, revision: 2, title: 'Changed title' });
    const restored = await createDraftRepository(db).loadAssessment();
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
    const restored = await createDraftRepository(db).loadIelts(createIeltsRepository(db));
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

  it('keeps invalid rows for recovery when valid drafts change', async () => {
    const repo = createDraftRepository(db);
    const invalidId = crypto.randomUUID();
    await db.sql`INSERT INTO practice_drafts VALUES (${invalidId}, 'ielts', 0, '{}', ${startedAt})`;
    await repo.loadIelts(createIeltsRepository(db));
    await repo.saveIelts(native(), content);
    expect(await db.sql`SELECT * FROM practice_drafts WHERE id = ${invalidId}`).toHaveLength(1);
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
    expect((await readHistoryPage(db, { kind: 'assessment', limit: 10, offset: 0 })).items).toEqual([]);
    expect(await db.sql`PRAGMA quick_check`).toEqual([{ quick_check: 'ok' }]);
  });

  it('upgrades audio-only Speaking rows from before migration 10 without dropping audio', async () => {
    await db.sql`DROP TABLE objective_explanations`;
    await db.sql`DELETE FROM app_schema_migrations WHERE version >= 10`;
    await db.sql`ALTER TABLE content_documents DROP COLUMN archived`;
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

  it('retires old custom assessments while preserving native drafts, submissions, audio and recovery bytes', async () => {
    const state = native('listening');
    await createDraftRepository(db).saveIelts(state, content);
    await db.sql`INSERT INTO draft_recordings VALUES (${state.attemptId}, 0, '{}', ${new Uint8Array([1, 2, 3])}, 'audio/wav')`;
    await db.sql`INSERT INTO attempts VALUES ('native', 'speaking', 'interview', 'submitted', ${startedAt}, ${startedAt})`;
    await db.sql`INSERT INTO speaking_responses VALUES ('native-recording', 'native', 1, 'Part 1', 0, 'Original question', 60, 1000, 'audio/wav', 3, ${new Uint8Array([4, 5, 6])}, 'Original transcript', 'answered')`;
    await db.sql`INSERT INTO listening_audio_chunks VALUES (${listeningDocument.contentKey}, 0, 1, 0, 'speech', 1000, 'audio/wav', 3, ${new Uint8Array([7, 8, 9])}, ${startedAt}, 'current')`;
    await db.sql`INSERT INTO storage_imports VALUES ('retained-native', 'saved native recovery data', 'unavailable', NULL, ${startedAt})`;
    const preservedTables = ['attempts', 'speaking_responses', 'content_documents', 'draft_recordings', 'listening_audio_chunks', 'storage_imports'];
    const preserved = await Promise.all(preservedTables.map(table => db.sql(`SELECT * FROM ${table}`)));
    const originalDrafts = await db.sql`SELECT * FROM practice_drafts`;

    await db.sql`DELETE FROM app_schema_migrations WHERE version = 14`;
    await db.sql`DROP TABLE assessment_packages`;
    await db.sql`CREATE TABLE assessment_packages (package_id TEXT PRIMARY KEY, schema_version INTEGER NOT NULL CHECK (schema_version = 3), revision INTEGER NOT NULL, document_json TEXT NOT NULL, installed_at TEXT NOT NULL)`;
    await db.sql`INSERT INTO assessment_packages VALUES ('old-custom', 3, 1, 'old package', ${startedAt})`;
    await db.sql`INSERT INTO assessment_attempts VALUES ('old-attempt', 'old-custom', 'old package', 'old answers', 'old result', ${startedAt}, ${startedAt})`;
    await db.sql`INSERT INTO assessment_evaluations VALUES ('old-attempt', 'old feedback', ${startedAt})`;
    await db.sql`INSERT INTO practice_drafts VALUES ('old-draft', 'assessment', 0, '{}', ${startedAt})`;
    await db.sql`INSERT INTO practice_activity (recorded_at, event_type, kind, package_id, revision, attempt_id) VALUES (${startedAt}, 'attempt_submitted', 'assessment', 'old-custom', 1, 'old-attempt')`;
    for (const table of ['assessment_evaluations', 'assessment_attempts', 'assessment_packages']) {
      await db.sql(`CREATE TABLE legacy_${table}_v8 (original TEXT)`);
    }

    await migrateDatabase(db);
    for (const [index, table] of preservedTables.entries()) expect(await db.sql(`SELECT * FROM ${table}`), table).toEqual(preserved[index]);
    expect(await db.sql`SELECT * FROM practice_drafts`).toEqual(originalDrafts);
    for (const table of ['assessment_packages', 'assessment_attempts', 'assessment_evaluations', 'practice_activity']) {
      expect(await db.sql(`SELECT * FROM ${table}`), table).toEqual([]);
    }
    expect(await db.sql`SELECT name FROM sqlite_master WHERE name LIKE 'legacy_assessment_%'`).toEqual([]);
    expect((await createDraftRepository(db).loadIelts(createIeltsRepository(db))).session.attemptId).toBe(state.attemptId);

    await saveAssessmentPackage(db, satPracticeAssessment);
    const current = universal();
    await createDraftRepository(db).saveAssessment(current);
    const submittedId = crypto.randomUUID();
    await saveAssessmentAttempt(db, { attemptId: submittedId, assessment: satPracticeAssessment,
      responses: {}, result: gradeAssessment(satPracticeAssessment, {}), startedAt, submittedAt: startedAt });
    await migrateDatabase(db);
    expect(await db.sql`SELECT schema_version FROM assessment_packages`).toEqual([{ schema_version: 4 }]);
    expect(await db.sql`SELECT id FROM assessment_attempts`).toEqual([{ id: submittedId }]);
    expect((await createDraftRepository(db).loadAssessment()).attemptId).toBe(current.attemptId);
    expect(await db.sql`PRAGMA foreign_key_check`).toEqual([]);
  });
  it('refuses to write a database from a newer application version', async () => {
    await db.sql`INSERT INTO app_schema_migrations VALUES (999, ${startedAt})`;
    await expect(migrateDatabase(db)).rejects.toThrow('newer app version');
    expect(await db.sql`SELECT * FROM app_schema_migrations WHERE version = 999`).toHaveLength(1);
  });
});
