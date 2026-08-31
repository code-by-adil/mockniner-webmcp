import { describe, expect, it } from "vitest";
import { listeningDocument, readingDocument } from "@/content/objective";
import { toWebObjectiveTestDefinition } from "./webObjectiveRenderer";

describe("objective JSON renderer boundary", () => {
  it.each([
    [listeningDocument, 4],
    [readingDocument, 3],
  ] as const)(
    "turns a complete canonical document into one renderable part per IELTS part",
    (document, expectedPartCount) => {
      const definition = toWebObjectiveTestDefinition(document);

      expect(definition.parts).toHaveLength(expectedPartCount);
      expect(definition.parts.every((part) => typeof part.Component === "function")).toBe(true);
      expect(Object.keys(definition.answerKey ?? {})).toHaveLength(40);
    },
  );

  it("keeps the single Listening recording on the rendered test definition", () => {
    const definition = toWebObjectiveTestDefinition(listeningDocument);
    expect(definition.listeningAudio).toEqual({ key: "local-original" });
  });
});
