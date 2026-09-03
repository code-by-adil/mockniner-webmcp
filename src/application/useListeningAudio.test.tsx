// @vitest-environment happy-dom
import { act, useLayoutEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { listeningDocument } from '@/content/objective'
import { getIeltsExample } from '@/content/ieltsExamples'
import type { ListeningContentDocument } from '@/domain/objectiveContent'
import type { KokoroListeningWorkerResponse } from '@/infrastructure/media/kokoroListening.worker'
import type { SaveListeningAudioChunkInput, StoredListeningAudioChunk } from '@/infrastructure/database/listeningAudioRepository'
import { useListeningAudio, type ListeningAudioSession } from './useListeningAudio'
import { getListeningAudioStatus } from './listeningAudioStatus'

const persistence = vi.hoisted(() => ({ prepare: vi.fn(), save: vi.fn() }))
vi.mock('@/infrastructure/database/client', () => ({ getLocalDatabase: async () => ({}) }))
vi.mock('@/infrastructure/database/listeningAudioRepository', () => ({ prepareListeningAudioCache: persistence.prepare, saveListeningAudioChunk: persistence.save }))

class TestWorker {
  static instances: TestWorker[] = []
  listeners = new Map<string, (event: unknown) => void>()
  postMessage = vi.fn()
  terminate = vi.fn()
  constructor() { TestWorker.instances.push(this) }
  addEventListener(type: string, listener: (event: unknown) => void) { this.listeners.set(type, listener) }
  emit(data: KokoroListeningWorkerResponse) { this.listeners.get('message')?.({ data }) }
}
let root: Root
let host: HTMLDivElement
let session: ListeningAudioSession
let stored: StoredListeningAudioChunk[]
const generated = getIeltsExample('listening') as ListeningContentDocument

function Harness({ document }: { document: ListeningContentDocument }) {
  const value = useListeningAudio(document)
  useLayoutEffect(() => { session = value })
  return <output>{JSON.stringify(getListeningAudioStatus(document, value))}</output>
}
async function render(document = generated) {
  await act(async () => { root.render(<Harness document={document} />) })
}
function chunk(sequence: number): Extract<KokoroListeningWorkerResponse, { type: 'chunk' }> {
  return { type: 'chunk', chunk: { kind: 'speech', sequence, partId: 1, segmentIndex: sequence,
    text: 'Synthetic test speech.', voice: 'af_heart', durationMs: 1500, audio: new Blob(['audio']) } }
}
async function emit(worker: TestWorker, event: KokoroListeningWorkerResponse) { await act(async () => { worker.emit(event) }) }

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.stubGlobal('Worker', TestWorker)
  TestWorker.instances = []; stored = []
  persistence.prepare.mockReset().mockImplementation(async () => stored.map(chunk => ({ ...chunk, audio: chunk.audio?.slice() ?? null })))
  persistence.save.mockReset().mockImplementation(async (_database: unknown, input: SaveListeningAudioChunkInput) => {
    const saved: StoredListeningAudioChunk = { ...input, audio: new Uint8Array([1, 2]), mimeType: 'audio/wav', byteLength: 2 }
    stored.push(saved); return saved
  })
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals() })

describe('Listening preparation state shared with WebMCP', () => {
  it('distinguishes loading, generating, playable buffering and fully ready', async () => {
    await render(); const worker = TestWorker.instances[0]!
    expect(session).toMatchObject({ phase: 'loading', readyToPlay: false })
    await emit(worker, { type: 'planned', totalChunks: 3 })
    await emit(worker, { type: 'ready' })
    await emit(worker, chunk(0))
    expect(session).toMatchObject({ phase: 'generating', completedChunks: 1, totalChunks: 3, readyToPlay: false })
    await emit(worker, chunk(1))
    expect(session).toMatchObject({ phase: 'generating', completedChunks: 2, readyToPlay: true })
    const status = getListeningAudioStatus(generated, session)
    expect(status).toMatchObject({ contentKey: generated.contentKey, source: 'kokoro', canRetry: false })
    expect(JSON.stringify(status)).not.toMatch(/Synthetic|"(audio|chunks|script|speakers)"/)
    await emit(worker, chunk(2)); await emit(worker, { type: 'complete' })
    expect(session).toMatchObject({ phase: 'ready', readyToPlay: true, completedChunks: 3 })
  })

  it('only exposes durable chunks as playable', async () => {
    let finish!: (chunk: StoredListeningAudioChunk) => void
    persistence.save.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    await render(); const worker = TestWorker.instances[0]!
    await emit(worker, chunk(0))
    expect(session.completedChunks).toBe(0)
    expect(worker.postMessage).not.toHaveBeenCalledWith({ type: 'persisted', sequence: 0 })
    await act(async () => { finish({ contentKey: generated.contentKey, cacheVersion: 'test', sequence: 0, partId: 1, segmentIndex: 0, durationMs: 1500, kind: 'speech', audio: new Uint8Array([1]), mimeType: 'audio/wav', byteLength: 1 }) })
    expect(session.completedChunks).toBe(1)
    expect(worker.postMessage).toHaveBeenCalledWith({ type: 'persisted', sequence: 0 })
  })

  it('reports generation failures even after buffering, and retries with saved chunks', async () => {
    await render(); const worker = TestWorker.instances[0]!
    await emit(worker, chunk(0)); await emit(worker, chunk(1))
    const playingChunk = session.chunks[0]
    await emit(worker, { type: 'error', message: 'Synthetic WebGPU failure.' })
    expect(getListeningAudioStatus(generated, session)).toMatchObject({ phase: 'error', readyToPlay: false, canRetry: true, error: 'Synthetic WebGPU failure.', completedChunks: 2 })
    await act(async () => session.retry())
    const retry = TestWorker.instances[1]!
    expect(retry.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'generate', completedSequences: [0, 1] }))
    expect(session.error).toBeNull()
    expect(session.chunks[0]).toBe(playingChunk)
    await emit(retry, { type: 'complete' })
    expect(session.phase).toBe('ready')
    expect(worker.terminate).toHaveBeenCalled()
  })

  it('reports early cache failure for a newly selected set instead of staying stuck on loading', async () => {
    await render(listeningDocument)
    persistence.prepare.mockRejectedValueOnce(new Error('Synthetic cache unavailable.'))
    await render(generated)
    expect(getListeningAudioStatus(generated, session)).toMatchObject({ contentKey: generated.contentKey, phase: 'error', canRetry: true, error: 'Synthetic cache unavailable.' })
    expect(TestWorker.instances).toHaveLength(0)
    await act(async () => session.retry())
    expect(TestWorker.instances).toHaveLength(1)
    expect(session.phase).toBe('loading')
  })

  it('ignores stale messages from the previous set and treats bundled audio as available', async () => {
    await render(); const old = TestWorker.instances[0]!
    const next = { ...generated, contentKey: 'next-listening' }
    await render(next)
    await emit(old, { type: 'error', message: 'Old failure.' })
    expect(getListeningAudioStatus(next, session)).toMatchObject({ contentKey: next.contentKey, phase: 'loading', error: null })
    await render(listeningDocument)
    expect(getListeningAudioStatus(listeningDocument, session)).toMatchObject({ source: 'bundled', phase: 'ready', readyToPlay: true, canRetry: false })
  })
})
