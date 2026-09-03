import { z } from "zod";
import { assessmentSubmissionForAgent } from '@/domain/assessmentReview';
import { readSelectedSubmission, submissionSelectionSchema } from './submissionSelection';
import type { AssessmentApplicationCommands } from "@/application/assessmentCommands";
import { getAssessmentAuthoringKit } from "@/content/assessmentExamples";
import {
  assessmentEvaluationInputSchema,
  ASSESSMENT_AUTHORING_TEMPLATE_IDS,
  getAssessmentEvaluationStatus,
  getAssessmentItemCount,
  getAssessmentAuthoringGuide,
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
  includeAuthoringExamples = () => true,
}: Pick<AssessmentToolDependencies, "installAssessment"> & { includeAuthoringExamples?: () => boolean }): WebMCP.ModelContextTool[] {
  return [
    {
      name: "get_assessment_authoring_kit",
      title: "Get universal assessment authoring kit",
      description:
        "Return universal engine capabilities, limits, rules and package schema. Includes one complete example package only when no unfinished practice exists; otherwise returns guidance without examples to protect answer keys. Choose the closest template for the requested practice.",
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
        const examplesIncluded = includeAuthoringExamples();
        return { ok: true, data: {
          ...(examplesIncluded ? getAssessmentAuthoringKit(parsed.data.template) : {
            ...getAssessmentAuthoringGuide(parsed.data.template),
            nextAction: "Examples are omitted while unfinished practice exists to protect answer keys. Build original content using the rules and packageSchema. Open the library before calling install_assessment.",
          }),
          examplesIncluded,
          packageSchema: getAssessmentPackageJsonSchema(),
        } };
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
      "Read a submitted assessment. Review policy: answers includes keys and correctness; responses omits both; none hides objective item details. Rubric-scored responses remain available for evaluation. No parameters means the visible submission; use latest: true or attemptId for history. Never reads drafts or navigates.",
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
          submission: assessmentSubmissionForAgent(stored.submission),
          evaluationStatus: getAssessmentEvaluationStatus(
            stored.submission.result,
            stored.evaluation,
          ),
          evaluationRevision: stored.evaluation ? stored.evaluation.revision ?? 1 : 0,
          canReviseEvaluation: Boolean(stored.evaluation) && stored.submission.attemptId === getCurrentAttemptId(),
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
      "Save rubric feedback on the visible immutable universal assessment submission. Read its rubric ID, criteria, scale and response text first. Identical retries return the saved evaluation without a new revision. For corrections, supply the reader's evaluationRevision as expectedRevision. Stale revisions are rejected. The visible result updates immediately.",
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
            status: "saved",
            revision: evaluation.revision ?? 1,
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
  if (surface === "results" || surface === "evaluation") return [submissionTool, evaluationTool];
  return [];
}
