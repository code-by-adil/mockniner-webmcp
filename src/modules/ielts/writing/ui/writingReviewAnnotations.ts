import type { WritingAnnotation } from "@/domain/types";

export type ResolvedAnnotation = {
  annotationIndex: number;
  start: number;
  end: number;
};
export type AnnotationIssue = {
  annotationIndex: number;
  annotation: WritingAnnotation;
  start: number | null;
};

export function getWritingIssueTitle(annotation: WritingAnnotation): string {
  return (
    annotation.shortTitle?.trim() ||
    annotation.issueTitle?.trim() ||
    annotation.explanation.split(".")[0]?.trim() ||
    "Writing issue"
  );
}

/** Overlapping feedback stays in the issue list; only non-overlapping spans become buttons. */
export function resolveAnnotationRanges(
  essay: string,
  annotations: WritingAnnotation[],
) {
  const mapped: ResolvedAnnotation[] = [];
  const unresolvedIndexes = new Set<number>();
  annotations.forEach((annotation, annotationIndex) => {
    const { startOffset: start, endOffset: end } = annotation;
    if (
      start === undefined ||
      end === undefined ||
      start < 0 ||
      end <= start ||
      end > essay.length ||
      essay.slice(start, end) !== annotation.originalText ||
      mapped.some((range) => start < range.end && end > range.start)
    ) {
      unresolvedIndexes.add(annotationIndex);
    } else {
      mapped.push({ annotationIndex, start, end });
    }
  });
  mapped.sort((a, b) => a.start - b.start);
  return { mapped, unresolvedIndexes };
}
