// @vitest-environment happy-dom
import { act, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getIeltsExample } from '@/content/ieltsExamples';
import type { ListeningContentDocument } from '@/domain/objectiveContent';
import type { ListeningAudioSession } from '@/application/useListeningAudio';
import type { StoredListeningAudioChunk } from '@/infrastructure/database/listeningAudioRepository';
import { ListeningAudioBar } from './ListeningAudioBar';

const document = getIeltsExample('listening') as ListeningContentDocument;
const speech = (sequence: number): StoredListeningAudioChunk => ({
  contentKey: document.contentKey, cacheVersion: 'test', sequence, partId: 1, segmentIndex: sequence,
  kind: 'speech', durationMs: 1000, mimeType: 'audio/wav', byteLength: 48, audio: new Uint8Array(48),
});

describe('generated Listening playback recovery', () => {
  let root: Root;
  let host: HTMLDivElement;
  let session: ListeningAudioSession;
  const retry = vi.fn();
  const onUiStatus = vi.fn();
  const onPersistState = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.spyOn(HTMLMediaElement.prototype, 'src', 'set').mockImplementation(function (this: HTMLMediaElement, value) {
      this.setAttribute('src', value);
    });
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(async function (this: HTMLMediaElement) {
      this.dispatchEvent(new Event('play'));
    });
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (this: HTMLMediaElement) {
      this.dispatchEvent(new Event('pause'));
    });
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:audio-${crypto.randomUUID()}`);
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    session = {
      phase: 'generating', hydrated: true, chunks: [speech(0), speech(1)], totalChunks: 4,
      completedChunks: 2, readyToPlay: true, error: null, retry,
    };
    host = globalThis.document.createElement('div');
    globalThis.document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    vi.restoreAllMocks(); vi.clearAllMocks(); vi.unstubAllGlobals();
  });

  async function render() {
    await act(async () => root.render(
      <StrictMode>
        <ListeningAudioBar document={document} audioSession={session} currentPart={1} isReviewMode={false}
          onPersistState={onPersistState} onUiStatus={onUiStatus} />
      </StrictMode>,
    ));
  }

  async function mediaEvent(type: string) {
    const audio = host.querySelector('audio');
    if (!audio) throw new Error('Expected a speech chunk.');
    await act(async () => audio.dispatchEvent(new Event(type)));
  }

  it('continues at the next chunk after generation fails, buffered audio ends, and retry succeeds', async () => {
    await render(); await mediaEvent('canplay'); await mediaEvent('ended'); await mediaEvent('canplay');
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(2);

    session = { ...session, phase: 'error', error: 'Audio preparation failed.', readyToPlay: false };
    await render(); await mediaEvent('ended');
    expect(host.querySelector('audio')).toBeNull();
    expect(host.textContent).toContain('Audio preparation failed.');
    await act(async () => host.querySelector('button')!.click());
    expect(retry).toHaveBeenCalledOnce();

    session = { ...session, phase: 'generating', error: null };
    await render();
    session = { ...session, phase: 'ready', readyToPlay: true, completedChunks: 4, chunks: [...session.chunks, speech(2), speech(3)] };
    await render(); await mediaEvent('canplay');
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(3);
    expect(onUiStatus).toHaveBeenLastCalledWith(expect.objectContaining({ state: 'playing', audioPart: 1 }));
    await mediaEvent('timeupdate');
    expect(onPersistState).toHaveBeenLastCalledWith({ currentTimeSec: 2, volume: 0.85 });
  });

  it('shows an error and retry before hydration, then mounts the recovered player', async () => {
    session = { ...session, phase: 'error', hydrated: false, chunks: [], error: 'Saved audio could not be loaded.', readyToPlay: false };
    await render();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('Saved audio could not be loaded.');
    expect(onUiStatus).toHaveBeenLastCalledWith(expect.objectContaining({ state: 'error' }));
    expect(host.textContent).not.toContain('Restoring saved listening audio');
    await act(async () => host.querySelector('button')!.click());
    expect(retry).toHaveBeenCalledOnce();

    session = { ...session, phase: 'generating', hydrated: true, chunks: [speech(0), speech(1)], error: null, readyToPlay: true };
    await render(); await mediaEvent('canplay');
    expect(onUiStatus).toHaveBeenLastCalledWith(expect.objectContaining({ state: 'playing' }));
    expect(host.querySelector('[role="alert"]')).toBeNull();
  });
});
