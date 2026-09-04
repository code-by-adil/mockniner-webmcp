import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { spawnSync } from 'node:child_process'

const manifest = JSON.parse(await readFile(new URL('../../src/infrastructure/media/audioAssetManifest.json', import.meta.url)))
const upload = process.argv.includes('--upload')
const selected = process.argv.find(value => value.startsWith('--from='))?.slice(7)
if (selected && !manifest.assets.some(asset => asset.path === selected)) throw new Error(`Unknown resume file: ${selected}`)
let started = !selected
let modelSource
for (const asset of manifest.assets) {
  const destination = new URL(`../../.audio-assets/${asset.path}`, import.meta.url)
  const valid = data => data.byteLength === asset.bytes && createHash('sha256').update(data).digest('hex') === asset.sha256
  let data = await readFile(destination).catch(() => null)
  if (!data || !valid(data)) {
    console.log(`Preparing ${asset.path}`)
    if ('offset' in asset) {
      if (!modelSource) {
        const response = await fetch(manifest.model.source)
        if (!response.ok) throw new Error(`Model source: HTTP ${response.status}`)
        modelSource = Buffer.from(await response.arrayBuffer())
        if (modelSource.length !== manifest.model.bytes || createHash('sha256').update(modelSource).digest('hex') !== manifest.model.sha256) throw new Error('Model source integrity check failed')
      }
      data = modelSource.subarray(asset.offset, asset.offset + asset.bytes)
    } else if (asset.source.startsWith('https:')) {
      const response = await fetch(asset.source)
      if (!response.ok) throw new Error(`${asset.path}: HTTP ${response.status}`)
      data = Buffer.from(await response.arrayBuffer())
    } else data = await readFile(new URL(`../../${asset.source}`, import.meta.url))
    if (!valid(data)) throw new Error(`${asset.path}: size or SHA-256 does not match the pinned manifest`)
    await mkdir(dirname(destination.pathname), { recursive: true })
    await writeFile(destination, data)
  }
  if (asset.path === selected) started = true
  if (upload && started) {
    let result
    for (let attempt = 1; attempt <= 3; attempt++) {
      result = spawnSync('npx', ['wrangler', 'r2', 'object', 'put', `mockniner-audio-assets/${manifest.version}/${asset.path}`,
        '--file', destination.pathname, '--remote', '--content-type', asset.path.endsWith('.mjs') ? 'text/javascript' : asset.path.endsWith('.wasm') ? 'application/wasm' : asset.path.endsWith('.json') ? 'application/json' : 'application/octet-stream',
        '--cache-control', 'public, max-age=31536000, immutable'], { stdio: 'inherit' })
      if (result.status === 0) break
      if (attempt < 3) await new Promise(resolve => setTimeout(resolve, 2000 * attempt))
    }
    if (result.status !== 0) process.exit(result.status ?? 1)
  }
  console.log(`Verified ${asset.path} (${asset.bytes} bytes)`)
}
