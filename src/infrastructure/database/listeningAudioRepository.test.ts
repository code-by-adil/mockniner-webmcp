import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { SQLocal } from "sqlocal";
import listeningJson from "@/content/listening.json";
import { migrateDatabase } from "./migrations";
import { saveAndActivateContent } from "./contentRepository";
import {
  listListeningAudioChunks,
  saveListeningAudioChunk,
} from "./listeningAudioRepository";
import { parseObjectiveContentDocument } from "@/domain/objectiveContent";

let database: SQLocal;

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
      sequence: 0,
      partId: 1,
      segmentIndex: 0,
      kind: "speech",
      durationMs: 1_250,
      audio: new Blob([new Uint8Array([1, 2, 3])], { type: "audio/wav" }),
    });
    await saveListeningAudioChunk(database, {
      contentKey: "local-listening-v1",
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
    expect(Array.from(chunks[0]?.audio ?? [])).toEqual([1, 2, 3]);
    expect(chunks[1]?.audio).toBeNull();
  });

  it("rejects a speech row without audio", async () => {
    // @ts-expect-error Exercise the runtime boundary with malformed worker data.
    await expect(saveListeningAudioChunk(database, {
      contentKey: "local-listening-v1",
      sequence: 0,
      partId: 1,
      segmentIndex: 0,
      kind: "speech",
      durationMs: 1_000,
    })).rejects.toThrow("must contain audio");
  });
});
