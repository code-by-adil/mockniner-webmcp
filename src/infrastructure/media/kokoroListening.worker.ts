import type { KokoroTTS } from "kokoro-js";
import { loadKokoroModel } from "./kokoroModel";
import { audioPreparationFailure, withAudioTimeout, type AudioPreparation } from "./audioAssets";
import type { KokoroListeningAudio } from "@/domain/objectiveContent";
import { KOKORO_RUNTIME } from "./kokoroConfig";
import { createKokoroPlan, type KokoroPlanChunk } from "./kokoroScript";

export type KokoroListeningWorkerRequest =
  | {
      type: "generate";
      audio: KokoroListeningAudio;
      completedSequences: number[];
    }
  | { type: "persisted"; sequence: number };

type GeneratedKokoroChunk =
  | (Extract<KokoroPlanChunk, { kind: "speech" }> & {
      durationMs: number;
      audio: Blob;
    })
  | Extract<KokoroPlanChunk, { kind: "silence" }>;

export type KokoroListeningWorkerResponse =
  | { type: "planned"; totalChunks: number }
  | { type: "ready" }
  | { type: "preparation"; progress: AudioPreparation }
  | { type: "chunk"; chunk: GeneratedKokoroChunk }
  | { type: "complete" }
  | { type: "error"; message: string; failure?: AudioPreparation["error"] };

type WorkerPort = {
  addEventListener: (
    type: "message",
    listener: (event: MessageEvent<KokoroListeningWorkerRequest>) => void,
  ) => void;
  postMessage: (message: KokoroListeningWorkerResponse) => void;
};

const port = globalThis as unknown as WorkerPort;
const persistenceResolvers = new Map<number, () => void>();

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : "Kokoro could not generate the listening audio.";
}

async function loadModel(): Promise<KokoroTTS> {
  const model = await loadKokoroModel(progress => port.postMessage({ type: "preparation", progress }));
  port.postMessage({ type: "ready" });
  return model;
}

function publishChunkAndWait(chunk: GeneratedKokoroChunk): Promise<void> {
  return new Promise((resolve) => {
    persistenceResolvers.set(chunk.sequence, resolve);
    port.postMessage({ type: "chunk", chunk });
  });
}

port.addEventListener("message", (event) => {
  if (event.data.type === "persisted") {
    const resolve = persistenceResolvers.get(event.data.sequence);
    persistenceResolvers.delete(event.data.sequence);
    resolve?.();
    return;
  }
  const request = event.data;

  void (async () => {
    const chunks = await createKokoroPlan(request.audio);
    port.postMessage({ type: "planned", totalChunks: chunks.length });
    const completed = new Set(request.completedSequences);
    const missingSpeech = chunks.some(
      (chunk) => chunk.kind === "speech" && !completed.has(chunk.sequence),
    );
    const tts = missingSpeech ? await loadModel() : null;

    for (const chunk of chunks) {
      if (completed.has(chunk.sequence)) continue;

      if (chunk.kind === "silence") {
        await publishChunkAndWait({
          ...chunk,
          durationMs: chunk.durationMs,
        });
        continue;
      }

      if (!tts) throw new Error("Kokoro did not initialize.");
      const audio = await withAudioTimeout(tts.generate(chunk.text, {
        voice: chunk.voice,
        speed: KOKORO_RUNTIME.speed,
      }));
      const durationMs = Math.round(
        (audio.audio.length / audio.sampling_rate) * 1000,
      );
      await publishChunkAndWait({
        ...chunk,
        durationMs,
        audio: audio.toBlob(),
      });
    }

    port.postMessage({ type: "complete" });
  })().catch((error) => {
    port.postMessage({
      type: "error",
      message: errorMessage(error),
      failure: audioPreparationFailure(error),
    });
  });
});
