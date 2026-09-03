import type { StoredListeningAudioChunk } from "@/infrastructure/database/listeningAudioRepository";

export function chunkOffsetsMs(
  chunks: StoredListeningAudioChunk[],
): number[] {
  const offsets: number[] = [];
  let nextOffset = 0;
  for (const chunk of chunks) {
    offsets.push(nextOffset);
    nextOffset += chunk.durationMs;
  }
  return offsets;
}

export function getInitialChunkPosition(
  chunks: StoredListeningAudioChunk[],
  offsetsMs: number[],
  currentTimeSec: number,
): { index: number; localMs: number } {
  if (chunks.length === 0) return { index: 0, localMs: 0 };
  const targetMs = Math.max(0, currentTimeSec * 1000);
  let index = chunks.findIndex((chunk, chunkIndex) => {
    const start = offsetsMs[chunkIndex] ?? 0;
    return targetMs >= start && targetMs < start + chunk.durationMs;
  });
  if (index === -1) index = chunks.length - 1;
  return {
    index,
    localMs: Math.min(
      chunks[index]!.durationMs,
      Math.max(0, targetMs - (offsetsMs[index] ?? 0)),
    ),
  };
}

export function getNextChunkIndex(
  currentIndex: number,
  availableChunks: number,
  phase: "loading" | "generating" | "ready" | "error",
  totalChunks: number | null,
): number | null {
  const nextIndex = currentIndex + 1;
  if (nextIndex < availableChunks) return nextIndex;
  // A failed generator can resume. Keep the cursor on the next expected chunk
  // so retry can continue playback instead of stranding it on an ended chunk.
  if (phase !== "ready" && (totalChunks == null || nextIndex < totalChunks)) {
    return nextIndex;
  }
  return null;
}

export function findPartChunkIndex(
  chunks: StoredListeningAudioChunk[],
  partId: number,
): number {
  return chunks.findIndex((chunk) => chunk.partId === partId);
}
