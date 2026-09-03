// @vitest-environment happy-dom
import { act, StrictMode, useLayoutEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { SQLocal } from 'sqlocal';
import { listeningDocument, readingDocument } from '@/content/objective';
import { writingDocument } from '@/content/writing';
import { satPracticeAssessment } from '@/content/sat';
import { assessmentSessionReducer, initialAssessmentSession, type AssessmentSession } from '@/domain/assessmentSession';
import { gradeAssessment } from '@/domain/assessment';
import { initialSession, sessionReducer, type IeltsSession } from '@/domain/session';
import { gradeObjectiveDocument } from '@/domain/objectiveScoring';
import { saveObjectiveAttempt, saveWritingAttempt } from '@/infrastructure/database/attemptRepository';
import { saveAssessmentAttempt } from '@/infrastructure/database/assessmentRepository';
import * as historyRepository from '@/infrastructure/database/historyRepository';
import * as databaseClient from '@/infrastructure/database/client';
import { migrateDatabase } from '@/infrastructure/database/migrations';
import { getPracticeHistoryRevision, usePracticeHistory, type PracticeHistory } from './usePracticeHistory';

let database: SQLocal;
let root: Root;
let latest: PracticeHistory;
const startedAt = '2026-09-01T10:00:00.000Z';
let reads: MockInstance<typeof historyRepository.readHistoryPage>;

function Harness({ native, assessment = initialAssessmentSession }: { native: IeltsSession; assessment?: AssessmentSession }) {
  const history = usePracticeHistory(getPracticeHistoryRevision(native, assessment));
  useLayoutEffect(() => { latest = history; });
  return <p>{history.status}</p>;
}
async function finishReads() {
  await act(async () => {
    await vi.dynamicImportSettled();
    await Promise.all(reads.mock.results.map(result => result.value));
  });
}

beforeEach(async () => {
  vi.stubGlobal('Worker', class {});
  vi.stubGlobal('navigator', {});
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  let connected!: () => void;
  const ready = new Promise<void>(resolve => { connected = resolve; });
  database = new SQLocal({ databasePath: ':memory:', onInit: sql => [sql`PRAGMA foreign_keys = ON`], onConnect: connected });
  await ready;
  await migrateDatabase(database);
  vi.spyOn(databaseClient, 'getLocalDatabase').mockResolvedValue(database);
  root = createRoot(document.createElement('div'));
  reads = vi.spyOn(historyRepository, 'readHistoryPage');
});
afterEach(async () => {
  await act(async () => root.unmount());
  await database.destroy(true);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('home history reader', () => {
  it('returns to the newest page when a delayed submission finishes while home remains open', async () => {
    for (let day = 1; day <= 7; day++) {
      await saveObjectiveAttempt(database, { attemptId: crypto.randomUUID(), section: 'reading', contentKey: readingDocument.contentKey,
        answers: {}, result: gradeObjectiveDocument(readingDocument, {}), startedAt, submittedAt: `2026-09-0${day}T11:00:00.000Z` });
    }
    let native = sessionReducer(initialSession, { type: 'START', mode: 'section', section: 'writing', attemptId: crypto.randomUUID(), startedAt });
    native = sessionReducer(native, { type: 'GO_HOME' });
    await act(async () => root.render(<StrictMode><Harness native={native} /></StrictMode>));
    await finishReads();
    expect(latest.status).toBe('ready');
    await act(async () => latest.next());
    await finishReads();
    expect(latest).toMatchObject({ status: 'ready', pageNumber: 2, page: { items: [expect.objectContaining({ kind: 'reading' })], nextOffset: null } });

    let complete!: () => void;
    const pending = new Promise<void>(resolve => { complete = resolve; }).then(() => saveWritingAttempt(database, {
      attemptId: native.attemptId!, contentKey: writingDocument.contentKey, startedAt, submittedAt: '2026-09-08T11:00:00.000Z',
      tasks: [
        { task: writingDocument.tasks[0], response: 'Saved first response.', wordCount: 3 },
        { task: writingDocument.tasks[1], response: 'Saved second response.', wordCount: 3 },
      ],
    }));
    complete();
    const submission = await pending;
    native = sessionReducer(native, { type: 'COMPLETE_WRITING', submission });
    expect(native.view).toBe('home');
    await act(async () => root.render(<StrictMode><Harness native={native} /></StrictMode>));
    await finishReads();
    expect(latest).toMatchObject({ status: 'ready', pageNumber: 1, hasPrevious: false });
    if (latest.status !== 'ready') throw new Error('History did not finish loading.');
    expect(latest.page.items[0]).toMatchObject({ attemptId: submission.attemptId, kind: 'writing', evaluationStatus: 'awaiting_evaluation' });
    expect(latest.page.items).toHaveLength(6);
    expect(reads).toHaveBeenLastCalledWith(database, { limit: 6, offset: 0 });
  });

  it('invalidates parked submission retirement but not answer edits or timer ticks', () => {
    const writing = sessionReducer(initialSession, { type: 'START', mode: 'section', section: 'writing', attemptId: crypto.randomUUID(), startedAt });
    const revision = getPracticeHistoryRevision(writing, initialAssessmentSession);
    const edited = sessionReducer(writing, { type: 'SET_WRITING', task: 1, value: 'New draft text' });
    const ticked = sessionReducer(edited, { type: 'TICK', section: 'writing' });
    expect(getPracticeHistoryRevision(ticked, initialAssessmentSession)).toBe(revision);
    const switched = sessionReducer(ticked, { type: 'START', mode: 'section', section: 'reading', attemptId: crypto.randomUUID(), startedAt });
    const home = sessionReducer(switched, { type: 'GO_HOME' });
    expect(getPracticeHistoryRevision({ ...home, pausedDrafts: [] }, initialAssessmentSession))
      .not.toBe(getPracticeHistoryRevision(home, initialAssessmentSession));
  });

  it('refreshes when a delayed custom submission retires its draft after returning home', async () => {
    let assessment = assessmentSessionReducer(initialAssessmentSession, { type: 'START', assessment: satPracticeAssessment,
      attemptId: crypto.randomUUID(), startedAt, nowMs: Date.parse(startedAt) });
    const attemptId = assessment.attemptId!;
    let complete!: () => void;
    const pending = new Promise<void>(resolve => { complete = resolve; }).then(() => saveAssessmentAttempt(database, {
      attemptId, assessment: satPracticeAssessment, responses: {}, result: gradeAssessment(satPracticeAssessment, {}),
      startedAt, submittedAt: '2026-09-01T11:00:00.000Z',
    }));
    assessment = assessmentSessionReducer(assessment, { type: 'GO_HOME' });
    await act(async () => root.render(<StrictMode><Harness native={initialSession} assessment={assessment} /></StrictMode>));
    await finishReads();
    expect(latest).toMatchObject({ status: 'ready', page: { items: [] } });
    const readCount = reads.mock.calls.length;

    complete();
    const submission = await pending;
    assessment = assessmentSessionReducer(assessment, { type: 'COMPLETE', submission });
    expect(assessment).toMatchObject({ view: 'home', attemptId: null });
    expect(assessment.submission).toBeUndefined();
    await act(async () => root.render(<StrictMode><Harness native={initialSession} assessment={assessment} /></StrictMode>));
    await finishReads();
    expect(reads).toHaveBeenCalledTimes(readCount + 1);
    expect(latest).toMatchObject({ status: 'ready', page: { items: [expect.objectContaining({ attemptId, kind: 'assessment' })] } });
  });

  it('invalidates a completed section while the rest of a parked full test stays resumable', () => {
    const full = sessionReducer(initialSession, { type: 'START', mode: 'full', section: 'listening', attemptId: crypto.randomUUID(), startedAt });
    const current = sessionReducer(full, { type: 'START', mode: 'section', section: 'writing', attemptId: crypto.randomUUID(), startedAt });
    const home = sessionReducer(current, { type: 'GO_HOME' });
    const submitted = sessionReducer(home, { type: 'COMPLETE_OBJECTIVE', submission: {
      attemptId: full.attemptId!, section: 'listening', contentKey: listeningDocument.contentKey,
      answers: {}, result: gradeObjectiveDocument(listeningDocument, {}), startedAt, submittedAt: '2026-09-01T11:00:00.000Z',
    } });
    expect(submitted.pausedDrafts).toHaveLength(1);
    expect(submitted.pausedDrafts[0]?.completedSections).toEqual(['listening']);
    expect(getPracticeHistoryRevision(submitted, initialAssessmentSession))
      .not.toBe(getPracticeHistoryRevision(home, initialAssessmentSession));
  });

  it('ignores an older read that resolves after newer saved history', async () => {
    let release!: () => void;
    const waiting = new Promise<void>(resolve => { release = resolve; });
    reads.mockImplementationOnce(async () => {
      await waiting;
      return { items: [], unavailable: [], nextOffset: null };
    });
    await act(async () => root.render(<Harness native={initialSession} />));
    await act(async () => { await vi.dynamicImportSettled(); });
    expect(latest.status).toBe('loading');
    const submission = await saveObjectiveAttempt(database, { attemptId: crypto.randomUUID(), section: 'reading', contentKey: readingDocument.contentKey,
      answers: {}, result: gradeObjectiveDocument(readingDocument, {}), startedAt, submittedAt: '2026-09-01T11:00:00.000Z' });
    await act(async () => root.render(<Harness native={{ ...initialSession, objectiveSubmissions: { reading: submission } }} />));
    await act(async () => {
      await vi.dynamicImportSettled();
      await reads.mock.results.at(-1)?.value;
    });
    expect(latest).toMatchObject({ status: 'ready', page: { items: [expect.objectContaining({ attemptId: submission.attemptId })] } });
    release();
    await finishReads();
    expect(latest).toMatchObject({ status: 'ready', page: { items: [expect.objectContaining({ attemptId: submission.attemptId })] } });
  });
});
