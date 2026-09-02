import { describe, expect, it } from "vitest";
import { SECTION_META, SECTION_ORDER } from "./sections";
import { initialSession } from "./session";

describe("native IELTS section metadata", () => {
  it("keeps the exam order and standard durations", () => {
    expect(SECTION_ORDER).toEqual(["listening", "reading", "writing", "speaking"]);
    expect(SECTION_ORDER.map((section) => SECTION_META[section].durationSeconds)).toEqual([
      1800, 3600, 3600, 840,
    ]);
  });

  it("initializes every timer from the same metadata used by the interface", () => {
    for (const section of SECTION_ORDER) {
      expect(initialSession.secondsRemaining[section]).toBe(SECTION_META[section].durationSeconds);
    }
    expect(SECTION_META.speaking.minimumDurationSeconds).toBe(660);
  });
});
