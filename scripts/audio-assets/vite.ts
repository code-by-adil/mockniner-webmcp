import type { Plugin } from 'vite'
import { createReadStream, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import manifest from '../../src/infrastructure/media/audioAssetManifest.json' with { type: 'json' }

export function audioAssets(): Plugin {
  const middleware: import('vite').Connect.NextHandleFunction = (request, response, next) => {
    const path = request.url?.split('?')[0] ?? ''
    if (!path.startsWith('/audio-assets/')) return next()
    const asset = manifest.assets.find(file => path === `/audio-assets/${manifest.version}/${file.path}`)
    if (!asset) { response.statusCode = 404; response.end('Audio asset not found'); return }
    if (!['GET', 'HEAD'].includes(request.method ?? '')) { response.statusCode = 405; response.end(); return }
    const local = fileURLToPath(new URL(`../../.audio-assets/${asset.path}`, import.meta.url))
    if (!existsSync(local)) { response.statusCode = 404; response.end('Run npm run audio:prepare'); return }
    response.setHeader('Content-Type', asset.path.endsWith('.mjs') ? 'text/javascript' : asset.path.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream')
    response.setHeader('Content-Length', asset.bytes)
    response.setHeader('Cross-Origin-Resource-Policy', 'same-origin')
    if (request.method === 'HEAD') response.end()
    else createReadStream(local).on('error', () => response.destroy()).pipe(response)
  }
  return { name: 'audio-assets', configureServer: server => { server.middlewares.use(middleware) }, configurePreviewServer: server => { server.middlewares.use(middleware) } }
}
