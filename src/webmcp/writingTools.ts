import { z } from "zod";
import type { ExamApplicationCommands } from "@/application/commands";
import type { WritingEvaluation, WritingSubmission } from "@/domain/types";
import {
  type WritingEvaluationInput,
  writingEvaluationInputSchema,
} from "@/domain/writingEvaluation";
import { toolFailure, throwIfCancelled, zodIssues } from "./toolResult";
import type { ToolIssue } from "./toolResult";

const getWritingSubmissionInputSchema = {
  type: "object",
  properties: {
    attemptId: {
      type: "string",
      format: "uuid",
      description: "Optional Writing attempt ID. Omit it to read the latest submission.",
    },
  },
  additionalProperties: false,
} as const;

const attachWritingEvaluationInputSchema = z.toJSONSchema(writingEvaluationInputSchema, {
  target: "draft-07",
});

type WritingToolDependencies = {
  readWritingAttempt: (
    attemptId?: string,
  ) => Promise<{ submission: WritingSubmission; evaluation: WritingEvaluation | null } | null>;
  attachWritingEvaluation: ExamApplicationCommands["attachWritingEvaluation"];
  getCurrentWritingAttemptId: () => string | undefined;
};

export type WritingToolSurface = "results" | "evaluation" | "none";

function annotationIssues(
  evaluation: WritingEvaluationInput,
  submission: WritingSubmission,
): ToolIssue[] {
  const issues: ToolIssue[] = [];

  ([1, 2] as const).forEach((taskNumber) => {
    const response = submission.tasks[taskNumber - 1].response;
    const taskEvaluation = taskNumber === 1 ? evaluation.task1 : evaluation.task2;

    taskEvaluation.annotations.forEach((annotation, index) => {
      const path = `task${taskNumber}.annotations.${index}`;
      if (annotation.taskNumber !== taskNumber) {
        issues.push({
          path: `${path}.taskNumber`,
          message: `This annotation belongs to task ${taskNumber}.`,
        });
      }

      const hasStart = annotation.startOffset !== undefined;
      const hasEnd = annotation.endOffset !== undefined;
      if (hasStart !== hasEnd) {
        issues.push({
          path,
          message: "Provide both startOffset and endOffset, or omit both.",
        });
        return;
      }

      if (hasStart && hasEnd) {
        const quoted = response.slice(annotation.startOffset, annotation.endOffset);
        if (quoted !== annotation.originalText) {
          issues.push({
            path: `${path}.originalText`,
            message: `The quoted text does not match task ${taskNumber} at the supplied offsets.`,
          });
        }
      } else if (!response.includes(annotation.originalText)) {
        issues.push({
          path: `${path}.originalText`,
          message: `The quoted text was not found in the submitted task ${taskNumber} response.`,
        });
      }
    });
  });

  return issues;
}

export function createWritingToolDefinitions(
  {
    readWritingAttempt,
    attachWritingEvaluation,
    getCurrentWritingAttemptId,
  }: WritingToolDependencies,
  surface: WritingToolSurface = "evaluation",
): WebMCP.ModelContextTool[] {
  const submissionTool: WebMCP.ModelContextTool = {
    name: "get_writing_submission",
    title: "Read IELTS Writing submission",
    description:
      "Read an immutable submitted IELTS Writing attempt, including both original task definitions, candidate responses, word counts, and attempt identity. Use this before evaluating Writing. Omit attemptId to read the latest submission.",
    inputSchema: getWritingSubmissionInputSchema,
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute: async (input, { signal }) => {
      throwIfCancelled(signal);
      const parsed = z.object({ attemptId: z.uuid().optional() }).strict().safeParse(input);
      if (!parsed.success) {
        return toolFailure(
          "INVALID_INPUT",
          "The Writing submission request is invalid.",
          true,
          zodIssues(parsed.error),
        );
      }
      const stored = await readWritingAttempt(parsed.data.attemptId);
      throwIfCancelled(signal);
      if (!stored) {
        return toolFailure(
          "WRITING_SUBMISSION_NOT_FOUND",
          parsed.data.attemptId
            ? `Writing attempt ${parsed.data.attemptId} was not found.`
            : "No submitted Writing attempt is available yet.",
          true,
        );
      }
      return {
        ok: true,
        data: {
          submission: stored.submission,
          evaluationStatus: stored.evaluation ? "evaluated" : "awaiting_evaluation",
          canAttachEvaluation:
            !stored.evaluation && stored.submission.attemptId === getCurrentWritingAttemptId(),
        },
      };
    },
  };
  const evaluationTool: WebMCP.ModelContextTool = {
    name: "attach_writing_evaluation",
    title: "Attach IELTS Writing evaluation",
    description:
      "Validate and attach a structured IELTS Writing evaluation to the current immutable submission. Supply whole or half-band scores from 0 to 9 for both tasks and all four criteria. On success the application opens the read-only Writing review.",
    inputSchema: attachWritingEvaluationInputSchema,
    annotations: { readOnlyHint: false, untrustedContentHint: false },
    execute: async (input, { signal }) => {
      throwIfCancelled(signal);
      const parsed = writingEvaluationInputSchema.safeParse(input);
      if (!parsed.success) {
        return toolFailure(
          "INVALID_EVALUATION",
          "The Writing evaluation does not satisfy the IELTS evaluation contract.",
          true,
          zodIssues(parsed.error),
        );
      }
      const stored = await readWritingAttempt(parsed.data.attemptId);
      throwIfCancelled(signal);
      if (!stored) {
        return toolFailure(
          "WRITING_SUBMISSION_NOT_FOUND",
          `Writing attempt ${parsed.data.attemptId} was not found.`,
          false,
        );
      }
      if (stored.evaluation) {
        return toolFailure(
          "EVALUATION_EXISTS",
          `Writing attempt ${parsed.data.attemptId} already has an evaluation.`,
          false,
        );
      }
      if (getCurrentWritingAttemptId() !== parsed.data.attemptId) {
        return toolFailure(
          "ATTEMPT_NOT_CURRENT",
          `Writing attempt ${parsed.data.attemptId} is not the current submitted attempt.`,
          false,
        );
      }
      const invalidAnnotations = annotationIssues(parsed.data, stored.submission);
      if (invalidAnnotations.length) {
        return toolFailure(
          "INVALID_ANNOTATION",
          "One or more corrections do not quote the immutable submitted response.",
          true,
          invalidAnnotations,
        );
      }
      const evaluation = await attachWritingEvaluation(parsed.data);
      throwIfCancelled(signal);
      return {
        ok: true,
        data: {
          status: "attached",
          attemptId: evaluation.attemptId,
          overallBand: evaluation.overallBand,
          evaluatedAt: evaluation.evaluatedAt,
        },
        sideEffect: {
          type: "writing_evaluation_attached",
          visibleView: "writing_review",
        },
      };
    },
  };
  if (surface === "results") return [submissionTool];
  if (surface === "evaluation") return [submissionTool, evaluationTool];
  return [];
}
