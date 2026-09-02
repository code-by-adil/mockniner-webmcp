import type {
  WritingAnnotation,
  WritingEvaluation,
  WritingSubmission,
} from "./types";
import { ApplicationError, type ValidationIssue } from "./errors";

/** Exact UTF-16 offsets, matching String.slice and the public evaluation contract. */
export function findAnnotationSpan(
  response: string,
  annotation: WritingAnnotation,
): { startOffset: number; endOffset: number } | null {
  const { startOffset, endOffset, originalText, contextBefore, contextAfter } =
    annotation;
  if (startOffset !== undefined || endOffset !== undefined) {
    return startOffset !== undefined &&
      endOffset !== undefined &&
      startOffset >= 0 &&
      endOffset > startOffset &&
      endOffset <= response.length &&
      response.slice(startOffset, endOffset) === originalText
      ? { startOffset, endOffset }
      : null;
  }
  if (!originalText) return null;
  const matches: number[] = [];
  for (
    let start = response.indexOf(originalText);
    start !== -1;
    start = response.indexOf(originalText, start + 1)
  ) {
    const end = start + originalText.length;
    if (contextBefore && !response.slice(0, start).endsWith(contextBefore))
      continue;
    if (contextAfter && !response.slice(end).startsWith(contextAfter)) continue;
    matches.push(start);
  }
  return matches.length === 1
    ? { startOffset: matches[0], endOffset: matches[0] + originalText.length }
    : null;
}

/** Legacy feedback remains readable even when its quote cannot be located uniquely. */
export function resolveWritingEvaluation(
  submission: WritingSubmission,
  evaluation: WritingEvaluation,
  requireResolved = false,
): WritingEvaluation {
  const issues: ValidationIssue[] = [];
  const resolveTask = (taskNumber: 1 | 2) => {
    const task = taskNumber === 1 ? evaluation.task1 : evaluation.task2;
    const response = submission.tasks[taskNumber - 1].response;
    const ids = new Set<string>();
    return {
      ...task,
      annotations: task.annotations.map((annotation, index) => {
        const span = findAnnotationSpan(response, annotation);
        if (
          !span ||
          annotation.taskNumber !== taskNumber ||
          ids.has(annotation.id)
        ) {
          issues.push({
            path: `task${taskNumber}.annotations.${index}`,
            message: `Use a unique annotation ID, taskNumber ${taskNumber}, and an exact quote with matching startOffset and endOffset. Offsets are required when a quote occurs more than once.`,
          });
        }
        ids.add(annotation.id);
        return span ? { ...annotation, ...span } : annotation;
      }),
    };
  };
  const resolved = {
    ...evaluation,
    task1: resolveTask(1),
    task2: resolveTask(2),
  };
  if (requireResolved && issues.length) {
    throw new ApplicationError(
      "INVALID_ANNOTATION",
      "Corrections must identify exact locations in the submitted responses.",
      true,
      issues,
    );
  }
  return resolved;
}
