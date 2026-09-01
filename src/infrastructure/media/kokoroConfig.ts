export const KOKORO_RUNTIME = {
  modelId: "onnx-community/Kokoro-82M-v1.0-ONNX",
  dtype: "fp32",
  device: "webgpu",
  speed: 1,
  maxPhonemes: 500,
  cacheRevision: 3,
} as const;

export const KOKORO_CACHE_VERSION = [
  "kokoro",
  `r${KOKORO_RUNTIME.cacheRevision}`,
  KOKORO_RUNTIME.modelId,
  KOKORO_RUNTIME.dtype,
  KOKORO_RUNTIME.device,
  `speed${KOKORO_RUNTIME.speed}`,
  `phonemes${KOKORO_RUNTIME.maxPhonemes}`,
].join(":");
