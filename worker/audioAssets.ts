import manifest from '../src/infrastructure/media/audioAssetManifest.json'

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const path = new URL(request.url).pathname
    if (!path.startsWith('/audio-assets/')) return env.ASSETS.fetch(request)
    const asset = manifest.assets.find(file => path === `/audio-assets/${manifest.version}/${file.path}`)
    if (!asset) return new Response('Audio asset not found', { status: 404 })
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } })
    const key = `${manifest.version}/${asset.path}`
    const object = request.method === 'HEAD' ? await env.AUDIO_ASSETS.head(key) : await env.AUDIO_ASSETS.get(key)
    if (!object || object.size !== asset.bytes) return new Response('Audio asset unavailable', { status: 503, headers: { 'Retry-After': '30' } })
    const headers = new Headers({
      'Content-Type': asset.path.endsWith('.mjs') ? 'text/javascript' : asset.path.endsWith('.wasm') ? 'application/wasm' : asset.path.endsWith('.json') ? 'application/json' : 'application/octet-stream',
      'Content-Length': String(object.size),
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Cross-Origin-Resource-Policy': 'same-origin',
      ETag: object.httpEtag,
    })
    if (request.headers.get('If-None-Match') === object.httpEtag) return new Response(null, { status: 304, headers })
    return new Response('body' in object ? (object as R2ObjectBody).body : null, { headers })
  },
} satisfies ExportedHandler<Env>
