import type { KokoroTTS } from 'kokoro-js'
import { loadKokoroModel } from './kokoroModel'
import type { AudioPreparation } from './audioAssets'
import { RawAudio } from '@huggingface/transformers'
import { KOKORO_RUNTIME } from './kokoroConfig'
import { splitKokoroSpeech } from './kokoroScript'

export type KokoroSpeakingWorkerRequest = {
  id: string
  text: string
}

export type KokoroSpeakingWorkerResponse =
  | { id: string; type: 'audio'; audio: Blob }
  | { id: string; type: 'preparation'; progress: AudioPreparation }
  | { id: string; type: 'error'; message: string }

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

function getModel(id: string): Promise<KokoroTTS> {
  if (!modelPromise) {
    modelPromise = loadKokoroModel(progress => port.postMessage({ id, type: 'preparation', progress })).catch((error) => {
      modelPromise = null
      throw error
    })
  }
  return modelPromise
}

port.addEventListener('message', (event) => {
  const request = event.data
  void (async () => {
    const tts = await getModel(request.id)
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
