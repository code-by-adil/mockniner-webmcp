import { z } from "zod";
import { readSelectedSubmission, submissionSelectionSchema } from './submissionSelection';
import type { AssessmentApplicationCommands } from "@/application/assessmentCommands";
import { getAssessmentAuthoringKit } from "@/content/assessmentExamples";
import {
  assessmentEvaluationInputSchema,
  ASSESSMENT_AUTHORING_TEMPLATE_IDS,
  getAssessmentEvaluationStatus,
  getAssessmentItemCount,
  stripAssessmentAnswers,
  type AssessmentEvaluation,
  type AssessmentSubmission,
} from "@/domain/assessment";
import {
  getAssessmentEvaluationJsonSchema,
  getAssessmentPackageJsonSchema,
} from "./assessmentSchemas";
import {
  applicationFailure,
  getToolExecutionSignal,
  throwIfCancelled,
  toolFailure,
  zodIssues,
} from "./toolResult";

const getAuthoringKitInputSchema = {
  type: "object",
  properties: {
    template: {
      type: "string",
      enum: ASSESSMENT_AUTHORING_TEMPLATE_IDS,
      description:
        "Choose minimal-objective for quizzes, writing-with-rubric for extended responses, or the named exam-style template matching the request.",
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

export function createAssessmentAuthoringToolDefinitions({
  installAssessment,
}: Pick<AssessmentToolDependencies, "installAssessment">): WebMCP.ModelContextTool[] {
  return [
    {
      name: "get_assessment_authoring_kit",
      title: "Get universal assessment authoring kit",
      description:
        "Return universal engine capabilities, coverage limits, authoring rules, and one complete example package. Available only when no unfinished practice exists, including paused drafts, because examples contain answer keys. Use the closest template for GRE-style, SAT-style, school, professional, or custom practice.",
      inputSchema: getAuthoringKitInputSchema,
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute: async (input, options) => {
        const signal = getToolExecutionSignal(options);
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
        "Validate and install one complete universal assessment package built from get_assessment_authoring_kit. Installation is atomic, and a successful package appears in the assessment library immediately.",
      inputSchema: getAssessmentPackageJsonSchema(),
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      execute: async (input, options) => {
        const signal = getToolExecutionSignal(options);
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
          return applicationFailure(error);
        }
      },
    },
  ];
}

export function createAssessmentToolDefinitions({
  installAssessment,
  readAssessmentAttempt,
  attachEvaluation,
  getCurrentAttemptId,
}: AssessmentToolDependencies, surface: AssessmentToolSurface = "authoring"): WebMCP.ModelContextTool[] {
  if (surface === "authoring") {
    return createAssessmentAuthoringToolDefinitions({ installAssessment });
  }
  const submissionTool: WebMCP.ModelContextTool = {
    name: "get_assessment_submission",
    title: "Read assessment submission",
    description:
      "Read the visible universal assessment submission, responses, objective result, rubrics and attached evaluation, without answer keys. No parameters means the submission on screen. Use latest: true for the newest saved attempt, or attemptId for an exact historical attempt. Reading never changes the visible page.",
    inputSchema: submissionSelectionSchema,
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute: async (input, options) => {
      const signal = getToolExecutionSignal(options);
      throwIfCancelled(signal);
      const selected = await readSelectedSubmission(input, readAssessmentAttempt, getCurrentAttemptId, signal);
      if (!selected.ok) return selected;
      const { stored, requestedId, selection } = selected;
      if (!stored) {
        return toolFailure(
          "ASSESSMENT_SUBMISSION_NOT_FOUND",
          requestedId
            ? `Assessment attempt ${requestedId} was not found.`
            : "No universal assessment has been submitted yet.",
          true,
        );
      }
      return {
        ok: true,
        data: {
          selection,
          evaluation: stored.evaluation,
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
    execute: async (input, options) => {
      const signal = getToolExecutionSignal(options);
      throwIfCancelled(signal);
      const parsed = assessmentEvaluationInputSchema.safeParse(input);
      if (!parsed.success) {
        return toolFailure("INVALID_EVALUATION", "The evaluation is invalid.", true, zodIssues(parsed.error));
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
        return applicationFailure(error);
      }
    },
  };
  if (surface === "results") return [submissionTool];
  if (surface === "evaluation") return [submissionTool, evaluationTool];
  return [];
}
