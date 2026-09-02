import { z } from "zod";
import type { IeltsCommands } from "@/application/ieltsCommands";
import type { WritingEvaluation, WritingSubmission } from "@/domain/types";
import { writingEvaluationInputSchema } from "@/domain/writingEvaluation";
import {
  applicationFailure,
  getToolExecutionSignal,
  toolFailure,
  throwIfCancelled,
  zodIssues,
} from "./toolResult";

const getWritingSubmissionInputSchema = {
  type: "object",
  properties: {
    attemptId: {
      type: "string",
      format: "uuid",
      description:
        "Optional Writing attempt ID. Omit it to read the latest submission.",
    },
  },
  additionalProperties: false,
} as const;

const attachWritingEvaluationInputSchema = z.toJSONSchema(
  writingEvaluationInputSchema,
  {
    target: "draft-07",
  },
);

type WritingToolDependencies = {
  readWritingAttempt: (
    attemptId?: string,
  ) => Promise<{
    submission: WritingSubmission;
    evaluation: WritingEvaluation | null;
  } | null>;
  attachWritingEvaluation: IeltsCommands["attachWritingEvaluation"];
  getCurrentWritingAttemptId: () => string | undefined;
};

export type WritingToolSurface = "results" | "evaluation" | "none";

export function createWritingToolDefinitions(
  {
    readWritingAttempt,
    attachWritingEvaluation,
    getCurrentWritingAttemptId,
  }: WritingToolDependencies,
  surface: WritingToolSurface = "evaluation",
): WebMCP.ModelContextTool[] {
  const submissionTool: WebMCP.ModelContextTool = {
    name: "get_ielts_writing_submission",
    title: "Read IELTS Writing submission",
    description:
      "Read an immutable submitted IELTS Writing attempt, including both original task definitions, candidate responses, word counts, and attempt identity. Use this before evaluating Writing. Omit attemptId to read the latest submission.",
    inputSchema: getWritingSubmissionInputSchema,
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute: async (input, options) => {
      const signal = getToolExecutionSignal(options);
      throwIfCancelled(signal);
      const parsed = z
        .object({ attemptId: z.uuid().optional() })
        .strict()
        .safeParse(input);
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
          evaluationStatus: stored.evaluation
            ? "evaluated"
            : "awaiting_evaluation",
          canAttachEvaluation:
            !stored.evaluation &&
            stored.submission.attemptId === getCurrentWritingAttemptId(),
        },
      };
    },
  };
  const evaluationTool: WebMCP.ModelContextTool = {
    name: "attach_ielts_writing_evaluation",
    title: "Attach IELTS Writing evaluation",
    description:
      "Validate and attach a structured IELTS Writing evaluation to the current immutable submission. Supply whole or half-band scores from 0 to 9 for both tasks and all four criteria. On success the application opens the read-only Writing review.",
    inputSchema: attachWritingEvaluationInputSchema,
    annotations: { readOnlyHint: false, untrustedContentHint: false },
    execute: async (input, options) => {
      const signal = getToolExecutionSignal(options);
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
      try {
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
      } catch (error) {
        return applicationFailure(error);
      }
    },
  };
  if (surface === "results") return [submissionTool];
  if (surface === "evaluation") return [submissionTool, evaluationTool];
  return [];
}
