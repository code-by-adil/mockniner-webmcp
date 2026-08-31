import { describe, expect, it } from "vitest";
import type { WritingAnnotation } from "@/domain/types";
import {
  getWritingIssueTitle,
  resolveAnnotationRanges,
  sanitizeAnnotations,
} from "./writingReviewAnnotations";

function annotation(
  overrides: Partial<WritingAnnotation> = {},
): WritingAnnotation {
  return {
    id: "issue-1",
    taskNumber: 1,
    originalText: "the public transport",
    suggestion: "public transport",
    explanation: "Remove the unnecessary article.",
    type: "grammar",
    ...overrides,
  };
}

describe("writing review annotations", () => {
  it("normalizes and merges duplicate feedback at the strongest severity", () => {
    const result = sanitizeAnnotations([
      annotation({ originalText: '"the public transport"', severity: "minor" }),
      annotation({ id: "issue-2", severity: "major", shortTitle: "Article use" }),
      annotation({ id: "invalid", suggestion: "" }),
    ]);

    expect(result.annotations).toHaveLength(1);
    expect(result.annotations[0]).toMatchObject({
      originalText: "the public transport",
      repeatCount: 2,
      severity: "major",
      shortTitle: "Article use",
    });
    expect(result.mergedDuplicates).toBe(1);
    expect(result.droppedInvalid).toBe(1);
  });

  it("uses context to select the intended occurrence without overlapping highlights", () => {
    const essay = "In cities, the public transport is useful. Outside cities, the public transport is limited.";
    const annotations = [
      annotation({ contextBefore: "In cities, " }),
      annotation({
        id: "issue-2",
        suggestion: "public transportation",
        explanation: "Use a more precise term.",
        contextBefore: "Outside cities, ",
      }),
    ];

    const result = resolveAnnotationRanges(essay, annotations);

    expect(result.mapped).toHaveLength(2);
    expect(result.mapped.map((entry) => essay.slice(entry.start, entry.end))).toEqual([
      "the public transport",
      "the public transport",
    ]);
    expect(result.unresolvedIndexes.size).toBe(0);
  });

  it("falls back to a useful issue title", () => {
    expect(getWritingIssueTitle(annotation({ shortTitle: "Concise title" }))).toBe("Concise title");
    expect(getWritingIssueTitle(annotation())).toBe("Remove the unnecessary article");
  });
});
