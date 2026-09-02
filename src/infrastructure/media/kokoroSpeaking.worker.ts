import { KokoroTTS } from 'kokoro-js'
import { RawAudio } from '@huggingface/transformers'
import { KOKORO_RUNTIME } from './kokoroConfig'
import { splitKokoroSpeech } from './kokoroScript'

export type KokoroSpeakingWorkerRequest = {
  id: string
  text: string
}

export type KokoroSpeakingWorkerResponse =
  | { id: string; type: 'audio'; audio: Blob }
  | { id: string; type: 'error'; message: string }

type WebGpuNavigator = Navigator & {
  gpu?: { requestAdapter: () => Promise<unknown | null> }
}

type WorkerPort = {
  addEventListener: (
    type: 'message',
    listener: (event: MessageEvent<KokoroSpeakingWorkerRequest>) => void,
  ) => void
  postMessage: (message: KokoroSpeakingWorkerResponse) => void
}

const port = globalThis as unknown as WorkerPort
let modelPromise: Promise<KokoroTTS> | null = null

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : 'Kokoro could not generate the examiner voice.'
}

async function loadModel(): Promise<KokoroTTS> {
  const gpu = (navigator as WebGpuNavigator).gpu
  if (!gpu || !(await gpu.requestAdapter())) {
    throw new Error(
      'WebGPU is unavailable. Open the app in a current WebGPU-capable Chrome or Edge browser.',
    )
  }
  return KokoroTTS.from_pretrained(KOKORO_RUNTIME.modelId, {
    dtype: KOKORO_RUNTIME.dtype,
    device: KOKORO_RUNTIME.device,
  })
}

function getModel(): Promise<KokoroTTS> {
  if (!modelPromise) {
    modelPromise = loadModel().catch((error) => {
      modelPromise = null
      throw error
    })
  }
  return modelPromise
}

port.addEventListener('message', (event) => {
  const request = event.data
  void (async () => {
    const tts = await getModel()
    const chunks = await splitKokoroSpeech(request.text, 'bm_george')
    if (!chunks.length) throw new Error('The examiner question is empty.')
    const audioChunks = []
    for (const text of chunks) audioChunks.push(await tts.generate(text, { voice: 'bm_george', speed: KOKORO_RUNTIME.speed }))
    const samples = new Float32Array(audioChunks.reduce((size, chunk) => size + chunk.audio.length, 0))
    let offset = 0
    for (const chunk of audioChunks) { samples.set(chunk.audio, offset); offset += chunk.audio.length }
    const audio = new RawAudio(samples, audioChunks[0]!.sampling_rate)
    port.postMessage({ id: request.id, type: 'audio', audio: audio.toBlob() })
  })().catch((error) => {
    port.postMessage({
      id: request.id,
      type: 'error',
      message: errorMessage(error),
    })
  })
})
