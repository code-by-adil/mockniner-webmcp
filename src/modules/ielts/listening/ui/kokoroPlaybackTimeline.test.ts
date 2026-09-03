import { describe, expect, it } from "vitest";
import type { StoredListeningAudioChunk } from "@/infrastructure/database/listeningAudioRepository";
import {
  chunkOffsetsMs,
  findPartChunkIndex,
  getInitialChunkPosition,
  getNextChunkIndex,
} from "./kokoroPlaybackTimeline";

function chunk(
  sequence: number,
  partId: number,
  kind: "speech" | "silence",
  durationMs: number,
): StoredListeningAudioChunk {
  const speech = kind === "speech";
  return {
    contentKey: "timeline-test",
    cacheVersion: "test-v1",
    sequence,
    partId,
    segmentIndex: sequence,
    kind,
    durationMs,
    mimeType: speech ? "audio/wav" : null,
    byteLength: speech ? 48 : 0,
    audio: speech ? new Uint8Array(48) : null,
  };
}

const chunks = [
  chunk(0, 1, "speech", 4_000),
  chunk(1, 1, "silence", 5_000),
  chunk(2, 1, "speech", 3_000),
  chunk(3, 2, "speech", 6_000),
  chunk(4, 3, "speech", 2_000),
  chunk(5, 4, "speech", 2_500),
];

describe("generated Listening playback timeline", () => {
  it("derives all timestamps from ordered chunk durations", () => {
    expect(chunkOffsetsMs(chunks)).toEqual([
      0,
      4_000,
      9_000,
      12_000,
      18_000,
      20_000,
    ]);
  });

  it("restores a cursor inside speech or explicit silence", () => {
    const offsets = chunkOffsetsMs(chunks);
    expect(getInitialChunkPosition(chunks, offsets, 6.25)).toEqual({
      index: 1,
      localMs: 2_250,
    });
    expect(getInitialChunkPosition(chunks, offsets, 13.5)).toEqual({
      index: 3,
      localMs: 1_500,
    });
  });

  it("resets an empty cache and clamps a cursor beyond a partial cache", () => {
    expect(getInitialChunkPosition([], [], 42)).toEqual({
      index: 0,
      localMs: 0,
    });
    expect(
      getInitialChunkPosition(chunks.slice(0, 2), [0, 4_000], 30),
    ).toEqual({ index: 1, localMs: 5_000 });
  });

  it("moves through available chunks and waits only while generation can continue", () => {
    expect(getNextChunkIndex(0, 2, "generating", 4)).toBe(1);
    expect(getNextChunkIndex(1, 2, "generating", 4)).toBe(2);
    expect(getNextChunkIndex(3, 4, "ready", 4)).toBeNull();
    expect(getNextChunkIndex(1, 2, "error", 4)).toBe(2);
    expect(getNextChunkIndex(3, 4, "error", 4)).toBeNull();
  });

  it("finds a part boundary without a separate timing document", () => {
    expect(findPartChunkIndex(chunks, 1)).toBe(0);
    expect(findPartChunkIndex(chunks, 2)).toBe(3);
    expect(findPartChunkIndex(chunks, 4)).toBe(5);
    expect(findPartChunkIndex(chunks, 5)).toBe(-1);
  });
});
