import type { SQLocal } from "sqlocal";

export type StoredListeningAudioChunk = {
  contentKey: string;
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
  "contentKey" | "sequence" | "partId" | "segmentIndex" | "durationMs"
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

  await database.sql`
    INSERT OR IGNORE INTO listening_audio_chunks (
      content_key,
      sequence,
      part_id,
      segment_index,
      kind,
      duration_ms,
      mime_type,
      byte_length,
      audio,
      created_at
    ) VALUES (
      ${input.contentKey},
      ${input.sequence},
      ${input.partId},
      ${input.segmentIndex},
      ${input.kind},
      ${Math.max(0, Math.round(input.durationMs))},
      ${mimeType},
      ${byteLength},
      ${audioBytes},
      ${new Date().toISOString()}
    )
  `;

  return {
    ...input,
    mimeType,
    byteLength,
    audio: audioBytes,
  };
}
