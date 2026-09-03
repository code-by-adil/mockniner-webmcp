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
  overallScore: z.number().finite(),
  revision: z.number().int().positive(),
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

export function prepareAssessmentEvaluation(
  submission: AssessmentSubmission,
  evaluation: AssessmentEvaluationInput,
): Omit<AssessmentEvaluation, "revision" | "evaluatedAt"> {
  if (evaluation.attemptId !== submission.attemptId) {
    throw new Error("The evaluation must target this submitted attempt.");
  }
  if (submission.result.awaitingEvaluationCount === 0) {
    throw new Error("This assessment has no responses requiring agent evaluation.");
  }
  const agentItems = submission.package.parts.flatMap((part) => part.items).filter(
    (item) => item.scoring.type === "agent" && hasAssessmentResponse(submission.responses[item.id]),
  );
  const rubric = submission.package.rubric;
  if (!rubric) throw new Error("This assessment has no evaluation rubric.");
  const scoreIsValid = (score: number) => {
    if (score < rubric.scale.minimum || score > rubric.scale.maximum) return false;
    const increments = (score - rubric.scale.minimum) / rubric.scale.step;
    return Math.abs(increments - Math.round(increments)) < 1e-8;
  };
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
  const scores = new Map(evaluation.criteria.map(criterion => [criterion.criterionId, criterion.score]));
  const totalWeight = rubric.criteria.reduce((sum, criterion) => sum + (criterion.weight ?? 1), 0);
  const average = rubric.criteria.reduce((sum, criterion) =>
    sum + scores.get(criterion.id)! * ((criterion.weight ?? 1) / totalWeight), 0);
  const { minimum, maximum, step } = rubric.scale;
  const increments = (average - minimum) / step;
  const roundingTolerance = Number.EPSILON * Math.max(1, Math.abs(increments)) * 4;
  const stepped = minimum + Math.round(increments + roundingTolerance) * step;
  const decimalPlaces = (value: number) => {
    const [coefficient, exponent = "0"] = value.toString().split("e");
    return Math.max(0, (coefficient.split(".")[1]?.length ?? 0) - Number(exponent));
  };
  const places = Math.max(decimalPlaces(minimum), decimalPlaces(step));
  const precision = Math.max(1, Math.floor(Math.log10(Math.abs(stepped))) + 1 + places);
  // Beyond toPrecision's supported range, every representable digit already
  // lies before the declared decimal boundary and no rounding is needed.
  const rounded = precision > 100 ? stepped : Number(stepped.toPrecision(precision));
  const overallScore = Math.min(maximum, Math.max(minimum, rounded));
  const { expectedRevision: _expectedRevision, ...feedback } = evaluation;
  return { ...feedback, overallScore };
}
