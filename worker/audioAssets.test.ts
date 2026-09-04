import { describe, expect, it, vi } from 'vitest'
import handler from './audioAssets'
import manifest from '../src/infrastructure/media/audioAssetManifest.json'

const file = manifest.assets[0]!
const url = `https://practice.example/audio-assets/${manifest.version}/${file.path}`
function environment() {
  return { ASSETS: { fetch: vi.fn(async () => new Response('app')) }, AUDIO_ASSETS: {
    get: vi.fn(async () => ({ size: file.bytes, httpEtag: '"pinned"', body: new Blob(['asset']).stream() })),
    head: vi.fn(async () => ({ size: file.bytes, httpEtag: '"pinned"' })),
  } }
}
const call = (request: Request, env: ReturnType<typeof environment>) => handler.fetch(request, env as unknown as Env)
describe('public audio asset route', () => {
  it('streams allowlisted versioned assets with isolation and immutable caching', async () => {
    const env = environment(); const response = await call(new Request(url), env)
    expect(response.status).toBe(200)
    expect(response.headers.get('Cross-Origin-Resource-Policy')).toBe('same-origin')
    expect(response.headers.get('Cache-Control')).toContain('immutable')
    expect(await response.text()).toBe('asset')
  })
  it('serves WASM with its streaming compilation MIME type', async () => {
    const env = environment()
    const wasm = manifest.assets.find(asset => asset.path.endsWith('.wasm'))!
    env.AUDIO_ASSETS.get.mockResolvedValueOnce({ size: wasm.bytes, httpEtag: '"wasm"', body: new Blob().stream() })
    const response = await call(new Request(`https://practice.example/audio-assets/${manifest.version}/${wasm.path}`), env)
    expect(response.headers.get('Content-Type')).toBe('application/wasm')
  })
  it('never returns the SPA for unknown audio files or accepts writes', async () => {
    const env = environment()
    expect((await call(new Request(url + '.missing'), env)).status).toBe(404)
    expect((await call(new Request(url, { method: 'PUT', body: 'overwrite' }), env)).status).toBe(405)
    expect(env.ASSETS.fetch).not.toHaveBeenCalled()
    expect(env.AUDIO_ASSETS.get).not.toHaveBeenCalled()
  })
  it('supports metadata checks and fails closed on absent or truncated deployment assets', async () => {
    const env = environment()
    expect((await call(new Request(url, { method: 'HEAD' }), env)).headers.get('Content-Length')).toBe(String(file.bytes))
    expect(env.AUDIO_ASSETS.get).not.toHaveBeenCalled()
    env.AUDIO_ASSETS.get.mockResolvedValueOnce(null as never)
    expect((await call(new Request(url), env)).status).toBe(503)
    env.AUDIO_ASSETS.get.mockResolvedValueOnce({ size: 1, httpEtag: '"bad"', body: new Blob().stream() })
    expect((await call(new Request(url), env)).status).toBe(503)
    expect(await (await call(new Request('https://practice.example/'), env)).text()).toBe('app')
  })
})
