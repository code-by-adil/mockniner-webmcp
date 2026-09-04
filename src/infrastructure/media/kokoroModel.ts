import { AutoTokenizer, env, RawAudio, StyleTextToSpeech2Model, Tensor } from '@huggingface/transformers'
import { KokoroTTS, type GenerateOptions } from 'kokoro-js'
import { AUDIO_ASSET_BASE, AUDIO_ASSET_TOTAL, checkAudioSupport, withAudioTimeout, prepareAudioAssets, readAudioModel, readAudioAsset, requiredAudioAsset, type AudioPreparation } from './audioAssets'
import { KOKORO_RUNTIME } from './kokoroConfig'

// Adapted from kokoro-js 1.2.1 generate_from_ids (Apache-2.0). Keep upstream
// phonemization/tokenization; replace only its hard-coded remote voice loader.
class LocalKokoroTTS extends KokoroTTS {
  override async generate_from_ids(input_ids: Tensor, { voice = 'af_heart', speed = 1 }: GenerateOptions = {}): Promise<RawAudio> {
    const data = new Float32Array(await (await readAudioAsset(requiredAudioAsset(`voices/${voice}.bin`))).arrayBuffer())
    const offset = 256 * Math.min(Math.max(Number(input_ids.dims.at(-1)) - 2, 0), 509)
    const { waveform } = await this.model({ input_ids,
      style: new Tensor('float32', data.slice(offset, offset + 256), [1, 256]),
      speed: new Tensor('float32', [speed], [1]) })
    return new RawAudio(waveform.data as Float32Array, 24_000)
  }
}

export async function loadKokoroModel(report: (progress: AudioPreparation) => void): Promise<KokoroTTS> {
  await checkAudioSupport()
  await prepareAudioAssets(report)
  report({ stage: 'initializing', completedBytes: AUDIO_ASSET_TOTAL, totalBytes: AUDIO_ASSET_TOTAL, file: null, attempt: 1 })
  // The documented custom cache supplies only pinned files. No Hub/CDN fallback.
  env.allowLocalModels = true
  env.allowRemoteModels = false
  env.useBrowserCache = false
  env.useCustomCache = true
  env.localModelPath = AUDIO_ASSET_BASE
  env.customCache = {
    match: async (request: string) => {
      const prefix = AUDIO_ASSET_BASE + KOKORO_RUNTIME.modelId + '/'
      if (!request.startsWith(prefix)) return undefined
      const path = request.slice(prefix.length)
      if (!['config.json', 'tokenizer.json', 'tokenizer_config.json', 'onnx/model.onnx'].includes(path)) return undefined
      return path === 'onnx/model.onnx' ? readAudioModel() : readAudioAsset(requiredAudioAsset(path))
    },
    put: async () => {},
  }
  const runtimeUrls: string[] = []
  try {
    for (const extension of ['mjs', 'wasm']) {
      const response = await readAudioAsset(requiredAudioAsset(`runtime/ort-wasm-simd-threaded.jsep.${extension}`))
      runtimeUrls.push(URL.createObjectURL(new Blob([await response.blob()], { type: extension === 'mjs' ? 'text/javascript' : 'application/wasm' })))
    }
    env.backends.onnx.wasm!.wasmPaths = { mjs: runtimeUrls[0], wasm: runtimeUrls[1] }
    const [model, tokenizer] = await withAudioTimeout(Promise.all([
      StyleTextToSpeech2Model.from_pretrained(KOKORO_RUNTIME.modelId, { dtype: KOKORO_RUNTIME.dtype, device: KOKORO_RUNTIME.device }),
      AutoTokenizer.from_pretrained(KOKORO_RUNTIME.modelId),
    ]))
    report({ stage: 'ready', completedBytes: AUDIO_ASSET_TOTAL, totalBytes: AUDIO_ASSET_TOTAL, file: null, attempt: 1 })
    return new LocalKokoroTTS(model, tokenizer)
  } finally {
    for (const url of runtimeUrls) URL.revokeObjectURL(url)
  }
}
