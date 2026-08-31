import { KokoroTTS } from "kokoro-js";
import type { KokoroListeningAudio } from "@/domain/objectiveContent";
import { createKokoroPlan, type KokoroPlanChunk } from "./kokoroScript";

export type KokoroWorkerRequest = {
  type: "generate";
  audio: KokoroListeningAudio;
  completedSequences: number[];
};

type GeneratedKokoroChunk =
  | (Extract<KokoroPlanChunk, { kind: "speech" }> & {
      durationMs: number;
      audio: Blob;
    })
  | Extract<KokoroPlanChunk, { kind: "silence" }>;

export type KokoroWorkerResponse =
  | { type: "planned"; totalChunks: number }
  | { type: "ready" }
  | { type: "chunk"; chunk: GeneratedKokoroChunk }
  | { type: "complete" }
  | { type: "error"; message: string };

type WebGpuNavigator = Navigator & {
  gpu?: { requestAdapter: () => Promise<unknown | null> };
};

type WorkerPort = {
  addEventListener: (
    type: "message",
    listener: (event: MessageEvent<KokoroWorkerRequest>) => void,
  ) => void;
  postMessage: (message: KokoroWorkerResponse) => void;
};

const port = globalThis as unknown as WorkerPort;

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : "Kokoro could not generate the listening audio.";
}

async function loadModel(): Promise<KokoroTTS> {
  const gpu = (navigator as WebGpuNavigator).gpu;
  if (!gpu || !(await gpu.requestAdapter())) {
    throw new Error(
      "WebGPU is unavailable in this browser. Open the app in a current WebGPU-capable Chrome or Edge browser.",
    );
  }
  const model = await KokoroTTS.from_pretrained(
    "onnx-community/Kokoro-82M-v1.0-ONNX",
    { dtype: "fp32", device: "webgpu" },
  );
  port.postMessage({ type: "ready" });
  return model;
}

port.addEventListener("message", (event) => {
  if (event.data.type !== "generate") return;
  const request = event.data;

  void (async () => {
    const chunks = createKokoroPlan(request.audio);
    port.postMessage({ type: "planned", totalChunks: chunks.length });
    const completed = new Set(request.completedSequences);
    const missingSpeech = chunks.some(
      (chunk) => chunk.kind === "speech" && !completed.has(chunk.sequence),
    );
    const tts = missingSpeech ? await loadModel() : null;

    for (const chunk of chunks) {
      if (completed.has(chunk.sequence)) continue;

      if (chunk.kind === "silence") {
        port.postMessage({
          type: "chunk",
          chunk: {
            ...chunk,
            durationMs: chunk.durationMs,
          },
        });
        continue;
      }

      if (!tts) throw new Error("Kokoro did not initialize.");
      const audio = await tts.generate(chunk.text, {
        voice: chunk.voice,
        speed: 1,
      });
      const durationMs = Math.round(
        (audio.audio.length / audio.sampling_rate) * 1000,
      );
      port.postMessage({
        type: "chunk",
        chunk: {
          ...chunk,
          durationMs,
          audio: audio.toBlob(),
        },
      });
    }

    port.postMessage({ type: "complete" });
  })().catch((error) => {
    port.postMessage({
      type: "error",
      message: errorMessage(error),
    });
  });
});
