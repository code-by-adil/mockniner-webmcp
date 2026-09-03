import { z } from "zod";
import { expectedEvaluationRevisionSchema } from './evaluationRevision';
import type {
  AssessmentEvaluationStatus,
  AssessmentSubmission,
} from "./assessmentSubmission";
import {
  hasAssessmentResponse,
  type AssessmentResult,
} from "./assessmentScoring";

const identifierSchema = z.string().trim().min(1).max(100)
  .regex(/^[a-z0-9][a-z0-9._-]*$/);
const shortTextSchema = z.string().trim().min(1).max(500);
const bodyTextSchema = z.string().trim().min(1).max(20_000);
const evaluationScoreSchema = z.strictObject({
  criterionId: identifierSchema, score: z.number().finite(), feedback: bodyTextSchema,
  evidence: z.array(bodyTextSchema).max(20).default([]),
});

export const assessmentEvaluationInputSchema = z.strictObject({
  attemptId: z.uuid(),
  expectedRevision: expectedEvaluationRevisionSchema,
  rubricId: identifierSchema,
  overallScore: z.number().finite(),
  criteria: z.array(evaluationScoreSchema).min(1).max(20),
  summary: bodyTextSchema,
  strengths: z.array(shortTextSchema).min(1).max(10),
  improvements: z.array(shortTextSchema).min(1).max(10),
  annotations: z.array(z.strictObject({
    itemId: identifierSchema, originalText: bodyTextSchema,
    suggestion: bodyTextSchema, explanation: bodyTextSchema,
  })).max(100).default([]),
});
export const assessmentEvaluationSchema = assessmentEvaluationInputSchema.omit({ expectedRevision: true }).extend({
  revision: z.number().int().positive().optional(),
  evaluatedAt: z.iso.datetime({ offset: true }),
});
export type AssessmentEvaluationInput = z.infer<typeof assessmentEvaluationInputSchema>;
export type AssessmentEvaluation = z.infer<typeof assessmentEvaluationSchema>;
export function getAssessmentEvaluationStatus(
  result: AssessmentResult,
  evaluation?: AssessmentEvaluation | null,
): AssessmentEvaluationStatus {
  if (evaluation) return "evaluated";
  return result.awaitingEvaluationCount > 0 ? "awaiting_evaluation" : "not_required";
}

export function validateAssessmentEvaluation(
  submission: AssessmentSubmission,
  evaluation: AssessmentEvaluationInput,
): void {
  if (submission.result.awaitingEvaluationCount === 0) {
    throw new Error("This assessment has no responses requiring agent evaluation.");
  }
  const agentItems = submission.package.parts.flatMap((part) => part.items).filter(
    (item) => item.scoring.type === "agent" && hasAssessmentResponse(submission.responses[item.id]),
  );
  const expectedRubricId = agentItems[0]?.evaluationRubricId;
  if (!expectedRubricId || evaluation.rubricId !== expectedRubricId) {
    throw new Error(`The evaluation must use rubric ${expectedRubricId ?? "declared by the subjective items"}.`);
  }
  const rubric = submission.package.rubrics.find((candidate) => candidate.id === evaluation.rubricId);
  if (!rubric) throw new Error(`Rubric ${evaluation.rubricId} is not part of this assessment.`);
  const scoreIsValid = (score: number) => {
    if (score < rubric.scale.minimum || score > rubric.scale.maximum) return false;
    const increments = (score - rubric.scale.minimum) / rubric.scale.step;
    return Math.abs(increments - Math.round(increments)) < 1e-8;
  };
  if (!scoreIsValid(evaluation.overallScore)) {
    throw new Error("The overall score is outside the rubric scale or step.");
  }
  const expectedCriteria = new Set(rubric.criteria.map((criterion) => criterion.id));
  const suppliedCriteria = evaluation.criteria.map((criterion) => criterion.criterionId);
  if (
    new Set(suppliedCriteria).size !== suppliedCriteria.length ||
    suppliedCriteria.length !== expectedCriteria.size ||
    suppliedCriteria.some((id) => !expectedCriteria.has(id))
  ) {
    throw new Error("Evaluation criteria must match the rubric exactly.");
  }
  if (evaluation.criteria.some((criterion) => !scoreIsValid(criterion.score))) {
    throw new Error("One or more criterion scores are outside the rubric scale or step.");
  }
  if (rubric.requireEvidence && evaluation.criteria.some((criterion) => criterion.evidence.length === 0)) {
    throw new Error("Every criterion must include evidence from the submitted responses.");
  }
  if (!rubric.allowAnnotations && evaluation.annotations.length > 0) {
    throw new Error("This rubric does not allow inline annotations.");
  }
  const agentItemIds = new Set(agentItems.map((item) => item.id));
  const responseTextByItem = new Map(
    Object.entries(submission.responses).flatMap(([itemId, response]) =>
      typeof response === "string" ? [[itemId, response] as const] : [],
    ),
  );
  const responseTexts = [...responseTextByItem.entries()]
    .filter(([itemId]) => agentItemIds.has(itemId))
    .map(([, response]) => response);
  evaluation.criteria.forEach((criterion) => {
    criterion.evidence.forEach((evidence) => {
      if (!responseTexts.some((response) => response.includes(evidence))) {
        throw new Error(`Evidence for criterion ${criterion.criterionId} was not found in the submitted responses.`);
      }
    });
  });
  evaluation.annotations.forEach((annotation) => {
    if (!agentItemIds.has(annotation.itemId)) {
      throw new Error(`Annotation item ${annotation.itemId} is not an answered agent-evaluated response.`);
    }
    const response = responseTextByItem.get(annotation.itemId);
    if (!response || !response.includes(annotation.originalText)) {
      throw new Error(`Annotation text was not found in response ${annotation.itemId}.`);
    }
  });
}
