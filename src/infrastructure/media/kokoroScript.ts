import { TextSplitterStream } from "kokoro-js";
import { phonemize } from "phonemizer";
import type {
  KokoroListeningAudio,
  KokoroVoice,
} from "@/domain/objectiveContent";
import { KOKORO_RUNTIME } from "./kokoroConfig";

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

export type KokoroPhonemeCounter = (
  text: string,
  voice: KokoroVoice,
) => Promise<number>;

function normalizeSpeechText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function splitSentences(text: string): string[] {
  const splitter = new TextSplitterStream();
  splitter.push(normalizeSpeechText(text));
  return [...splitter];
}

async function countPhonemes(
  text: string,
  voice: KokoroVoice,
): Promise<number> {
  const language = voice.startsWith("a") ? "en-us" : "en-gb";
  const phonemes = (await phonemize(text, language)).join(" ");
  return [...phonemes].length;
}

function wordBoundaries(text: string): number[] {
  const boundaries: number[] = [];
  for (const match of text.matchAll(/\s+/g)) {
    if (match.index > 0) boundaries.push(match.index);
  }
  return boundaries;
}

async function largestSafeBoundary(
  text: string,
  voice: KokoroVoice,
  count: KokoroPhonemeCounter,
): Promise<number | null> {
  const boundaries = wordBoundaries(text);
  let low = 0;
  let high = boundaries.length - 1;
  let safe: number | null = null;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const boundary = boundaries[middle]!;
    if (
      await count(text.slice(0, boundary).trim(), voice) <=
        KOKORO_RUNTIME.maxPhonemes
    ) {
      safe = boundary;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return safe;
}

async function splitOversizedSentence(
  sentence: string,
  voice: KokoroVoice,
  count: KokoroPhonemeCounter,
): Promise<string[]> {
  const chunks: string[] = [];
  let remaining = sentence.trim();
  while (await count(remaining, voice) > KOKORO_RUNTIME.maxPhonemes) {
    const safeBoundary = await largestSafeBoundary(remaining, voice, count);
    if (safeBoundary == null) {
      throw new Error(
        "A single spoken word exceeds Kokoro's safe context limit. Rewrite that word or identifier with natural spacing.",
      );
    }

    const safePrefix = remaining.slice(0, safeBoundary);
    const punctuation = [...safePrefix.matchAll(/[,;:—–]\s+/g)].at(-1);
    const preferredBoundary = punctuation?.index == null
      ? safeBoundary
      : punctuation.index + punctuation[0].trimEnd().length;
    chunks.push(remaining.slice(0, preferredBoundary).trim());
    remaining = remaining.slice(preferredBoundary).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

export async function splitKokoroSpeech(text: string, voice: KokoroVoice, count: KokoroPhonemeCounter = countPhonemes): Promise<string[]> {
  const chunks: string[] = [];
  for (const sentence of splitSentences(text)) {
    chunks.push(...await splitOversizedSentence(sentence, voice, count));
  }
  return chunks;
}

export async function createKokoroPlan(
  audio: KokoroListeningAudio,
  count: KokoroPhonemeCounter = countPhonemes,
): Promise<KokoroPlanChunk[]> {
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
      for (const sentence of splitSentences(segment.text)) {
        const speechChunks = await count(sentence, voice) <= KOKORO_RUNTIME.maxPhonemes
          ? [sentence]
          : await splitOversizedSentence(sentence, voice, count);
        for (const text of speechChunks) {
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
  }

  return chunks;
}
