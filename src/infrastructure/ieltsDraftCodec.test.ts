import { describe, expect, it, vi } from 'vitest';
import { writingDocument } from '@/content/writing';
import { initialSession, type IeltsAttemptState } from '@/domain/session';
import { defaultSpeakingPlan } from '@/domain/speakingPlan';
import type { WritingSubmission } from '@/domain/types';
import { attemptSnapshotSchema, restoreAttempt, snapshotAttempt } from './ieltsDraftCodec';

const attemptId = '22222222-2222-4222-8222-222222222222';
const submission: WritingSubmission = {
  attemptId,
  contentKey: writingDocument.contentKey,
  tasks: writingDocument.tasks.map(task => ({ task, response: 'Private submitted answer.', wordCount: 3 })) as WritingSubmission['tasks'],
  startedAt: '2026-09-02T10:00:00.000Z',
  submittedAt: '2026-09-02T11:00:00.000Z',
};
const state: IeltsAttemptState = {
  ...initialSession,
  attemptId,
  mode: 'full',
  view: 'transition',
  currentSection: 'writing',
  writingDrafts: { 1: 'Private submitted answer.', 2: 'Private submitted answer.' },
  writingSubmission: submission,
  completedSections: ['listening', 'reading', 'writing'],
};
const reader = {
  readObjectiveExplanations: async () => [],
  readLearningSummary: vi.fn(),
  readObjectiveAttempt: vi.fn(async () => null),
  readSpeakingAttempt: vi.fn(async () => null),
  readWritingAttempt: vi.fn(async () => ({ submission, evaluation: null })),
};

describe('IELTS draft codec', () => {
  it('stores submitted work by identity and reloads it from the repository', async () => {
    const snapshot = snapshotAttempt(state);
    expect(JSON.stringify(snapshot)).not.toContain('Private submitted answer');
    expect(snapshot.resultAttemptIds).toEqual({ writing: attemptId });
    expect(await restoreAttempt(attemptSnapshotSchema.parse(snapshot), reader)).toMatchObject({
      attemptId, view: 'transition', writingSubmission: submission, writingDrafts: { 1: '', 2: '' },
    });
  });

  it('keeps the exact Speaking plan and attempt identity', async () => {
    const plan = { ...defaultSpeakingPlan, contentKey: 'saved-interview', title: 'Saved interview' };
    const snapshot = snapshotAttempt({ ...initialSession, attemptId, mode: 'section', view: 'exam', currentSection: 'speaking', speakingPlan: plan });
    expect(await restoreAttempt(attemptSnapshotSchema.parse(snapshot), reader)).toMatchObject({ attemptId, speakingPlan: plan });
  });

  it('rejects a missing submission without replacing its reference', async () => {
    const snapshot = snapshotAttempt(state);
    await expect(restoreAttempt(snapshot, { ...reader, readWritingAttempt: async () => null })).rejects.toThrow('submission could not be found');
    expect(snapshot.resultAttemptIds.writing).toBe(attemptId);
  });

  it('requires the current snapshot shape without inventing an attempt identity', () => {
    const snapshot = snapshotAttempt(state);
    const { attemptId: _attemptId, ...missingIdentity } = snapshot.draft;
    expect(attemptSnapshotSchema.safeParse({ ...snapshot, draft: missingIdentity }).success).toBe(false);
    expect(attemptSnapshotSchema.safeParse(state).success).toBe(false);
  });
});
