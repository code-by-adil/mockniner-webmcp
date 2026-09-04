import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
const origin = process.argv[2]
if (!origin) throw new Error('Usage: npm run audio:verify -- https://your-deployment.example')
const manifest = JSON.parse(await readFile(new URL('../../src/infrastructure/media/audioAssetManifest.json', import.meta.url)))
for (const asset of manifest.assets) {
  const url = new URL(`/audio-assets/${manifest.version}/${asset.path}`, origin)
  const response = await fetch(url, { signal: AbortSignal.timeout(180_000) })
  if (!response.ok || !response.body) throw new Error(`${asset.path}: HTTP ${response.status}`)
  if (response.headers.get('cross-origin-resource-policy') !== 'same-origin') throw new Error(`${asset.path}: missing isolation header`)
  const hash = createHash('sha256')
  let bytes = 0
  for await (const chunk of response.body) { bytes += chunk.length; hash.update(chunk) }
  if (bytes !== asset.bytes || hash.digest('hex') !== asset.sha256) throw new Error(`${asset.path}: deployed file does not match the pinned manifest`)
  console.log(`Verified deployed ${asset.path} (${bytes} bytes)`)
}
const missing = await fetch(new URL(`/audio-assets/${manifest.version}/missing-file`, origin))
if (missing.status !== 404) throw new Error('Unknown audio assets must return 404, never the application HTML')
console.log('All deployed audio assets match the release manifest. Run the cold-browser speech check before marking the release ready.')
