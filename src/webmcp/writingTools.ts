import { z } from "zod";
import { readSelectedSubmission, submissionSelectionSchema } from './submissionSelection';
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

export function createWritingToolDefinitions(
  {
    readWritingAttempt,
    attachWritingEvaluation,
    getCurrentWritingAttemptId,
  }: WritingToolDependencies,
): WebMCP.ModelContextTool[] {
  const submissionTool: WebMCP.ModelContextTool = {
    name: "get_ielts_writing_submission",
    title: "Read IELTS Writing submission",
    description:
      "Read the visible IELTS Writing submission, original tasks, responses, word counts and attached evaluation. No parameters means the submission on screen. Use latest: true for the newest saved Writing attempt, or attemptId for an exact historical attempt. Reading never changes the visible page.",
    inputSchema: submissionSelectionSchema,
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute: async (input, options) => {
      const signal = getToolExecutionSignal(options);
      throwIfCancelled(signal);
      const selected = await readSelectedSubmission(input, readWritingAttempt, getCurrentWritingAttemptId, signal);
      if (!selected.ok) return selected;
      const { stored, requestedId, selection } = selected;
      if (!stored) {
        return toolFailure(
          "WRITING_SUBMISSION_NOT_FOUND",
          requestedId
            ? `Writing attempt ${requestedId} was not found.`
            : "No submitted Writing attempt is available yet.",
          true,
        );
      }
      return {
        ok: true,
        data: {
          selection,
          evaluation: stored.evaluation,
          submission: stored.submission,
          evaluationStatus: stored.evaluation
            ? "evaluated"
            : "awaiting_evaluation",
          evaluationRevision: stored.evaluation ? stored.evaluation.revision ?? 1 : 0,
          canReviseEvaluation: Boolean(stored.evaluation) && stored.submission.attemptId === getCurrentWritingAttemptId(),
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
      "Save structured feedback on the visible immutable IELTS Writing submission. Use whole or half-band scores from 0 to 9. Identical retries return the saved evaluation without a new revision. For corrections, read get_ielts_writing_submission and supply its evaluationRevision as expectedRevision. Stale revisions are rejected. The review updates immediately.",
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
            status: "saved",
            revision: evaluation.revision ?? 1,
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
  return [submissionTool, evaluationTool];
}
