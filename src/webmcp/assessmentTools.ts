import { z } from "zod";
import type { AssessmentApplicationCommands } from "@/application/useAssessmentApplication";
import { getAssessmentAuthoringKit } from "@/content/assessmentExamples";
import {
  assessmentEvaluationInputSchema,
  ASSESSMENT_AUTHORING_TEMPLATE_IDS,
  getAssessmentEvaluationJsonSchema,
  getAssessmentEvaluationStatus,
  getAssessmentItemCount,
  getAssessmentPackageJsonSchema,
  stripAssessmentAnswers,
  type AssessmentEvaluation,
  type AssessmentSubmission,
} from "@/domain/assessment";
import { throwIfCancelled, toolFailure, zodIssues } from "./toolResult";

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

const getAuthoringKitInputSchema = {
  type: "object",
  properties: {
    template: {
      type: "string",
      enum: ASSESSMENT_AUTHORING_TEMPLATE_IDS,
      description:
        "The closest authoring pattern. Choose minimal-objective for ordinary quizzes, writing-with-rubric for extended responses, or a named exam-style template when it matches the request.",
    },
  },
  required: ["template"],
  additionalProperties: false,
} as const;

export type AssessmentToolSurface = "authoring" | "results" | "evaluation" | "none";

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
}: AssessmentToolDependencies, surface: AssessmentToolSurface = "authoring"): WebMCP.ModelContextTool[] {
  const authoringTools: WebMCP.ModelContextTool[] = [
    {
      name: "get_assessment_authoring_kit",
      title: "Get universal assessment authoring kit",
      description:
        "Return the engine capabilities, supported and unsupported behavior, authoring rules, and one complete JSON package for a chosen non-IELTS assessment pattern. Use the closest template before creating a universal assessment. Native IELTS Listening, Reading, and Writing use install_practice_set instead.",
      inputSchema: getAuthoringKitInputSchema,
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute: async (input, { signal }) => {
        throwIfCancelled(signal);
        const parsed = z.object({ template: z.enum(ASSESSMENT_AUTHORING_TEMPLATE_IDS) }).strict().safeParse(input);
        if (!parsed.success) {
          return toolFailure(
            "INVALID_AUTHORING_TEMPLATE",
            "Choose one of the declared assessment templates.",
            true,
            zodIssues(parsed.error),
          );
        }
        return { ok: true, data: getAssessmentAuthoringKit(parsed.data.template) };
      },
    },
    {
      name: "install_assessment",
      title: "Install universal assessment",
      description:
        "Validate and install one complete universal assessment package. Use this for GRE-style, SAT-style, school, professional, and custom practice built from the declared engine capabilities. Native IELTS Listening, Reading, and Writing use install_practice_set. Installation is atomic, and a successful package appears in the assessment library immediately.",
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
  ];
  const submissionTool: WebMCP.ModelContextTool = {
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
            package: stripAssessmentAnswers(stored.submission.package),
            responses: stored.submission.responses,
            result: stored.submission.result,
            startedAt: stored.submission.startedAt,
            submittedAt: stored.submission.submittedAt,
          },
          evaluationStatus: getAssessmentEvaluationStatus(
            stored.submission.result,
            stored.evaluation,
          ),
          canAttachEvaluation:
            !stored.evaluation &&
            stored.submission.result.awaitingEvaluationCount > 0 &&
            stored.submission.attemptId === getCurrentAttemptId(),
        },
      };
    },
  };
  const evaluationTool: WebMCP.ModelContextTool = {
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
  };
  if (surface === "authoring") return authoringTools;
  if (surface === "results") return [submissionTool];
  if (surface === "evaluation") return [submissionTool, evaluationTool];
  return [];
}
