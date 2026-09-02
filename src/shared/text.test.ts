import { describe, expect, it } from "vitest";
import { countWords } from "./text";

describe("countWords", () => {
  it.each([undefined, "", " \n\t ", "\u00a0"])("counts an empty answer as zero: %s", (value) => {
    expect(countWords(value)).toBe(0);
  });

  it("counts whitespace-separated words without splitting punctuation or hyphens", () => {
    expect(countWords("  One\ttwo\nthree.  ")).toBe(3);
    expect(countWords("well-known don't 1,000")).toBe(3);
    expect(countWords("one\u00a0two")).toBe(2);
  });
});
