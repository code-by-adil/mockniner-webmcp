import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SQLocal } from 'sqlocal';
import { listeningDocument, readingDocument } from '@/content/objective';
import { writingDocument } from '@/content/writing';
import { initialSession, sessionReducer, type IeltsSession } from '@/domain/session';
import { createContentStore } from '@/infrastructure/database/contentRepository';
import { createDraftRepository } from '@/infrastructure/database/draftRepository';
import { createIeltsRepository } from '@/infrastructure/database/ieltsRepository';
import { migrateDatabase } from '@/infrastructure/database/migrations';
import { createSaveCoordinator } from '@/infrastructure/saveCoordinator';
import { createIeltsCommands } from './ieltsCommands';

let database: SQLocal;
beforeEach(async () => {
  vi.stubGlobal('Worker', class {});
  let connected!: () => void;
  const ready = new Promise<void>(resolve => { connected = resolve; });
  database = new SQLocal({ databasePath: ':memory:', onConnect: connected, onInit: sql => [sql`PRAGMA foreign_keys = ON`] });
  await ready;
  await migrateDatabase(database);
});
afterEach(async () => { await database.destroy(true); vi.unstubAllGlobals(); });

function setup() {
  let state = initialSession;
  let content = { listening: listeningDocument, reading: readingDocument, writing: writingDocument };
  const drafts = createDraftRepository(database);
  const repository = createIeltsRepository(database);
  const saves = createSaveCoordinator();
  const saveSession = vi.fn((next: IeltsSession) => drafts.saveIelts(next, content));
  const publish = vi.fn((next: IeltsSession) => { state = next; });
  const commands = createIeltsCommands({
    getState: () => state,
    getContent: () => content,
    setContent: next => { content = next; },
    getContentStore: async () => createContentStore(database, undefined, Object.values(content)),
    getRepository: async () => repository,
    publishSession: publish,
    persistSession: async next => { await saves.flush(); await saveSession(next); },
    flushDrafts: saves.flush,
    dispatch: action => {
      state = sessionReducer(state, action);
      const next = state;
      const documents = content;
      saves.enqueue('ielts', () => drafts.saveIelts(next, documents));
    },
  });
  return { commands, saves, drafts, repository, saveSession, publish, getState: () => state, getContent: () => content };
}

describe('durable IELTS transitions', () => {
  it('rejects a start overlapping installation, then saves and publishes a retry exactly once', async () => {
    const h = setup();
    const replacement = { ...readingDocument, contentKey: 'replacement-reading', name: 'Replacement Reading' };
    const installation = h.commands.installContent(replacement);
    await Promise.resolve();
    expect(() => h.commands.start('section', 'reading')).toThrow(expect.objectContaining({ code: 'PRACTICE_CHANGE_BUSY' }));
    await installation;
    expect(h.saveSession).not.toHaveBeenCalled();
    expect(h.publish).not.toHaveBeenCalled();
    h.saveSession.mockClear();
    h.publish.mockClear();
    await h.commands.start('section', 'reading');
    expect(h.saveSession).toHaveBeenCalledOnce();
    expect(h.publish).toHaveBeenCalledOnce();
    expect(h.publish.mock.calls[0]![0]).toBe(h.saveSession.mock.calls[0]![0]);
    expect(h.getState()).toMatchObject({ view: 'exam', currentSection: 'reading', contentKeys: { reading: replacement.contentKey } });
    const restored = await createDraftRepository(database).loadIelts(h.repository);
    expect(restored.session.attemptId).toBe(h.getState().attemptId);
    expect(restored.documents.find(document => document.section === 'reading')).toEqual(replacement);
    expect(await database.sql`SELECT id FROM practice_drafts`).toHaveLength(1);
    await h.saves.flush();
    expect(h.saveSession).toHaveBeenCalledOnce();
  });

  it('installs unrelated content without rewriting or resetting a draft already at home', async () => {
    const h = setup();
    await h.commands.start('section', 'writing');
    h.commands.setWritingDraft(1, 'Preserve this unfinished report.');
    await h.commands.goHome();
    const before = h.getState();
    h.saveSession.mockClear();
    h.publish.mockClear();
    await h.commands.installContent({ ...readingDocument, contentKey: 'another-reading-set' });
    expect(h.getState()).toBe(before);
    expect(h.saveSession).not.toHaveBeenCalled();
    expect(h.publish).not.toHaveBeenCalled();
    expect((await createDraftRepository(database).loadIelts(h.repository)).session.writingDrafts[1]).toBe('Preserve this unfinished report.');
    await h.saves.flush();
  });

  it('keeps live answer edits made while a pause is saving and defers timer ticks', async () => {
    const h = setup();
    await h.commands.start('section', 'writing');
    h.commands.setWritingDraft(1, 'Original answer.');
    await h.saves.flush();
    let release!: () => void;
    let saved!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    const firstSave = new Promise<void>(resolve => { saved = resolve; });
    h.saveSession.mockImplementationOnce(async next => {
      await h.drafts.saveIelts(next, h.getContent());
      saved();
      await held;
    });
    h.publish.mockClear();
    const leaving = h.commands.goHome();
    await firstSave;
    const time = h.getState().secondsRemaining.writing;
    h.commands.setWritingDraft(1, 'The latest answer typed while saving.');
    h.commands.tick('writing');
    expect(h.getState().secondsRemaining.writing).toBe(time);
    expect(h.publish).not.toHaveBeenCalled();
    release();
    await leaving;
    expect(h.getState()).toMatchObject({ view: 'home', writingDrafts: { 1: 'The latest answer typed while saving.' } });
    expect(h.publish).toHaveBeenCalledOnce();
    const restored = await createDraftRepository(database).loadIelts(h.repository);
    expect(restored.session.writingDrafts[1]).toBe('The latest answer typed while saving.');
    await h.saves.flush();
  });

  it('leaves the current attempt unchanged when a metadata save fails and permits retry', async () => {
    const h = setup();
    await h.commands.start('section', 'writing');
    h.commands.setWritingDraft(1, 'Keep this draft.');
    await h.saves.flush();
    const before = h.getState();
    await database.sql`CREATE TRIGGER fail_draft BEFORE UPDATE ON practice_drafts BEGIN SELECT RAISE(ABORT, 'Injected save failure'); END`;
    await expect(h.commands.goHome()).rejects.toMatchObject({ code: 'DRAFT_SAVE_FAILED' });
    expect(h.getState()).toBe(before);
    expect((await createDraftRepository(database).loadIelts(h.repository)).session.writingDrafts[1]).toBe('Keep this draft.');
    await database.sql`DROP TRIGGER fail_draft`;
    await h.commands.goHome();
    expect(h.getState()).toMatchObject({ view: 'home', attemptId: before.attemptId, writingDrafts: { 1: 'Keep this draft.' } });
    await h.saves.flush();
  });

  it('finishes a delayed Listening pause while passive playback updates continue', async () => {
    const h = setup();
    await h.commands.start('section', 'listening');
    h.commands.setListeningPlayback({ currentTimeSec: 12, volume: 0.8 });
    await h.saves.flush();
    h.saveSession.mockClear();
    h.publish.mockClear();
    let writes = 0;
    h.saveSession.mockImplementation(async next => {
      if (++writes > 3) throw new Error('Passive playback restarted the save.');
      await new Promise(resolve => setTimeout(resolve, 25));
      await h.drafts.saveIelts(next, h.getContent());
    });
    let playbackEvents = 0;
    const playback = setInterval(() => {
      playbackEvents += 1;
      h.commands.setListeningPlayback({ currentTimeSec: 12 + playbackEvents, volume: 0.8 });
    }, 5);
    try {
      await h.commands.goHome();
    } finally {
      clearInterval(playback);
      await h.saves.flush();
    }
    expect(playbackEvents).toBeGreaterThan(0);
    expect(h.saveSession).toHaveBeenCalledOnce();
    expect(h.publish).toHaveBeenCalledOnce();
    expect(h.getState()).toMatchObject({ view: 'home', listeningPlayback: { currentTimeSec: 12, volume: 0.8 } });
    const restored = await createDraftRepository(database).loadIelts(h.repository);
    expect(restored.session.listeningPlayback).toEqual({ currentTimeSec: 12, volume: 0.8 });
  });
});
