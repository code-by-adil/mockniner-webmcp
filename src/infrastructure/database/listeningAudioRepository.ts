import type { SQLocal } from "sqlocal";

export type StoredListeningAudioChunk = {
  contentKey: string;
  cacheVersion: string;
  sequence: number;
  partId: number;
  segmentIndex: number;
  kind: "speech" | "silence";
  durationMs: number;
  mimeType: string | null;
  byteLength: number;
  audio: Uint8Array<ArrayBuffer> | null;
};

type SaveListeningAudioChunkBase = Pick<
  StoredListeningAudioChunk,
  "contentKey" | "cacheVersion" | "sequence" | "partId" | "segmentIndex" | "durationMs"
>;

export type SaveListeningAudioChunkInput =
  | (SaveListeningAudioChunkBase & { kind: "speech"; audio: Blob })
  | (SaveListeningAudioChunkBase & { kind: "silence" });

export async function listListeningAudioChunks(
  database: SQLocal,
  contentKey: string,
): Promise<StoredListeningAudioChunk[]> {
  return database.sql<StoredListeningAudioChunk>`
    SELECT
      content_key AS contentKey,
      cache_version AS cacheVersion,
      sequence,
      part_id AS partId,
      segment_index AS segmentIndex,
      kind,
      duration_ms AS durationMs,
      mime_type AS mimeType,
      byte_length AS byteLength,
      audio
    FROM listening_audio_chunks
    WHERE content_key = ${contentKey}
    ORDER BY sequence
  `;
}

export async function prepareListeningAudioCache(
  database: SQLocal,
  contentKey: string,
  cacheVersion: string,
): Promise<StoredListeningAudioChunk[]> {
  await database.sql`
    DELETE FROM listening_audio_chunks
    WHERE content_key = ${contentKey} AND cache_version <> ${cacheVersion}
  `;
  const chunks = await listListeningAudioChunks(database, contentKey);
  const invalidIndex = chunks.findIndex((chunk, index) =>
    chunk.cacheVersion !== cacheVersion ||
    chunk.sequence !== index ||
    !isValidListeningAudioChunk(chunk)
  );
  if (invalidIndex < 0) return chunks;
  await deleteListeningAudioChunksFrom(database, contentKey, invalidIndex);
  return chunks.slice(0, invalidIndex);
}

async function deleteListeningAudioChunksFrom(
  database: SQLocal,
  contentKey: string,
  sequence: number,
): Promise<void> {
  await database.sql`
    DELETE FROM listening_audio_chunks
    WHERE content_key = ${contentKey} AND sequence >= ${sequence}
  `;
}

function isValidListeningAudioChunk(
  chunk: StoredListeningAudioChunk,
): boolean {
  if (chunk.durationMs <= 0) return false;
  if (chunk.kind === "silence") {
    return chunk.audio == null && chunk.mimeType == null && chunk.byteLength === 0;
  }
  const audio = chunk.audio;
  if (
    chunk.mimeType !== "audio/wav" ||
    !audio ||
    chunk.byteLength !== audio.byteLength ||
    chunk.byteLength <= 44
  ) return false;

  const ascii = (start: number, length: number) =>
    String.fromCharCode(...audio.slice(start, start + length));
  const header = new DataView(audio.buffer, audio.byteOffset, audio.byteLength);
  const dataLength = header.getUint32(40, true);
  const sampleRate = header.getUint32(24, true);
  return (
    ascii(0, 4) === "RIFF" &&
    header.getUint32(4, true) === audio.byteLength - 8 &&
    ascii(8, 4) === "WAVE" &&
    ascii(12, 4) === "fmt " &&
    header.getUint32(16, true) === 16 &&
    header.getUint16(20, true) === 3 &&
    header.getUint16(22, true) === 1 &&
    sampleRate > 0 &&
    header.getUint32(28, true) === sampleRate * 4 &&
    header.getUint16(32, true) === 4 &&
    header.getUint16(34, true) === 32 &&
    ascii(36, 4) === "data" &&
    dataLength > 0 &&
    dataLength % 4 === 0 &&
    dataLength === audio.byteLength - 44
  );
}

export async function saveListeningAudioChunk(
  database: SQLocal,
  input: SaveListeningAudioChunkInput,
): Promise<StoredListeningAudioChunk> {
  const isSpeech = input.kind === "speech";
  if (isSpeech && !(input.audio instanceof Blob)) {
    throw new Error("A generated speech chunk must contain audio.");
  }
  if (!isSpeech && "audio" in input) {
    throw new Error("A silence chunk cannot contain audio.");
  }
  const audioBlob = isSpeech ? input.audio : null;
  const audioBytes = audioBlob
    ? new Uint8Array(await audioBlob.arrayBuffer())
    : null;
  const mimeType = audioBlob?.type || null;
  const byteLength = audioBytes?.byteLength ?? 0;
  const stored: StoredListeningAudioChunk = {
    ...input,
    durationMs: Math.max(0, Math.round(input.durationMs)),
    mimeType,
    byteLength,
    audio: audioBytes,
  };
  if (!isValidListeningAudioChunk(stored)) {
    throw new Error(
      `Generated ${input.kind} chunk ${input.sequence} is not valid Kokoro audio.`,
    );
  }

  const saved = await database.sql<{ contentKey: string }>`
    INSERT INTO listening_audio_chunks (
      content_key,
      cache_version,
      sequence,
      part_id,
      segment_index,
      kind,
      duration_ms,
      mime_type,
      byte_length,
      audio,
      created_at
    ) SELECT
      ${input.contentKey},
      ${input.cacheVersion},
      ${input.sequence},
      ${input.partId},
      ${input.segmentIndex},
      ${input.kind},
      ${stored.durationMs},
      ${mimeType},
      ${byteLength},
      ${audioBytes},
      ${new Date().toISOString()}
    WHERE EXISTS (
      SELECT 1
      FROM content_documents
      WHERE archived = 0 AND section = 'listening' AND content_key = ${input.contentKey}
    )
    ON CONFLICT(content_key, sequence) DO UPDATE SET
      cache_version = excluded.cache_version,
      part_id = excluded.part_id,
      segment_index = excluded.segment_index,
      kind = excluded.kind,
      duration_ms = excluded.duration_ms,
      mime_type = excluded.mime_type,
      byte_length = excluded.byte_length,
      audio = excluded.audio,
      created_at = excluded.created_at
    RETURNING content_key AS contentKey
  `;
  if (saved.length === 0) {
    throw new Error(
      `Listening content ${input.contentKey} is unavailable or has been deleted.`,
    );
  }

  return stored;
}
