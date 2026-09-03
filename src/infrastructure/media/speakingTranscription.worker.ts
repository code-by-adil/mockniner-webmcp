import { env, pipeline, type AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers'

export type TranscriptionRequest = { id: string; type: 'prepare' } | { id: string; type: 'transcribe'; samples: Float32Array }
export type TranscriptionReply =
  | { id: string; type: 'progress'; message: string }
  | { id: string; type: 'ready' }
  | { id: string; type: 'transcript'; text: string }
  | { id: string; type: 'error'; message: string }

type WorkerPort = {
  addEventListener: (type: 'message', listener: (event: MessageEvent<TranscriptionRequest>) => void) => void
  postMessage: (message: TranscriptionReply) => void
}
const port = globalThis as unknown as WorkerPort
env.allowLocalModels = false
// Use the portable CPU backend; no vendor-hosted recognition service or API key.
env.backends.onnx.wasm!.numThreads = globalThis.crossOriginIsolated
  ? Math.min(4, navigator.hardwareConcurrency || 1) : 1
let modelPromise: Promise<AutomaticSpeechRecognitionPipeline> | null = null
let busy = false

function getModel(id: string) {
  modelPromise ??= pipeline('automatic-speech-recognition', 'onnx-community/whisper-base.en', {
    device: 'wasm',
    dtype: 'q8',
    revision: 'fd8ac034a560b217176fae5215ca3fe05c9140f3',
    progress_callback: (progress) => {
      if (progress.status === 'progress') {
        port.postMessage({ id, type: 'progress', message: `Downloading speech recognition, ${Math.round(progress.progress)}%` })
      }
    },
  }).catch((error: unknown) => { modelPromise = null; throw error })
  return modelPromise
}

port.addEventListener('message', (event) => {
  const request = event.data
  if (busy) {
    port.postMessage({ id: request.id, type: 'error', message: 'Speech recognition is already processing an answer.' })
    return
  }
  busy = true
  void (async () => {
    const transcriber = await getModel(request.id)
    if (request.type === 'prepare') {
      port.postMessage({ id: request.id, type: 'ready' })
      return
    }
    const result = await transcriber(request.samples, { chunk_length_s: 30, stride_length_s: 5 })
    const text = (Array.isArray(result) ? result[0]?.text : result.text)?.trim() ?? ''
    if (!text) throw new Error('No speech was recognised. Check your microphone and record your answer again.')
    port.postMessage({ id: request.id, type: 'transcript', text })
  })().catch((error: unknown) => {
    port.postMessage({ id: request.id, type: 'error', message: error instanceof Error ? error.message : 'Local speech recognition failed.' })
  }).finally(() => { busy = false })
})
