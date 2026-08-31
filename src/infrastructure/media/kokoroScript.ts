import { TextSplitterStream } from "kokoro-js";
import type {
  KokoroListeningAudio,
  KokoroVoice,
} from "@/domain/objectiveContent";

type PlanChunkBase = {
  sequence: number;
  partId: number;
  segmentIndex: number;
};

export type KokoroPlanChunk =
  | (PlanChunkBase & {
      kind: "speech";
      text: string;
      voice: KokoroVoice;
    })
  | (PlanChunkBase & {
      kind: "silence";
      durationMs: number;
    });

export function createKokoroPlan(audio: KokoroListeningAudio): KokoroPlanChunk[] {
  const voices = new Map(
    audio.speakers.map((speaker) => [speaker.id, speaker.voice] as const),
  );
  const chunks: KokoroPlanChunk[] = [];

  for (const part of audio.parts) {
    for (const [segmentIndex, segment] of part.segments.entries()) {
      if (segment.type === "silence") {
        chunks.push({
          sequence: chunks.length,
          partId: part.partId,
          segmentIndex,
          kind: "silence",
          durationMs: segment.durationMs,
        });
        continue;
      }

      const voice = voices.get(segment.speakerId);
      if (!voice) {
        throw new Error(`Kokoro speaker ${segment.speakerId} is not declared.`);
      }
      const splitter = new TextSplitterStream();
      splitter.push(segment.text);
      for (const text of splitter) {
        chunks.push({
          sequence: chunks.length,
          partId: part.partId,
          segmentIndex,
          kind: "speech",
          text,
          voice,
        });
      }
    }
  }

  return chunks;
}
