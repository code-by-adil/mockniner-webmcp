import { z } from "zod";
import type { AssessmentApplicationCommands } from "@/application/useAssessmentApplication";
import {
  assessmentEvaluationInputSchema,
  getAssessmentEvaluationJsonSchema,
  getAssessmentItemCount,
  getAssessmentPackageJsonSchema,
  stripAssessmentAnswers,
  type AssessmentEvaluation,
  type AssessmentSubmission,
} from "@/domain/assessment";
import { getAssessmentCapabilities } from "@/domain/assessmentProfiles";
import { throwIfCancelled, toolFailure, zodIssues } from "./toolResult";

const emptyInputSchema = {
  type: "object",
  properties: {},
  additionalProperties: false,
} as const;

const getSubmissionInputSchema = {
  type: "object",
  properties: {
    attemptId: {
      type: "string",
      format: "uuid",
      description: "Optional immutable attempt ID. Omit it to read the latest universal assessment submission.",
    },
  },
  additionalProperties: false,
} as const;

type AssessmentToolDependencies = {
  installAssessment: AssessmentApplicationCommands["installAssessment"];
  readAssessmentAttempt: (attemptId?: string) => Promise<{
    submission: AssessmentSubmission;
    evaluation: AssessmentEvaluation | null;
  } | null>;
  attachEvaluation: AssessmentApplicationCommands["attachEvaluation"];
  getCurrentAttemptId: () => string | undefined;
};

export function createAssessmentToolDefinitions({
  installAssessment,
  readAssessmentAttempt,
  attachEvaluation,
  getCurrentAttemptId,
}: AssessmentToolDependencies): WebMCP.ModelContextTool[] {
  return [
    {
      name: "get_assessment_capabilities",
      title: "Read assessment capabilities",
      description:
        "Read the universal assessment profiles, trusted content blocks, response interactions, scoring rules, limits, and authoring guidance supported by this application. Use this before authoring a new universal or SAT-style assessment.",
      inputSchema: emptyInputSchema,
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute: async (input, { signal }) => {
        throwIfCancelled(signal);
        const parsed = z.object({}).strict().safeParse(input);
        if (!parsed.success) {
          return toolFailure("INVALID_INPUT", "The capability request must be empty.", true, zodIssues(parsed.error));
        }
        return { ok: true, data: getAssessmentCapabilities() };
      },
    },
    {
      name: "install_assessment",
      title: "Install universal assessment",
      description:
        "Validate and install a complete declarative assessment assembled from trusted components. Supports a flexible universal profile and original SAT-style practice. Installed assessments immediately appear in the human assessment library. Never include copyrighted test-provider questions or claim an official score.",
      inputSchema: getAssessmentPackageJsonSchema(),
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: async (input, { signal }) => {
        throwIfCancelled(signal);
        try {
          const assessment = await installAssessment(input);
          throwIfCancelled(signal);
          return {
            ok: true,
            data: {
              packageId: assessment.packageId,
              revision: assessment.revision,
              profileId: assessment.profileId,
              title: assessment.title,
              itemCount: getAssessmentItemCount(assessment),
              installed: true,
            },
            sideEffect: { type: "assessment_installed", visibleView: "assessment_library" },
          };
        } catch (error) {
          if (error instanceof z.ZodError) {
            return toolFailure(
              "INVALID_ASSESSMENT",
              "The assessment does not satisfy the universal content contract.",
              true,
              zodIssues(error),
            );
          }
          if (error instanceof Error && /revision|already exists|reserved|in progress/.test(error.message)) {
            return toolFailure("ASSESSMENT_INSTALL_CONFLICT", error.message, true);
          }
          throw error;
        }
      },
    },
    {
      name: "get_assessment_submission",
      title: "Read assessment submission",
      description:
        "Read an immutable submitted universal assessment attempt, its candidate-visible package without answer keys, responses, objective result, rubrics, and evaluation status. Omit attemptId to read the latest submission.",
      inputSchema: getSubmissionInputSchema,
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: async (input, { signal }) => {
        throwIfCancelled(signal);
        const parsed = z.object({ attemptId: z.uuid().optional() }).strict().safeParse(input);
        if (!parsed.success) {
          return toolFailure("INVALID_INPUT", "The submission request is invalid.", true, zodIssues(parsed.error));
        }
        const stored = await readAssessmentAttempt(parsed.data.attemptId);
        throwIfCancelled(signal);
        if (!stored) {
          return toolFailure(
            "ASSESSMENT_SUBMISSION_NOT_FOUND",
            parsed.data.attemptId
              ? `Assessment attempt ${parsed.data.attemptId} was not found.`
              : "No universal assessment has been submitted yet.",
            true,
          );
        }
        return {
          ok: true,
          data: {
            submission: {
              attemptId: stored.submission.attemptId,
              packageId: stored.submission.packageId,
              profileId: stored.submission.profileId,
              package: stripAssessmentAnswers(stored.submission.package),
              responses: stored.submission.responses,
              result: stored.submission.result,
              startedAt: stored.submission.startedAt,
              submittedAt: stored.submission.submittedAt,
            },
            evaluationStatus: stored.evaluation ? "evaluated" :
              stored.submission.result.awaitingEvaluationCount ? "awaiting_evaluation" : "not_required",
            canAttachEvaluation:
              !stored.evaluation &&
              stored.submission.result.awaitingEvaluationCount > 0 &&
              stored.submission.attemptId === getCurrentAttemptId(),
          },
        };
      },
    },
    {
      name: "attach_assessment_evaluation",
      title: "Attach assessment evaluation",
      description:
        "Validate and attach a structured rubric evaluation to the current immutable universal assessment submission. Read the submission first and use exactly its rubric ID, criteria, scale, and response text. On success the visible result updates immediately.",
      inputSchema: getAssessmentEvaluationJsonSchema(),
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: async (input, { signal }) => {
        throwIfCancelled(signal);
        const parsed = assessmentEvaluationInputSchema.safeParse(input);
        if (!parsed.success) {
          return toolFailure("INVALID_EVALUATION", "The evaluation is invalid.", true, zodIssues(parsed.error));
        }
        const stored = await readAssessmentAttempt(parsed.data.attemptId);
        throwIfCancelled(signal);
        if (!stored) {
          return toolFailure("ASSESSMENT_SUBMISSION_NOT_FOUND", `Assessment attempt ${parsed.data.attemptId} was not found.`, false);
        }
        if (stored.evaluation) {
          return toolFailure("EVALUATION_EXISTS", `Assessment attempt ${parsed.data.attemptId} already has an evaluation.`, false);
        }
        if (getCurrentAttemptId() !== parsed.data.attemptId) {
          return toolFailure("ATTEMPT_NOT_CURRENT", `Assessment attempt ${parsed.data.attemptId} is not the current visible submission.`, false);
        }
        try {
          const evaluation = await attachEvaluation(parsed.data);
          throwIfCancelled(signal);
          return {
            ok: true,
            data: {
              status: "attached",
              attemptId: evaluation.attemptId,
              rubricId: evaluation.rubricId,
              overallScore: evaluation.overallScore,
              evaluatedAt: evaluation.evaluatedAt,
            },
            sideEffect: { type: "assessment_evaluation_attached", visibleView: "assessment_results" },
          };
        } catch (error) {
          if (error instanceof Error) {
            return toolFailure("EVALUATION_CONTRACT_MISMATCH", error.message, true);
          }
          throw error;
        }
      },
    },
  ];
}
