import { z } from "zod";
import type { ExamApplicationCommands } from "@/application/commands";
import type { WritingEvaluation, WritingSubmission } from "@/domain/types";
import { writingEvaluationInputSchema } from "@/domain/writingEvaluation";

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

const attachWritingEvaluationInputSchema = z.toJSONSchema(
  writingEvaluationInputSchema,
  { target: "draft-07" },
);

function describeValidationError(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "input"}: ${issue.message}`)
    .join("; ");
}

function throwIfCancelled(signal: AbortSignal): void {
  if (signal.aborted) {
    throw signal.reason ?? new DOMException("Tool execution was cancelled.", "AbortError");
  }
}

type WritingToolDependencies = {
  readWritingAttempt: (
    attemptId?: string,
  ) => Promise<{ submission: WritingSubmission; evaluation: WritingEvaluation | null } | null>;
  attachWritingEvaluation: ExamApplicationCommands["attachWritingEvaluation"];
};

export function createWritingToolDefinitions({
  readWritingAttempt,
  attachWritingEvaluation,
}: WritingToolDependencies): WebMCP.ModelContextTool[] {
  return [
    {
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
          throw new Error(`Invalid input: ${describeValidationError(parsed.error)}`);
        }
        const stored = await readWritingAttempt(parsed.data.attemptId);
        throwIfCancelled(signal);
        if (!stored) {
          throw new Error(parsed.data.attemptId
            ? `Writing attempt ${parsed.data.attemptId} was not found.`
            : "No submitted Writing attempt is available yet.");
        }
        return {
          submission: stored.submission,
          evaluationStatus: stored.evaluation ? "evaluated" : "awaiting_evaluation",
        };
      },
    },
    {
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
          throw new Error(`Invalid evaluation: ${describeValidationError(parsed.error)}`);
        }
        const evaluation = await attachWritingEvaluation(parsed.data);
        throwIfCancelled(signal);
        return {
          status: "attached",
          attemptId: evaluation.attemptId,
          overallBand: evaluation.overallBand,
          evaluatedAt: evaluation.evaluatedAt,
          visibleView: "writing_review",
        };
      },
    },
  ];
}
