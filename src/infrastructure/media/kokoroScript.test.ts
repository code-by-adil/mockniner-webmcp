import { describe, expect, it } from "vitest";
import type { KokoroListeningAudio } from "@/domain/objectiveContent";
import { createKokoroPlan } from "./kokoroScript";
import { KOKORO_RUNTIME } from "./kokoroConfig";

const audio: KokoroListeningAudio = {
  type: "kokoro",
  speakers: [
    { id: "host", voice: "af_heart" },
    { id: "guest", voice: "bm_george" },
  ],
  parts: [
    {
      partId: 1,
      segments: [
        {
          type: "speech",
          speakerId: "host",
          text: "Welcome to the test. We will begin shortly.",
        },
        { type: "silence", durationMs: 750, purpose: "conversation_pause" },
      ],
    },
    {
      partId: 2,
      segments: [
        { type: "speech", speakerId: "guest", text: "This is part two." },
      ],
    },
    {
      partId: 3,
      segments: [
        { type: "silence", durationMs: 30_000, purpose: "question_time" },
      ],
    },
    {
      partId: 4,
      segments: [
        { type: "speech", speakerId: "host", text: "This is the final part." },
      ],
    },
  ],
};

describe("createKokoroPlan", () => {
  const characterCount = async (text: string) => text.length;

  it("uses Kokoro's sentence splitter to create one serial generation queue", async () => {
    await expect(createKokoroPlan(audio, characterCount)).resolves.toEqual([
      {
        sequence: 0,
        partId: 1,
        segmentIndex: 0,
        kind: "speech",
        text: "Welcome to the test.",
        voice: "af_heart",
      },
      {
        sequence: 1,
        partId: 1,
        segmentIndex: 0,
        kind: "speech",
        text: "We will begin shortly.",
        voice: "af_heart",
      },
      {
        sequence: 2,
        partId: 1,
        segmentIndex: 1,
        kind: "silence",
        durationMs: 750,
      },
      {
        sequence: 3,
        partId: 2,
        segmentIndex: 0,
        kind: "speech",
        text: "This is part two.",
        voice: "bm_george",
      },
      {
        sequence: 4,
        partId: 3,
        segmentIndex: 0,
        kind: "silence",
        durationMs: 30_000,
      },
      {
        sequence: 5,
        partId: 4,
        segmentIndex: 0,
        kind: "speech",
        text: "This is the final part.",
        voice: "af_heart",
      },
    ]);
  });

  it("keeps a complete long sentence intact while it fits the safe context", async () => {
    const sentence = `${"This deliberately long spoken sentence remains coherent because ".repeat(7)}it still fits.`;
    const input = structuredClone(audio);
    input.parts[0]!.segments = [{ type: "speech", speakerId: "host", text: sentence }];

    const plan = await createKokoroPlan(input, characterCount);

    expect(plan[0]).toMatchObject({ kind: "speech", text: sentence });
  });

  it("keeps a clause-rich sentence intact using Kokoro's real phoneme count", async () => {
    const sentence = "Although the committee originally expected the evening workshop to finish early, the students asked so many thoughtful questions about the river survey, the interview schedule, the revised maps, and the final presentation that the tutor extended the session and carefully answered every concern before everyone returned to the library together, where they compared their notes, corrected two measurements, discussed the most surprising responses, and agreed on a clear plan for the following morning.";
    const input = structuredClone(audio);
    input.parts[0]!.segments = [{ type: "speech", speakerId: "host", text: sentence }];

    const plan = await createKokoroPlan(input);

    expect(plan[0]).toMatchObject({ kind: "speech", text: sentence });
  });

  it("only splits an individual sentence when it exceeds the hard safe context", async () => {
    const sentence = `${"A meaningful phrase with several connected words, ".repeat(18)}finally ends here.`;
    const input = structuredClone(audio);
    input.parts[0]!.segments = [{ type: "speech", speakerId: "host", text: sentence }];

    const plan = await createKokoroPlan(input, characterCount);
    const speech = plan.filter((chunk): chunk is Extract<
      typeof chunk,
      { kind: "speech" }
    > => chunk.kind === "speech" && chunk.partId === 1);

    expect(speech.length).toBeGreaterThan(1);
    expect(speech.every((chunk) => chunk.text.length <= KOKORO_RUNTIME.maxPhonemes)).toBe(true);
    expect(speech.map((chunk) => chunk.text).join(" ")).toBe(sentence);
  });

  it("normalizes generated newlines before sentence splitting", async () => {
    const input = structuredClone(audio);
    input.parts[0]!.segments = [{
      type: "speech",
      speakerId: "host",
      text: "Email help@example.com.\nThen wait here.",
    }];

    const plan = await createKokoroPlan(input, characterCount);

    expect(plan.slice(0, 2)).toMatchObject([
      { kind: "speech", text: "Email help@example.com." },
      { kind: "speech", text: "Then wait here." },
    ]);
  });

  it("rejects a pathological single word that cannot fit safely", async () => {
    const input = structuredClone(audio);
    input.parts[0]!.segments = [{
      type: "speech",
      speakerId: "host",
      text: "x".repeat(KOKORO_RUNTIME.maxPhonemes + 1),
    }];

    await expect(createKokoroPlan(input, characterCount)).rejects.toThrow(
      "single spoken word",
    );
  });
});
