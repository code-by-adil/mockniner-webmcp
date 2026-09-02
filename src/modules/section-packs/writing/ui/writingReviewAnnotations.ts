import type { WritingAnnotation } from "@/domain/types";

export type ResolvedAnnotation = {
  annotationIndex: number;
  start: number;
  end: number;
  confidence: number;
};

export type AnnotationIssue = {
  annotationIndex: number;
  annotation: ReviewAnnotation;
  start: number | null;
};

type ReviewAnnotation = WritingAnnotation & {
  repeatCount: number;
};

export type SanitizedAnnotations = {
  annotations: ReviewAnnotation[];
  mergedDuplicates: number;
  droppedInvalid: number;
};

export const EMPTY_WRITING_ANNOTATIONS: WritingAnnotation[] = [];

export function getWritingIssueTitle(annotation: WritingAnnotation): string {
  const explicitTitle = annotation.shortTitle?.trim() || annotation.issueTitle?.trim();
  if (explicitTitle) return explicitTitle;
  const derivedTitle = annotation.explanation.split(".")[0]?.trim();
  return derivedTitle || "Writing issue";
}

function normalizeSnippet(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function normalizeInlineText(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length < 2) return trimmed;

  const quotePairs: Array<[string, string]> = [
    ['"', '"'],
    ["'", "'"],
    ["`", "`"],
    ["“", "”"],
    ["‘", "’"],
  ];

  for (const [open, close] of quotePairs) {
    if (trimmed.startsWith(open) && trimmed.endsWith(close)) {
      return trimmed.slice(open.length, trimmed.length - close.length).trim();
    }
  }
  return trimmed;
}

function findAllIndexes(haystack: string, needle: string): number[] {
  if (!needle) return [];
  const positions: number[] = [];
  let cursor = haystack.indexOf(needle);
  while (cursor !== -1) {
    positions.push(cursor);
    cursor = haystack.indexOf(needle, cursor + 1);
  }
  return positions;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function severityWeight(value: WritingAnnotation["severity"] | undefined): number {
  if (value === "critical") return 3;
  if (value === "major") return 2;
  return 1;
}

export function sanitizeAnnotations(input: WritingAnnotation[]): SanitizedAnnotations {
  const unique = new Map<string, ReviewAnnotation>();
  let droppedInvalid = 0;

  for (const annotation of input) {
    const originalText = normalizeInlineText(annotation.originalText ?? "");
    const suggestion = normalizeInlineText(annotation.suggestion ?? "");
    const explanation = (annotation.explanation ?? "").replace(/\s+/g, " ").trim();
    if (!originalText || !suggestion || !explanation) {
      droppedInvalid += 1;
      continue;
    }

    const normalized: ReviewAnnotation = {
      ...annotation,
      originalText,
      suggestion,
      explanation,
      issueTitle: annotation.issueTitle?.trim() || undefined,
      shortTitle: annotation.shortTitle?.trim() || undefined,
      contextBefore: annotation.contextBefore?.trim().slice(-120) || undefined,
      contextAfter: annotation.contextAfter?.trim().slice(0, 120) || undefined,
      repeatCount: 1,
    };

    const signature = [
      normalized.type,
      normalizeSnippet(normalized.originalText),
      normalizeSnippet(normalized.suggestion),
      normalizeSnippet(normalized.explanation),
    ].join("|");

    const existing = unique.get(signature);
    if (!existing) {
      unique.set(signature, normalized);
      continue;
    }

    const merged: ReviewAnnotation = {
      ...existing,
      repeatCount: existing.repeatCount + 1,
      // Prefer higher-severity framing for repeated versions of the same issue.
      ...(severityWeight(normalized.severity) > severityWeight(existing.severity)
        ? {
            severity: normalized.severity,
            explanation: normalized.explanation,
            suggestion: normalized.suggestion,
            shortTitle: normalized.shortTitle ?? existing.shortTitle,
            issueTitle: normalized.issueTitle ?? existing.issueTitle,
          }
        : {}),
    };
    if (!merged.shortTitle && normalized.shortTitle) {
      merged.shortTitle = normalized.shortTitle;
    }
    if (!merged.issueTitle && normalized.issueTitle) {
      merged.issueTitle = normalized.issueTitle;
    }
    unique.set(signature, merged);
  }

  const annotations = [...unique.values()];
  return {
    annotations,
    mergedDuplicates: Math.max(0, input.length - annotations.length - droppedInvalid),
    droppedInvalid,
  };
}

function findWhitespaceTolerantRanges(essay: string, phrase: string): Array<{ start: number; end: number }> {
  const tokens = phrase
    .trim()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);

  if (tokens.length < 2) return [];

  const pattern = tokens.map((token) => escapeRegExp(token)).join("\\s+");
  const regex = new RegExp(pattern, "gi");
  const ranges: Array<{ start: number; end: number }> = [];

  let match = regex.exec(essay);
  while (match) {
    if (typeof match.index === "number") {
      const start = match.index;
      const end = start + match[0].length;
      if (end > start) ranges.push({ start, end });
    }
    match = regex.exec(essay);
  }

  return ranges;
}

function findContextAnchoredRanges(
  essay: string,
  annotation: WritingAnnotation,
): Array<{ start: number; end: number }> {
  const before = annotation.contextBefore?.trim() ?? "";
  const after = annotation.contextAfter?.trim() ?? "";
  const targetLength = annotation.originalText.trim().length;
  if (!before && !after) return [];

  const essayLower = essay.toLowerCase();
  const beforeLower = before.toLowerCase();
  const afterLower = after.toLowerCase();
  const ranges: Array<{ start: number; end: number }> = [];

  if (beforeLower && afterLower) {
    const beforeMatches = findAllIndexes(essayLower, beforeLower);
    beforeMatches.forEach((beforeStart) => {
      const start = beforeStart + beforeLower.length;
      const afterStart = essayLower.indexOf(afterLower, start);
      if (afterStart <= start) return;
      const spanLength = afterStart - start;
      if (spanLength <= 0 || spanLength > Math.max(targetLength * 3, 280)) return;
      ranges.push({ start, end: afterStart });
    });
  }

  if (ranges.length > 0) return ranges;

  if (beforeLower) {
    findAllIndexes(essayLower, beforeLower).forEach((beforeStart) => {
      const start = beforeStart + beforeLower.length;
      const end = Math.min(essay.length, start + targetLength);
      if (end > start) ranges.push({ start, end });
    });
  }

  if (ranges.length > 0) return ranges;

  if (afterLower) {
    findAllIndexes(essayLower, afterLower).forEach((afterStart) => {
      const end = afterStart;
      const start = Math.max(0, end - targetLength);
      if (end > start) ranges.push({ start, end });
    });
  }

  return ranges;
}

function scoreCandidate(params: {
  essay: string;
  annotation: WritingAnnotation;
  start: number;
  end: number;
  confidence: number;
  exactCaseMatch: boolean;
}): number {
  const { essay, annotation, start, end, exactCaseMatch, confidence } = params;
  let score = exactCaseMatch ? 120 : 80;
  score += confidence * 25;

  const beforeNormalized = normalizeSnippet(annotation.contextBefore ?? "");
  if (beforeNormalized) {
    const beforeWindow = normalizeSnippet(essay.slice(Math.max(0, start - 80), start));
    if (beforeWindow.endsWith(beforeNormalized)) score += 60;
    else if (beforeWindow.includes(beforeNormalized)) score += 30;
  }

  const afterNormalized = normalizeSnippet(annotation.contextAfter ?? "");
  if (afterNormalized) {
    const afterWindow = normalizeSnippet(essay.slice(end, Math.min(essay.length, end + 80)));
    if (afterWindow.startsWith(afterNormalized)) score += 60;
    else if (afterWindow.includes(afterNormalized)) score += 30;
  }

  // Prefer earlier positions when matching quality is equivalent.
  score -= start * 0.0001;
  return score;
}

export function resolveAnnotationRanges(
  essay: string,
  annotations: WritingAnnotation[],
): {
  mapped: ResolvedAnnotation[];
  unresolvedIndexes: Set<number>;
} {
  const candidates: Array<ResolvedAnnotation & { score: number }> = [];
  const essayLower = essay.toLowerCase();

  annotations.forEach((annotation, annotationIndex) => {
    const original = annotation.originalText?.trim();
    if (!original) return;

    const exactMatches = findAllIndexes(essay, original);
    exactMatches.forEach((start) => {
      const end = start + original.length;
      candidates.push({
        annotationIndex,
        start,
        end,
        confidence: 1,
        score: scoreCandidate({
          essay,
          annotation,
          start,
          end,
          confidence: 1,
          exactCaseMatch: true,
        }),
      });
    });

    if (exactMatches.length > 0) return;

    const originalLower = original.toLowerCase();
    const looseMatches = findAllIndexes(essayLower, originalLower);
    looseMatches.forEach((start) => {
      const end = start + original.length;
      candidates.push({
        annotationIndex,
        start,
        end,
        confidence: 0.7,
        score: scoreCandidate({
          essay,
          annotation,
          start,
          end,
          confidence: 0.7,
          exactCaseMatch: false,
        }),
      });
    });

    if (looseMatches.length > 0) return;

    const whitespaceMatches = findWhitespaceTolerantRanges(essay, original);
    whitespaceMatches.forEach(({ start, end }) => {
      candidates.push({
        annotationIndex,
        start,
        end,
        confidence: 0.55,
        score: scoreCandidate({
          essay,
          annotation,
          start,
          end,
          confidence: 0.55,
          exactCaseMatch: false,
        }),
      });
    });

    if (whitespaceMatches.length > 0) return;

    const contextMatches = findContextAnchoredRanges(essay, annotation);
    contextMatches.forEach(({ start, end }) => {
      candidates.push({
        annotationIndex,
        start,
        end,
        confidence: 0.42,
        score: scoreCandidate({
          essay,
          annotation,
          start,
          end,
          confidence: 0.42,
          exactCaseMatch: false,
        }),
      });
    });
  });

  candidates.sort((a, b) => b.score - a.score);
  const accepted: ResolvedAnnotation[] = [];
  const usedAnnotations = new Set<number>();

  // Greedy assignment keeps one best span per annotation and avoids overlap clutter.
  for (const candidate of candidates) {
    if (usedAnnotations.has(candidate.annotationIndex)) continue;
    const intersects = accepted.some(
      (current) => candidate.start < current.end && candidate.end > current.start,
    );
    if (intersects) continue;
    accepted.push({
      annotationIndex: candidate.annotationIndex,
      start: candidate.start,
      end: candidate.end,
      confidence: candidate.confidence,
    });
    usedAnnotations.add(candidate.annotationIndex);
  }

  accepted.sort((a, b) => a.start - b.start);

  const unresolvedIndexes = new Set<number>();
  annotations.forEach((_, index) => {
    if (!usedAnnotations.has(index)) unresolvedIndexes.add(index);
  });

  return { mapped: accepted, unresolvedIndexes };
}
