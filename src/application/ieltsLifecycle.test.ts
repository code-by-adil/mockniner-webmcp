import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SQLocal } from 'sqlocal';
import { migrateDatabase } from '@/infrastructure/database/migrations';
import { createContentStore } from '@/infrastructure/database/contentRepository';
import { createDraftRepository } from '@/infrastructure/database/draftRepository';
import { createIeltsRepository } from '@/infrastructure/database/ieltsRepository';
import { listListeningAudioChunks, saveListeningAudioChunk } from '@/infrastructure/database/listeningAudioRepository';
import { listeningDocument, readingDocument } from '@/content/objective';
import { writingDocument } from '@/content/writing';
import { getIeltsDrafts, initialSession, sessionReducer, type IeltsSession } from '@/domain/session';
import { createIeltsCommands } from './ieltsCommands';

let db: SQLocal;
const bundled = { listening: listeningDocument, reading: readingDocument, writing: writingDocument };
beforeEach(async () => {
  vi.stubGlobal('Worker', class {});
  let connected!: () => void;
  const ready = new Promise<void>(resolve => { connected = resolve; });
  db = new SQLocal({ databasePath: ':memory:', onInit: sql => [sql`PRAGMA foreign_keys = ON`], onConnect: connected });
  await ready; await migrateDatabase(db);
});
afterEach(async () => { await db.destroy(true); vi.unstubAllGlobals(); });
function harness(initial = initialSession) {
  let state: IeltsSession = initial;
  let content = bundled;
  const store = createContentStore(db, undefined, Object.values(bundled));
  const drafts = createDraftRepository(db);
  const repository = createIeltsRepository(db);
  const commands = createIeltsCommands({ getState: () => state, getContent: () => content,
    dispatch: action => { state = sessionReducer(state, action); },
    publishSession: (next, documents) => { state = next; if (documents) content = documents; },
    persistSession: (next, documents, removed) => drafts.saveIelts(next, documents ?? content, removed),
    setContent: documents => { content = documents; }, getContentStore: async () => store, getRepository: async () => repository });
  return { commands, store, drafts, repository, state: () => state, content: () => content };
}
const audio = (contentKey: string) => saveListeningAudioChunk(db, { contentKey, cacheVersion: 'test', sequence: 0, partId: 1, segmentIndex: 0, kind: 'silence', durationMs: 1000 });

describe('saved IELTS test lifecycle', () => {
  it('reloads three same-section attempts and restores each original set, answers, timer and playback', async () => {
    const h = harness();
    const ids: string[] = [];
    for (let index = 0; index < 3; index++) {
      await h.commands.installContent({ ...listeningDocument, contentKey: `listening-${index}`, name: `Test ${index}`, source: 'agent' });
      await h.commands.start('section', 'listening');
      ids.push(h.state().attemptId!);
      h.commands.setObjectiveAnswer('listening', 1, `response-${index}`);
      h.commands.setPart('listening', index + 1);
      h.commands.setListeningPlayback({ currentTimeSec: 15 + index, volume: 0.6 });
      h.commands.tick('listening');
      await h.commands.goHome();
      await audio(`listening-${index}`);
    }
    const restored = await createDraftRepository(db).loadIelts(h.repository);
    expect(getIeltsDrafts(restored.session)).toHaveLength(3);
    const fresh = harness(restored.session);
    await fresh.drafts.loadIelts(fresh.repository);
    for (const [index, id] of ids.entries()) {
      await fresh.commands.goHome(); await fresh.commands.resume(id);
      expect(fresh.content().listening.contentKey).toBe(`listening-${index}`);
      expect(fresh.state()).toMatchObject({ attemptId: id, answers: { listening: { 1: `response-${index}` } }, partBySection: { listening: index + 1 }, secondsRemaining: { listening: 1799 }, listeningPlayback: { currentTimeSec: 15 + index, volume: 0.6 } });
      expect(await listListeningAudioChunks(db, `listening-${index}`)).toHaveLength(1);
    }
  });
  it('deletes a saved set and its drafts atomically while preserving other tests, audio and submitted reviews', async () => {
    const h = harness();
    await h.commands.installContent({ ...listeningDocument, contentKey: 'delete-me', source: 'agent' });
    await h.commands.start('section', 'listening');
    const submission = await h.commands.submitObjective('listening');
    await h.commands.start('full', 'listening');
    await h.commands.start('section', 'listening');
    await audio('delete-me');
    await h.commands.installContent({ ...listeningDocument, contentKey: 'keep-me', source: 'agent' });
    await h.commands.start('section', 'listening');
    h.commands.setObjectiveAnswer('listening', 1, 'Keep my answer');
    const keptId = h.state().attemptId;
    await audio('keep-me'); await h.commands.goHome();
    await h.commands.deleteContent('delete-me');
    expect(getIeltsDrafts(h.state()).map(draft => draft.attemptId)).toEqual([keptId]);
    expect((await h.store.loadLibrary()).map(doc => doc.contentKey)).not.toContain('delete-me');
    expect(await listListeningAudioChunks(db, 'delete-me')).toEqual([]);
    expect(await listListeningAudioChunks(db, 'keep-me')).toHaveLength(1);
    await expect(audio('delete-me')).rejects.toThrow('deleted');
    const restored = await createDraftRepository(db).loadIelts(h.repository);
    expect(getIeltsDrafts(restored.session)).toHaveLength(1);
    expect(restored.session.answers.listening[1]).toBe('Keep my answer');
    await h.commands.openAttempt(submission.attemptId, 'listening');
    expect(h.state().review).toMatchObject({ kind: 'objective', document: { contentKey: 'delete-me' }, submission: { attemptId: submission.attemptId } });
    expect(await db.sql`PRAGMA foreign_key_check`).toEqual([]);
  });
  it('deletes only the selected attempt and rolls back failed saved-test deletion', async () => {
    const h = harness();
    await h.commands.installContent({ ...writingDocument, contentKey: 'writing-delete', source: 'agent' });
    await h.commands.start('section', 'writing');
    const first = h.state().attemptId!;
    await h.commands.start('section', 'writing');
    const second = h.state().attemptId!;
    await h.commands.goHome(); await h.commands.discardDraft(first);
    expect(getIeltsDrafts(h.state()).map(draft => draft.attemptId)).toEqual([second]);
    const before = h.state();
    await db.sql`CREATE TRIGGER fail_delete BEFORE UPDATE OF archived ON content_documents BEGIN SELECT RAISE(ABORT, 'Disk failure'); END`;
    await expect(h.commands.deleteContent('writing-delete')).rejects.toThrow('Disk failure');
    expect(h.state()).toBe(before);
    expect((await h.store.loadLibrary()).some(doc => doc.contentKey === 'writing-delete')).toBe(true);
    expect((await createDraftRepository(db).loadIelts(h.repository)).session.attemptId).toBe(second);
    await db.sql`DROP TRIGGER fail_delete`;
    await h.commands.deleteContent('writing-delete');
    expect(getIeltsDrafts(h.state())).toHaveLength(0);
    expect(h.content().writing.contentKey).toBe(writingDocument.contentKey);
  });
});
