import manifest from './audioAssetManifest.json'

export const AUDIO_ASSET_BASE = `/audio-assets/${manifest.version}/`
export const AUDIO_ASSET_CACHE = `mockniner-audio-${manifest.version}`
export type AudioPreparation = {
  stage: 'checking' | 'downloading' | 'verifying' | 'initializing' | 'ready' | 'error'
  completedBytes: number
  totalBytes: number
  file: string | null
  attempt: number
  error?: { code: string; file: string | null; retryable: boolean; message: string }
}
export type AudioAsset = typeof manifest.assets[number]
export const AUDIO_ASSET_TOTAL = manifest.assets.reduce((sum, file) => sum + file.bytes, 0)
export const initialAudioPreparation = (): AudioPreparation => ({ stage: 'checking', completedBytes: 0, totalBytes: AUDIO_ASSET_TOTAL, file: null, attempt: 1 })

export class AudioAssetError extends Error {
  code: string
  file: string | null
  retryable: boolean
  constructor(code: string, file: string | null, retryable: boolean, message: string) {
    super(message)
    this.name = 'AudioAssetError'
    this.code = code; this.file = file; this.retryable = retryable
  }
}

export function audioPreparationFailure(error: unknown): NonNullable<AudioPreparation['error']> {
  return error instanceof AudioAssetError
    ? { code: error.code, file: error.file, retryable: error.retryable, message: error.message }
    : { code: 'AUDIO_INITIALIZATION_FAILED', file: null, retryable: true,
      message: error instanceof Error ? error.message : 'Audio preparation stopped. Try again.' }
}

export async function checkAudioSupport(): Promise<void> {
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown | null> } }).gpu
  if (!gpu || !await gpu.requestAdapter()) throw new AudioAssetError('WEBGPU_UNAVAILABLE', null, false, 'WebGPU is unavailable. Open the app in a current WebGPU-capable Chrome or Edge browser.')
}

export async function withAudioTimeout<T>(operation: Promise<T>): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([operation, new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(() => reject(new AudioAssetError('AUDIO_PROCESSING_STALLED', null, true, 'The practice voice stopped responding. Retry audio preparation.')), 180_000)
    })])
  } finally { clearTimeout(timeout) }
}

// One cache owns model, voice and runtime files. Only verified complete files
// enter it. Existing exam answers and generated WAVs live separately in SQLite.
const verified = new Set<string>()
export async function readAudioAsset(asset: AudioAsset, progress: (bytes: number, stage: AudioPreparation['stage'], attempt: number) => void = () => {}): Promise<Response> {
  const url = new URL(AUDIO_ASSET_BASE + asset.path, globalThis.location.origin).href
  const run = async () => {
    let cache: Cache
    try { cache = await caches.open(AUDIO_ASSET_CACHE) }
    catch { throw new AudioAssetError('AUDIO_CACHE_UNAVAILABLE', asset.path, false, 'The browser cannot store the audio download. Allow site storage, then try again.') }
    const cached = await cache.match(url)
    if (cached) {
      if (verified.has(asset.path) || await validBytes(await cached.clone().arrayBuffer(), asset)) {
        verified.add(asset.path)
        progress(asset.bytes, 'checking', 1)
        return cached
      }
      await cache.delete(url)
      verified.delete(asset.path)
    }
    for (let attempt = 1; attempt <= 3; attempt++) {
      const controller = new AbortController()
      let timeout: ReturnType<typeof setTimeout>
      const armTimeout = () => { clearTimeout(timeout); timeout = setTimeout(() => controller.abort(), 30_000) }
      try {
        progress(0, 'downloading', attempt)
        armTimeout()
        const response = await fetch(url, { signal: controller.signal, cache: 'no-cache' })
        if (!response.ok) throw new AudioAssetError('AUDIO_ASSET_HTTP', asset.path, response.status === 408 || response.status === 429 || response.status >= 500,
          `The audio download is unavailable (HTTP ${response.status}). ${response.status === 404 ? 'This file is missing from the deployment.' : 'Try again shortly.'}`)
        if (!response.body) throw new AudioAssetError('AUDIO_ASSET_EMPTY', asset.path, true, 'The audio download was empty. Try again.')
        const reader = response.body.getReader()
        const bytes = new Uint8Array(asset.bytes)
        let received = 0
        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          armTimeout()
          if (received + value.length > asset.bytes) {
            await reader.cancel()
            throw new AudioAssetError('AUDIO_ASSET_INTEGRITY', asset.path, true, 'The audio download did not match its expected size. Try again.')
          }
          bytes.set(value, received); received += value.length
          progress(received, 'downloading', attempt)
        }
        clearTimeout(timeout!)
        progress(received, 'verifying', attempt)
        if (received !== asset.bytes || !await validBytes(bytes.buffer, asset)) throw new AudioAssetError('AUDIO_ASSET_INTEGRITY', asset.path, true, 'The audio download was incomplete or damaged. Try again.')
        const complete = new Response(bytes, { headers: { 'Content-Type': asset.path.endsWith('.mjs') ? 'text/javascript' : asset.path.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream', 'Content-Length': String(asset.bytes) } })
        try { await cache.put(url, complete) }
        catch { throw new AudioAssetError('AUDIO_CACHE_FULL', asset.path, false, 'The browser could not save the audio download. Free some device storage, then try again. Your answers are still saved.') }
        verified.add(asset.path)
        return (await cache.match(url))!
      } catch (error) {
        const failure = error instanceof AudioAssetError ? error : new AudioAssetError(controller.signal.aborted ? 'AUDIO_DOWNLOAD_STALLED' : 'AUDIO_NETWORK_FAILED', asset.path, true,
          controller.signal.aborted ? 'The audio download stopped receiving data. Check your connection and try again.' : 'The audio download lost its connection. Check your connection and try again.')
        if (!failure.retryable || attempt === 3) throw failure
        await new Promise(resolve => setTimeout(resolve, 500 * 2 ** (attempt - 1)))
      } finally { clearTimeout(timeout!) }
    }
    throw new Error('Audio download did not complete.')
  }
  // Preparation, Listening and Speaking can overlap. Serialize each file across
  // workers/tabs and recheck the cache after taking the lock.
  return navigator.locks ? navigator.locks.request(`audio:${url}`, run) : run()
}

async function validBytes(bytes: ArrayBuffer, asset: AudioAsset): Promise<boolean> {
  if (bytes.byteLength !== asset.bytes) return false
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
  return Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('') === asset.sha256
}

export async function prepareAudioAssets(report: (progress: AudioPreparation) => void): Promise<void> {
  let completedBytes = 0
  let lastReport = 0
  report(initialAudioPreparation())
  for (const asset of manifest.assets) {
    await readAudioAsset(asset, (bytes, stage, attempt) => {
      const now = performance.now()
      if (stage === 'downloading' && bytes > 0 && bytes < asset.bytes && now - lastReport < 100) return
      lastReport = now
      report({ stage, completedBytes: completedBytes + bytes, totalBytes: AUDIO_ASSET_TOTAL, file: asset.path, attempt })
    })
    completedBytes += asset.bytes
  }
  report({ stage: 'ready', completedBytes, totalBytes: AUDIO_ASSET_TOTAL, file: null, attempt: 1 })
}

export function requiredAudioAsset(path: string): AudioAsset {
  const asset = manifest.assets.find(file => file.path === path)
  if (!asset) throw new AudioAssetError('AUDIO_ASSET_UNKNOWN', path, false, 'This audio file is not part of the installed version.')
  return asset
}

export async function readAudioModel(): Promise<Response> {
  const parts: Blob[] = []
  for (const path of manifest.model.parts) parts.push(await (await readAudioAsset(requiredAudioAsset(path))).blob())
  return new Response(new Blob(parts), { headers: { 'Content-Length': String(manifest.model.bytes) } })
}
