import { describe, expect, it } from "vitest";
import { getAssessmentAuthoringKit } from "@/content/assessmentExamples";
import { parseAssessmentPackage } from "./assessmentContract";
import { assessmentEvaluationInputSchema, prepareAssessmentEvaluation } from "./assessmentEvaluation";
import { gradeAssessment } from "./assessmentScoring";
import type { AssessmentSubmission } from "./assessmentSubmission";

function fixture() {
  const assessment = parseAssessmentPackage({ ...getAssessmentAuthoringKit("writing-with-rubric").examplePackage, source: "agent" });
  const itemId = assessment.parts[0].items[0].id;
  const responses = { [itemId]: "Public libraries strengthen local communities." };
  const submission: AssessmentSubmission = {
    attemptId: "33333333-3333-4333-8333-333333333333", packageId: assessment.packageId,
    package: assessment, responses, result: gradeAssessment(assessment, responses),
    startedAt: "2026-09-03T10:00:00Z", submittedAt: "2026-09-03T10:10:00Z",
  };
  const input = assessmentEvaluationInputSchema.parse({
    attemptId: submission.attemptId,
    criteria: assessment.rubric!.criteria.map(criterion => ({
      criterionId: criterion.id, score: 3, feedback: "Direct and relevant.", evidence: ["strengthen local communities"],
    })),
    summary: "A clear start that needs evidence.", strengths: ["Focused claim"], improvements: ["Add a concrete example"],
    annotations: [{ itemId, originalText: "strengthen local communities", suggestion: "strengthen communities by expanding access", explanation: "Name the mechanism." }],
  });
  return { submission, input };
}

describe("assessment rubric evaluation", () => {
  it("prepares validated feedback with a locally calculated score", () => {
    const { submission, input } = fixture();
    const before = JSON.stringify(submission);
    expect(prepareAssessmentEvaluation(submission, input)).toMatchObject({ overallScore: 3, criteria: input.criteria });
    expect(prepareAssessmentEvaluation(submission, input)).not.toHaveProperty("expectedRevision");
    expect(JSON.stringify(submission)).toBe(before);
    expect(() => assessmentEvaluationInputSchema.parse({ ...input, overallScore: 4 })).toThrow(/Unrecognized key/);
    expect(() => assessmentEvaluationInputSchema.parse({ ...input, rubricId: "argument" })).toThrow(/Unrecognized key/);
  });

  it("uses criterion weights independent of response order, or equal weighting when omitted", () => {
    const { submission, input } = fixture();
    input.criteria[0].score = 0;
    input.criteria[1].score = 4;
    expect(prepareAssessmentEvaluation(submission, input).overallScore).toBe(2);
    const rubric = submission.package.rubric!;
    rubric.criteria[0].weight = 0.75;
    rubric.criteria[1].weight = 0.25;
    expect(prepareAssessmentEvaluation(submission, { ...input, criteria: [...input.criteria].reverse() }).overallScore).toBe(1);
    rubric.criteria.forEach(criterion => { delete criterion.weight; });
    expect(prepareAssessmentEvaluation(submission, input).overallScore).toBe(2);
  });

  it("rounds the mean to a scale step relative to the minimum", () => {
    const { submission, input } = fixture();
    submission.package.rubric!.scale = { minimum: 1, maximum: 5, step: 2 };
    input.criteria[0].score = 1;
    input.criteria[1].score = 3;
    expect(prepareAssessmentEvaluation(submission, input).overallScore).toBe(3);
    input.criteria.forEach(criterion => { criterion.score = 1; });
    expect(prepareAssessmentEvaluation(submission, input).overallScore).toBe(1);
    input.criteria.forEach(criterion => { criterion.score = 5; });
    expect(prepareAssessmentEvaluation(submission, input).overallScore).toBe(5);
  });

  it("rejects partial or inconsistent criterion weights", () => {
    const { submission } = fixture();
    delete submission.package.rubric!.criteria[0].weight;
    expect(() => parseAssessmentPackage(submission.package)).toThrow(/every criterion/);
    submission.package.rubric!.criteria[0].weight = 0.1;
    expect(() => parseAssessmentPackage(submission.package)).toThrow(/sum to 1/);
  });

  it("keeps decimal score steps stable for display and storage", () => {
    const { submission, input } = fixture();
    submission.package.rubric!.scale = { minimum: 0.1, maximum: 0.5, step: 0.1 };
    input.criteria[0].score = 0.2;
    input.criteria[1].score = 0.4;
    expect(prepareAssessmentEvaluation(submission, input).overallScore).toBe(0.3);
    submission.package.rubric!.scale = { minimum: 0, maximum: 1, step: 0.1 };
    input.criteria[0].score = 0.3;
    input.criteria[1].score = 0.4;
    expect(prepareAssessmentEvaluation(submission, input).overallScore).toBe(0.4);
  });

  it("preserves large integer scores and scientific-notation scale steps", () => {
    const { submission, input } = fixture();
    submission.package.rubric!.scale = { minimum: 1e12, maximum: 1e12 + 10, step: 1 };
    input.criteria.forEach(criterion => { criterion.score = 1e12 + 1; });
    expect(prepareAssessmentEvaluation(submission, input).overallScore).toBe(1e12 + 1);
    submission.package.rubric!.criteria.forEach(criterion => { criterion.weight = 0.500000004; });
    expect(() => parseAssessmentPackage(submission.package)).not.toThrow();
    expect(prepareAssessmentEvaluation(submission, input).overallScore).toBe(1e12 + 1);
    submission.package.rubric!.scale = { minimum: 1e-7, maximum: 5e-7, step: 1e-7 };
    input.criteria[0].score = 2e-7;
    input.criteria[1].score = 4e-7;
    expect(prepareAssessmentEvaluation(submission, input).overallScore).toBe(3e-7);
  });

  it("requires each rubric criterion exactly once with an allowed score", () => {
    const { submission, input } = fixture();
    expect(() => prepareAssessmentEvaluation(submission, { ...input, criteria: [input.criteria[0]] })).toThrow(/match the rubric exactly/);
    expect(() => prepareAssessmentEvaluation(submission, { ...input, criteria: [input.criteria[0], input.criteria[0]] })).toThrow(/match the rubric exactly/);
    expect(() => prepareAssessmentEvaluation(submission, { ...input, criteria: [{ ...input.criteria[0], criterionId: "missing" }, input.criteria[1]] })).toThrow(/match the rubric exactly/);
    for (const score of [-1, 1.5, 5]) {
      expect(() => prepareAssessmentEvaluation(submission, { ...input, criteria: [{ ...input.criteria[0], score }, input.criteria[1]] })).toThrow(/outside the rubric scale or step/);
    }
  });

  it("requires evidence and annotation text from answered subjective responses", () => {
    const { submission, input } = fixture();
    expect(() => prepareAssessmentEvaluation(submission, { ...input, criteria: input.criteria.map(criterion => ({ ...criterion, evidence: [] })) })).toThrow(/must include evidence/);
    expect(() => prepareAssessmentEvaluation(submission, { ...input, criteria: input.criteria.map(criterion => ({ ...criterion, evidence: ["not submitted"] })) })).toThrow(/was not found in the submitted responses/);
    expect(() => prepareAssessmentEvaluation(submission, { ...input, annotations: [{ ...input.annotations[0], itemId: "missing" }] })).toThrow(/is not an answered agent-evaluated response/);
    expect(() => prepareAssessmentEvaluation(submission, { ...input, annotations: [{ ...input.annotations[0], originalText: "not submitted" }] })).toThrow(/was not found in response/);
    submission.package.rubric!.allowAnnotations = false;
    expect(() => prepareAssessmentEvaluation(submission, input)).toThrow(/does not allow inline annotations/);
  });

  it("rejects an unrelated attempt and unanswered submissions", () => {
    const { submission, input } = fixture();
    expect(() => prepareAssessmentEvaluation(submission, { ...input, attemptId: crypto.randomUUID() })).toThrow(/must target this submitted attempt/);
    expect(() => prepareAssessmentEvaluation({ ...submission, responses: {}, result: gradeAssessment(submission.package, {}) }, input)).toThrow(/no responses requiring/);
  });
});
