import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'

const body = new TextEncoder().encode('verified audio data')
const asset = { path: 'test.bin', bytes: body.length, sha256: createHash('sha256').update(body).digest('hex'), source: 'test' }
let entries: Map<string, Response>
let cache: { match: ReturnType<typeof vi.fn>; put: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> }
let network: ReturnType<typeof vi.fn>
beforeEach(() => {
  vi.resetModules()
  entries = new Map()
  cache = { match: vi.fn(async (url: string) => entries.get(url)?.clone()),
    put: vi.fn(async (url: string, response: Response) => { entries.set(url, response.clone()) }),
    delete: vi.fn(async (url: string) => entries.delete(url)) }
  network = vi.fn(async () => new Response(body))
  vi.stubGlobal('fetch', network)
  vi.stubGlobal('crypto', { subtle: { digest: async (_algorithm: string, bytes: ArrayBuffer) => createHash('sha256').update(new Uint8Array(bytes)).digest().buffer } })
  vi.stubGlobal('location', { origin: 'https://practice.example' })
  vi.stubGlobal('navigator', {})
  vi.stubGlobal('caches', { open: vi.fn(async () => cache) })
})
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe('verified audio assets', () => {
  it('reports byte progress, stores complete verified files, and reuses them after a new worker starts', async () => {
    const progress = vi.fn()
    let api = await import('./audioAssets')
    expect(await (await api.readAudioAsset(asset, progress)).text()).toBe('verified audio data')
    expect(progress).toHaveBeenCalledWith(body.length, 'verifying', 1)
    expect(cache.put).toHaveBeenCalledTimes(1)
    vi.resetModules(); api = await import('./audioAssets')
    await api.readAudioAsset(asset)
    expect(network).toHaveBeenCalledTimes(1)
  })

  it('discards only a damaged cached file and downloads a verified replacement', async () => {
    const api = await import('./audioAssets')
    const url = 'https://practice.example' + api.AUDIO_ASSET_BASE + asset.path
    entries.set(url, new Response('wrong'))
    entries.set('unrelated-saved-file', new Response('keep'))
    await api.readAudioAsset(asset)
    expect(cache.delete).toHaveBeenCalledWith(url)
    expect(await entries.get('unrelated-saved-file')!.text()).toBe('keep')
  })

  it('retries a temporary server error but never caches it', async () => {
    vi.useFakeTimers()
    network.mockResolvedValueOnce(new Response('Unavailable', { status: 503 }))
    const { readAudioAsset } = await import('./audioAssets')
    const pending = readAudioAsset(asset)
    await vi.runAllTimersAsync()
    await pending
    expect(network).toHaveBeenCalledTimes(2)
    expect(cache.put).toHaveBeenCalledTimes(1)
  })

  it('returns a precise missing deployment file error without retrying a 404', async () => {
    network.mockResolvedValue(new Response('Not found', { status: 404 }))
    const { readAudioAsset } = await import('./audioAssets')
    await expect(readAudioAsset(asset)).rejects.toMatchObject({ code: 'AUDIO_ASSET_HTTP', file: 'test.bin', retryable: false })
    expect(network).toHaveBeenCalledTimes(1)
    expect(cache.put).not.toHaveBeenCalled()
  })

  it('rejects truncated and wrong-hash downloads after bounded retries', async () => {
    vi.useFakeTimers()
    network.mockResolvedValueOnce(new Response(body.slice(0, 3)))
      .mockImplementation(async () => new Response(new Uint8Array(body.length)))
    const { readAudioAsset } = await import('./audioAssets')
    const assertion = expect(readAudioAsset(asset)).rejects.toMatchObject({ code: 'AUDIO_ASSET_INTEGRITY', retryable: true })
    await vi.runAllTimersAsync(); await assertion
    expect(network).toHaveBeenCalledTimes(3)
    expect(cache.put).not.toHaveBeenCalled()
  })

  it('aborts stalled requests and preserves a useful retryable error', async () => {
    vi.useFakeTimers()
    network.mockImplementation((_url: string, options: RequestInit) => new Promise((_resolve, reject) => {
      options.signal!.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
    }))
    const { readAudioAsset } = await import('./audioAssets')
    const assertion = expect(readAudioAsset(asset)).rejects.toMatchObject({ code: 'AUDIO_DOWNLOAD_STALLED', retryable: true })
    await vi.runAllTimersAsync(); await assertion
    expect(network).toHaveBeenCalledTimes(3)
    expect(cache.put).not.toHaveBeenCalled()
  })

  it('does not redownload on quota failure or erase other storage', async () => {
    cache.put.mockRejectedValue(new DOMException('Full', 'QuotaExceededError'))
    const { readAudioAsset } = await import('./audioAssets')
    await expect(readAudioAsset(asset)).rejects.toMatchObject({ code: 'AUDIO_CACHE_FULL', retryable: false })
    expect(network).toHaveBeenCalledTimes(1)
    expect(cache.delete).not.toHaveBeenCalled()
  })
})
