import { useCallback, useEffect, useState } from "react";
import type { ListeningContentDocument } from "@/domain/objectiveContent";
import type { StoredListeningAudioChunk } from "@/infrastructure/database/listeningAudioRepository";
import type {
  KokoroWorkerRequest,
  KokoroWorkerResponse,
} from "@/infrastructure/media/kokoro.worker";
import { KOKORO_CACHE_VERSION } from "@/infrastructure/media/kokoroConfig";

type ListeningAudioState = {
  contentKey: string;
  phase: "loading" | "generating" | "ready" | "error";
  hydrated: boolean;
  chunks: StoredListeningAudioChunk[];
  totalChunks: number | null;
  error: string | null;
};

export type ListeningAudioSession = Omit<ListeningAudioState, "contentKey"> & {
  completedChunks: number;
  readyToPlay: boolean;
  retry: () => void;
};

function initialState(document: ListeningContentDocument): ListeningAudioState {
  return {
    contentKey: document.contentKey,
    phase: document.audio.type === "bundled" ? "ready" : "loading",
    hydrated: document.audio.type === "bundled",
    chunks: [],
    totalChunks: document.audio.type === "bundled" ? 1 : null,
    error: null,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : "Kokoro could not prepare this listening recording.";
}

export function useListeningAudio(
  document: ListeningContentDocument,
): ListeningAudioSession {
  const [state, setState] = useState(() => initialState(document));
  const [run, setRun] = useState(0);
  const current = state.contentKey === document.contentKey
    ? state
    : initialState(document);

  useEffect(() => {
    if (document.audio.type === "bundled") return;
    const audio = document.audio;

    let active = true;
    let failed = false;
    let worker: Worker | null = null;
    let persistence = Promise.resolve();

    const update = (
      transform: (value: ListeningAudioState) => ListeningAudioState,
    ): void => {
      if (!active || failed) return;
      setState((value) => value.contentKey === document.contentKey
        ? transform(value)
        : value);
    };

    const fail = (error: unknown): void => {
      if (!active || failed) return;
      failed = true;
      worker?.terminate();
      setState((value) => value.contentKey === document.contentKey
        ? { ...value, phase: "error", error: errorMessage(error) }
        : value);
    };

    void (async () => {
      const [{ getLocalDatabase }, repository] = await Promise.all([
        import("@/infrastructure/database/client"),
        import("@/infrastructure/database/listeningAudioRepository"),
      ]);
      const database = await getLocalDatabase();
      const stored = await repository.prepareListeningAudioCache(
        database,
        document.contentKey,
        KOKORO_CACHE_VERSION,
      );
      if (!active) return;

      setState({
        contentKey: document.contentKey,
        phase: "loading",
        hydrated: true,
        chunks: stored,
        totalChunks: null,
        error: null,
      });

      worker = new Worker(
        new URL("../infrastructure/media/kokoro.worker.ts", import.meta.url),
        { type: "module" },
      );
      worker.addEventListener(
        "message",
        (event: MessageEvent<KokoroWorkerResponse>) => {
          const response = event.data;
          if (response.type === "planned") {
            update((value) => ({
              ...value,
              totalChunks: response.totalChunks,
            }));
            return;
          }
          if (response.type === "ready") {
            update((value) => ({ ...value, phase: "generating" }));
            return;
          }
          if (response.type === "chunk") {
            persistence = persistence.then(async () => {
              const common = {
                contentKey: document.contentKey,
                cacheVersion: KOKORO_CACHE_VERSION,
                sequence: response.chunk.sequence,
                partId: response.chunk.partId,
                segmentIndex: response.chunk.segmentIndex,
                durationMs: response.chunk.durationMs,
              };
              const storedChunk = response.chunk.kind === "speech"
                ? await repository.saveListeningAudioChunk(database, {
                    ...common,
                    kind: "speech",
                    audio: response.chunk.audio,
                  })
                : await repository.saveListeningAudioChunk(database, {
                    ...common,
                    kind: "silence",
                  });
              update((value) => {
                if (value.chunks.some((chunk) =>
                  chunk.sequence === response.chunk.sequence)) return value;
                return {
                  ...value,
                  phase: "generating",
                  chunks: [...value.chunks, storedChunk],
                };
              });
              worker?.postMessage({
                type: "persisted",
                sequence: response.chunk.sequence,
              } satisfies KokoroWorkerRequest);
            });
            void persistence.catch(fail);
            return;
          }
          if (response.type === "complete") {
            void persistence.then(() => {
              if (!active || failed) return;
              worker?.terminate();
              update((value) => ({ ...value, phase: "ready", error: null }));
            }, fail);
            return;
          }
          fail(new Error(response.message));
        },
      );
      worker.addEventListener("error", (event) => {
        fail(new Error(event.message || "The Kokoro worker stopped unexpectedly."));
      });
      const request: KokoroWorkerRequest = {
        type: "generate",
        audio,
        completedSequences: stored.map((chunk) => chunk.sequence),
      };
      worker.postMessage(request);
    })().catch(fail);

    return () => {
      active = false;
      worker?.terminate();
    };
  }, [document, run]);

  const retry = useCallback(() => {
    setState((value) => value.contentKey === document.contentKey
      ? { ...value, phase: "loading", error: null }
      : value);
    setRun((value) => value + 1);
  }, [document.contentKey]);

  return {
    phase: current.phase,
    hydrated: current.hydrated,
    chunks: current.chunks,
    totalChunks: current.totalChunks,
    error: current.error,
    completedChunks: current.chunks.length,
    readyToPlay:
      document.audio.type === "bundled" ||
      current.phase === "ready" ||
      (
        current.chunks.length >= 2 &&
        current.chunks.some((chunk) => chunk.kind === "speech")
      ),
    retry,
  };
}
