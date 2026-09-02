import { describe, expect, it } from "vitest";
import listeningJson from "@/content/listening.json";
import readingJson from "@/content/reading.json";
import { listeningDocument, readingDocument } from "@/content/objective";
import {
  getObjectiveAnswerKey,
  getObjectiveBlockQuestionIds,
  objectiveContentDocumentSchema,
  parseObjectiveContentDocument,
  type ObjectiveContentBlock,
} from "./objectiveContent";
import { countWords, gradeObjectiveDocument } from "./exam";

function questionIds(block: ObjectiveContentBlock): number[] {
  return getObjectiveBlockQuestionIds(block);
}

describe("canonical IELTS objective JSON", () => {
  it.each([
    ["listening", listeningJson, listeningDocument, 4],
    ["reading", readingJson, readingDocument, 3],
  ] as const)(
    "validates the built-in %s document directly from JSON",
    (_section, rawDocument, document, expectedParts) => {
      expect(parseObjectiveContentDocument(rawDocument)).toEqual(document);
      expect(document.parts).toHaveLength(expectedParts);
      const ids = document.parts.flatMap((part) =>
        part.blocks.flatMap(questionIds),
      );
      expect(ids).toHaveLength(40);
      expect([...ids].sort((a, b) => a - b)).toEqual(
        Array.from({ length: 40 }, (_, index) => index + 1),
      );
      expect(Object.keys(getObjectiveAnswerKey(document))).toHaveLength(40);
    },
  );

  it("keeps every objective answer beside its renderer-owned question data", () => {
    const answerBearingBlocks = readingDocument.parts.flatMap((part) =>
      part.blocks.filter((block) => questionIds(block).length > 0),
    );
    expect(answerBearingBlocks).not.toHaveLength(0);
    expect(JSON.stringify(readingDocument)).not.toContain('"answerKey"');
    expect(getObjectiveAnswerKey(readingDocument)[40]).toBe("behaviour");
  });

  it("rejects malformed complete tests before they can enter application state", () => {
    const invalid = {
      ...listeningJson,
      parts: listeningJson.parts.slice(0, 3),
    };
    const result = objectiveContentDocumentSchema.safeParse(invalid);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues).not.toHaveLength(0);
  });

  it("keeps heading relationships explicit for cross-pane matching", () => {
    const headingBlock = readingDocument.parts[1]?.blocks.find(
      (block) => block.type === "heading_matching_questions",
    );
    expect(headingBlock?.type).toBe("heading_matching_questions");
    if (headingBlock?.type !== "heading_matching_questions") return;
    expect(headingBlock.questions[0]).toMatchObject({
      questionId: 14,
      paragraphIndex: 1,
      answer: "A shared signal and a symbol of power",
    });
    expect(headingBlock.questions.at(-1)).toMatchObject({
      questionId: 18,
      paragraphIndex: 5,
    });
  });

  it("keeps one continuous Listening recording for all four parts", () => {
    expect(listeningDocument.audio).toEqual({
      type: "bundled",
      assetKey: "local-original",
    });
  });

  it("accepts semantic speaker turns for application-owned chunking", () => {
    const generated = {
      ...listeningJson,
      contentKey: "agent-listening-kokoro-v1",
      audio: {
        type: "kokoro",
        speakers: [
          { id: "narrator", voice: "bf_emma" },
          { id: "guest", voice: "am_fenrir" },
        ],
        parts: [
          {
            partId: 1,
            segments: [
              { type: "speech", speakerId: "narrator", text: "How can I help you today?" },
              { type: "speech", speakerId: "guest", text: "I would like to reserve a room." },
            ],
          },
          {
            partId: 2,
            segments: [{ type: "speech", speakerId: "narrator", text: "Welcome to the visitor centre." }],
          },
          {
            partId: 3,
            segments: [
              { type: "speech", speakerId: "narrator", text: "Which topic should we research?" },
              { type: "speech", speakerId: "guest", text: "I suggest local transport." },
            ],
          },
          {
            partId: 4,
            segments: [{ type: "speech", speakerId: "narrator", text: "Today we will examine migration patterns." }],
          },
        ],
      },
    };

    const parsed = parseObjectiveContentDocument(generated);
    expect(parsed.section).toBe("listening");
    if (parsed.section !== "listening") return;
    expect(parsed.audio.type).toBe("kokoro");
    if (parsed.audio.type !== "kokoro") return;
    expect(parsed.audio.parts).toHaveLength(4);
    expect(parsed.audio.parts[0]?.segments).toHaveLength(2);
  });

  it("rejects a Kokoro speaker turn that references an undeclared speaker", () => {
    const generated = structuredClone(listeningJson) as Record<string, unknown>;
    generated.contentKey = "agent-listening-invalid-speaker";
    generated.audio = {
      type: "kokoro",
      speakers: [{ id: "narrator", voice: "bf_emma" }],
      parts: Array.from({ length: 4 }, (_, index) => ({
        partId: index + 1,
        segments: [
          {
            type: "speech",
            speakerId: index === 2 ? "missing" : "narrator",
            text: "This is a short listening passage.",
          },
        ],
      })),
    };

    const result = objectiveContentDocumentSchema.safeParse(generated);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.some((issue) =>
      issue.message.includes("is not declared"),
    )).toBe(true);
  });

  it("enforces the official Listening speaker pattern per part", () => {
    const generated = structuredClone(listeningJson) as Record<string, unknown>;
    generated.contentKey = "agent-listening-invalid-part-speakers";
    generated.audio = {
      type: "kokoro",
      speakers: [
        { id: "one", voice: "bf_emma" },
        { id: "two", voice: "bm_george" },
      ],
      parts: Array.from({ length: 4 }, (_, index) => ({
        partId: index + 1,
        segments: [
          { type: "speech", speakerId: "one", text: "This is direct speech." },
          ...(index === 1
            ? [{ type: "speech", speakerId: "two", text: "Part two should not have a second speaker." }]
            : []),
        ],
      })),
    };

    const result = objectiveContentDocumentSchema.safeParse(generated);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.some((issue) =>
      issue.message.includes("part 2 must use exactly 1 speaker"),
    )).toBe(true);
  });

  it("rejects an unbounded Kokoro generation request", () => {
    const generated = structuredClone(listeningJson) as Record<string, unknown>;
    generated.contentKey = "agent-listening-too-long";
    generated.audio = {
      type: "kokoro",
      speakers: [{ id: "narrator", voice: "bf_emma" }],
      parts: Array.from({ length: 4 }, (_, index) => ({
        partId: index + 1,
        segments: Array.from(
          { length: index === 0 ? 16 : 1 },
          () => ({
            type: "speech",
            speakerId: "narrator",
            text: "a".repeat(4_000),
          }),
        ),
      })),
    };

    const result = objectiveContentDocumentSchema.safeParse(generated);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.some((issue) =>
      issue.message.includes("60,000 characters"),
    )).toBe(true);
  });

  it("keeps Reading source material within the intended word-count range", () => {
    const sourceWords = readingDocument.parts
      .flatMap((part) => part.blocks)
      .filter((block) => block.type === "passage")
      .flatMap((block) => block.paragraphs)
      .reduce((total, paragraph) => total + countWords(paragraph), 0);
    expect(sourceWords).toBeGreaterThanOrEqual(2_150);
    expect(sourceWords).toBeLessThanOrEqual(2_750);
  });
});

describe("deterministic grading from canonical JSON", () => {
  it("awards 40/40 and band 9 without a separate answer-key document", () => {
    const answers = Object.fromEntries(
      Object.entries(getObjectiveAnswerKey(readingDocument)).map(([id, answer]) => [
        id,
        Array.isArray(answer) ? answer[0] : answer,
      ]),
    );
    const result = gradeObjectiveDocument(readingDocument, answers);
    expect(result.raw).toBe(40);
    expect(result.band).toBe(9);
  });

  it("normalises completion answers without accepting missing responses", () => {
    const result = gradeObjectiveDocument(listeningDocument, {
      1: "carter",
      3: "9.30",
      6: "Helmet.",
      7: "",
    });
    expect(result.raw).toBe(3);
    expect(result.answered).toBe(3);
  });
});
