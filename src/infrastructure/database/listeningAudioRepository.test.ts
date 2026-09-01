import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { SQLocal } from "sqlocal";
import listeningJson from "@/content/listening.json";
import { migrateDatabase } from "./migrations";
import { saveAndActivateContent } from "./contentRepository";
import {
  listListeningAudioChunks,
  prepareListeningAudioCache,
  saveListeningAudioChunk,
} from "./listeningAudioRepository";
import { parseObjectiveContentDocument } from "@/domain/objectiveContent";
import { KOKORO_CACHE_VERSION } from "@/infrastructure/media/kokoroConfig";

let database: SQLocal;

function wavBlob(): Blob {
  const sampleCount = 4;
  const sampleRate = 24_000;
  const bytes = new Uint8Array(44 + sampleCount * 4);
  const view = new DataView(bytes.buffer);
  const writeAscii = (offset: number, value: string) => {
    bytes.set(new TextEncoder().encode(value), offset);
  };
  writeAscii(0, "RIFF");
  view.setUint32(4, bytes.byteLength - 8, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 3, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 4, true);
  view.setUint16(32, 4, true);
  view.setUint16(34, 32, true);
  writeAscii(36, "data");
  view.setUint32(40, sampleCount * 4, true);
  return new Blob([bytes], { type: "audio/wav" });
}

function fakeWavBlob(): Blob {
  const bytes = new Uint8Array(44);
  bytes.set(new TextEncoder().encode("RIFF"), 0);
  bytes.set(new TextEncoder().encode("WAVE"), 8);
  return new Blob([bytes], { type: "audio/wav" });
}

beforeAll(() => {
  vi.stubGlobal("Worker", class TestWorker {});
});

afterAll(() => {
  vi.unstubAllGlobals();
});

beforeEach(async () => {
  let resolveConnected!: () => void;
  const connected = new Promise<void>((resolve) => {
    resolveConnected = resolve;
  });
  database = new SQLocal({
    databasePath: ":memory:",
    onInit: (sql) => [sql`PRAGMA foreign_keys = ON`],
    onConnect: () => resolveConnected(),
  });
  await connected;
  await migrateDatabase(database);
  await saveAndActivateContent(
    database,
    parseObjectiveContentDocument(listeningJson),
  );
});

afterEach(async () => {
  await database.destroy(true);
});

describe("Listening audio chunk repository", () => {
  it("stores speech and silence in deterministic playback order", async () => {
    await saveListeningAudioChunk(database, {
      contentKey: "local-listening-v1",
      cacheVersion: KOKORO_CACHE_VERSION,
      sequence: 0,
      partId: 1,
      segmentIndex: 0,
      kind: "speech",
      durationMs: 1_250,
      audio: wavBlob(),
    });
    await saveListeningAudioChunk(database, {
      contentKey: "local-listening-v1",
      cacheVersion: KOKORO_CACHE_VERSION,
      sequence: 1,
      partId: 1,
      segmentIndex: 1,
      kind: "silence",
      durationMs: 3_000,
    });

    const chunks = await listListeningAudioChunks(database, "local-listening-v1");
    expect(chunks.map(({ sequence, kind, durationMs }) => ({ sequence, kind, durationMs })))
      .toEqual([
        { sequence: 0, kind: "speech", durationMs: 1_250 },
        { sequence: 1, kind: "silence", durationMs: 3_000 },
      ]);
    expect(chunks[0]?.byteLength).toBe(60);
    expect(chunks[1]?.audio).toBeNull();
  });

  it("rejects a speech row without audio", async () => {
    // @ts-expect-error Exercise the runtime boundary with malformed worker data.
    await expect(saveListeningAudioChunk(database, {
      contentKey: "local-listening-v1",
      cacheVersion: KOKORO_CACHE_VERSION,
      sequence: 0,
      partId: 1,
      segmentIndex: 0,
      kind: "speech",
      durationMs: 1_000,
    })).rejects.toThrow("must contain audio");
  });

  it("rejects a WAV-shaped blob that is not Kokoro float32 audio", async () => {
    await expect(saveListeningAudioChunk(database, {
      contentKey: "local-listening-v1",
      cacheVersion: KOKORO_CACHE_VERSION,
      sequence: 0,
      partId: 1,
      segmentIndex: 0,
      kind: "speech",
      durationMs: 1_000,
      audio: fakeWavBlob(),
    })).rejects.toThrow("is not valid Kokoro audio");
  });

  it("drops a stale cache version before resuming generation", async () => {
    await saveListeningAudioChunk(database, {
      contentKey: "local-listening-v1",
      cacheVersion: "old-planner",
      sequence: 0,
      partId: 1,
      segmentIndex: 0,
      kind: "speech",
      durationMs: 1_000,
      audio: wavBlob(),
    });

    await expect(prepareListeningAudioCache(
      database,
      "local-listening-v1",
      KOKORO_CACHE_VERSION,
    )).resolves.toEqual([]);
  });

  it("keeps only the valid contiguous prefix of cached WAV chunks", async () => {
    await saveListeningAudioChunk(database, {
      contentKey: "local-listening-v1",
      cacheVersion: KOKORO_CACHE_VERSION,
      sequence: 0,
      partId: 1,
      segmentIndex: 0,
      kind: "speech",
      durationMs: 1_000,
      audio: wavBlob(),
    });
    const malformedAudio = new Uint8Array(await fakeWavBlob().arrayBuffer());
    await database.sql`
      INSERT INTO listening_audio_chunks (
        content_key, cache_version, sequence, part_id, segment_index, kind,
        duration_ms, mime_type, byte_length, audio, created_at
      ) VALUES (
        'local-listening-v1', ${KOKORO_CACHE_VERSION}, 1, 1, 1, 'speech',
        1000, 'audio/wav', ${malformedAudio.byteLength}, ${malformedAudio},
        ${new Date().toISOString()}
      )
    `;

    const cached = await prepareListeningAudioCache(
      database,
      "local-listening-v1",
      KOKORO_CACHE_VERSION,
    );

    expect(cached.map((chunk) => chunk.sequence)).toEqual([0]);
    await expect(listListeningAudioChunks(database, "local-listening-v1"))
      .resolves.toHaveLength(1);
  });

  it("prunes inactive generated audio while retaining the installed document", async () => {
    await saveListeningAudioChunk(database, {
      contentKey: "local-listening-v1",
      cacheVersion: KOKORO_CACHE_VERSION,
      sequence: 0,
      partId: 1,
      segmentIndex: 0,
      kind: "speech",
      durationMs: 1_000,
      audio: wavBlob(),
    });

    const replacementKey = "agent-listening-cache-v2";
    await saveAndActivateContent(
      database,
      parseObjectiveContentDocument({
        ...listeningJson,
        contentKey: replacementKey,
        source: "agent",
      }),
    );

    await expect(listListeningAudioChunks(database, "local-listening-v1"))
      .resolves.toEqual([]);
    const retained = await database.sql<{ count: number }>`
      SELECT COUNT(*) AS count
      FROM content_documents
      WHERE content_key = 'local-listening-v1'
    `;
    expect(retained[0]?.count).toBe(1);
    await expect(saveListeningAudioChunk(database, {
      contentKey: "local-listening-v1",
      cacheVersion: KOKORO_CACHE_VERSION,
      sequence: 1,
      partId: 1,
      segmentIndex: 1,
      kind: "silence",
      durationMs: 500,
    })).rejects.toThrow("is no longer active");
  });
});
