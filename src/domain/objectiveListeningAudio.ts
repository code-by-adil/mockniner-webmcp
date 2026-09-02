import { z } from "zod";

const KOKORO_VOICES = [
  "af_heart",
  "am_fenrir",
  "bf_emma",
  "bm_george",
] as const;

export const KOKORO_LISTENING_AUTHORING_GUIDANCE = [
  "For Listening, write four parts whose answers occur in question order.",
  "Part 1 is an everyday transaction with exactly two speakers.",
  "Part 2 is an everyday informational monologue with one speaker.",
  "Part 3 is an education or training discussion with two to four speakers, usually students and optionally a tutor.",
  "Part 4 is an academic monologue with one speaker.",
  "Each speech segment contains one speaker's direct, unlabeled words.",
  "Keep every speaker's voice stable and distinct within a multi-speaker part, using male/female contrast when suitable.",
  "Available voices are af_heart, am_fenrir, bf_emma, and bm_george.",
].join(" ");

const KOKORO_AUDIO_DESCRIPTION =
  "A complete four-part Listening script. Keep each speaker's voice stable and distinct within a multi-speaker part.";
const KOKORO_PARTS_DESCRIPTION =
  "Four parts in answer order: a two-speaker transaction, a one-speaker everyday talk, a two-to-four-speaker education discussion, and a one-speaker academic talk.";

const kokoroVoiceSchema = z.enum(KOKORO_VOICES);

export const listeningAudioSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("bundled"),
    assetKey: z.literal("local-original"),
  }),
  z.strictObject({
    type: z.literal("kokoro"),
    speakers: z.array(z.strictObject({
      id: z.string().trim().min(1).max(50).regex(/^[a-z][a-z0-9_-]*$/)
        .describe("Stable semantic speaker ID used by speech segments, such as customer, adviser, student, or tutor."),
      voice: kokoroVoiceSchema.describe(
        "Stable Kokoro voice for this speaker: af_heart American female, am_fenrir American male, bf_emma British female, or bm_george British male.",
      ),
    })).min(1).max(12).describe(
      "Speaker-to-voice registry. Reuse each identity consistently. Speakers sharing a part need distinct voices; use male/female contrast when suitable.",
    ),
    parts: z.array(z.strictObject({
      partId: z.number().int().min(1).max(4),
      segments: z.array(z.discriminatedUnion("type", [
        z.strictObject({
          type: z.literal("speech"),
          speakerId: z.string().trim().min(1).max(50).describe(
            "The one declared speaker delivering every sentence in this segment.",
          ),
          text: z.string().trim().min(1).max(4_000).describe(
            "Direct speech for one speaker turn, without labels or another speaker's words.",
          ),
        }),
        z.strictObject({
          type: z.literal("silence"),
          durationMs: z.number().int().min(100).max(120_000),
          purpose: z.enum([
            "conversation_pause",
            "question_time",
            "part_transition",
          ]).optional(),
        }),
      ])).min(1).max(100).describe(
        "Ordered speaker turns and explicit silences. Start a new speech segment whenever the speaker changes.",
      ),
    })).length(4).describe(KOKORO_PARTS_DESCRIPTION),
  }).describe(KOKORO_AUDIO_DESCRIPTION),
]);

type ListeningAudioDefinition = z.infer<typeof listeningAudioSchema>;
export type KokoroListeningAudio = Extract<
  ListeningAudioDefinition,
  { type: "kokoro" }
>;
export type KokoroVoice = (typeof KOKORO_VOICES)[number];
