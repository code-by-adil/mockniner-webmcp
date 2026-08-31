import { describe, expect, it } from "vitest";
import type { KokoroListeningAudio } from "@/domain/objectiveContent";
import { createKokoroPlan } from "./kokoroScript";

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
  it("uses Kokoro's sentence splitter to create one serial generation queue", () => {
    expect(createKokoroPlan(audio)).toEqual([
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
});
