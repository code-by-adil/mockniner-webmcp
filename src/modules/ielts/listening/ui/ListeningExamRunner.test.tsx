// @vitest-environment happy-dom
import { act, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { ListeningExamRunner } from './ListeningExamRunner'
import { listeningDocument } from '@/content/objective'
import type { ListeningAudioSession } from '@/application/useListeningAudio'
import type { ListeningAudioUiStatus } from './listeningAudioTypes'

const playback = vi.hoisted(() => ({ state: 'loading' as ListeningAudioUiStatus['state'], needsUserStart: false }))
vi.mock('./ListeningAudioBar', () => ({ ListeningAudioBar: ({ onUiStatus }: { onUiStatus: (status: ListeningAudioUiStatus) => void }) => {
  const { state, needsUserStart } = playback
  useEffect(() => onUiStatus({ state, needsUserStart, audioPart: 1, isInSilence: false, silenceEndSec: null }), [onUiStatus, state, needsUserStart])
  return null
} }))

describe('Listening preparation does not consume exam time', () => {
  let root: Root
  let host: HTMLDivElement
  const onTick = vi.fn()
  const onSubmit = vi.fn()
  let session: ListeningAudioSession
  beforeEach(() => {
    vi.useFakeTimers(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    host = document.createElement('div'); document.body.append(host); root = createRoot(host)
    session = { phase: 'loading', hydrated: false, chunks: [], totalChunks: null, completedChunks: 0, readyToPlay: false, error: null, retry: vi.fn() }
    playback.state = 'loading'; playback.needsUserStart = false
  })
  afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.useRealTimers(); vi.clearAllMocks(); vi.unstubAllGlobals() })
  async function render() {
    await act(async () => root.render(<ListeningExamRunner document={listeningDocument} audioSession={session}
      answers={{}} currentPart={1} secondsRemaining={1800} listeningPlayback={{ currentTimeSec: 0, volume: 0.85 }}
      onBack={vi.fn()} onPartChange={vi.fn()} onAnswerChange={vi.fn()} onListeningPlaybackChange={vi.fn()} onTick={onTick} onSubmit={onSubmit} />))
  }
  it('opens questions immediately, keeps the timer still during preparation, then ticks and pauses for buffering', async () => {
    await render()
    expect(host.querySelector('[id="question-input-1"]')).not.toBeNull()
    await act(async () => vi.advanceTimersByTime(5000))
    expect(onTick).not.toHaveBeenCalled()
    expect(onSubmit).not.toHaveBeenCalled()
    session = { ...session, phase: 'generating', hydrated: true, readyToPlay: true }
    playback.state = 'playing'; await render()
    await act(async () => vi.advanceTimersByTime(2000))
    expect(onTick).toHaveBeenCalledTimes(2)
    playback.state = 'paused'; playback.needsUserStart = true; await render()
    await act(async () => vi.advanceTimersByTime(5000))
    expect(onTick).toHaveBeenCalledTimes(2)
    playback.state = 'loading'; playback.needsUserStart = false; await render()
    await act(async () => vi.advanceTimersByTime(5000))
    expect(onTick).toHaveBeenCalledTimes(2)
    playback.state = 'error'; session = { ...session, phase: 'error', error: 'Generation stopped.', readyToPlay: false }; await render()
    await act(async () => vi.advanceTimersByTime(5000))
    expect(onTick).toHaveBeenCalledTimes(2)
  })
})
