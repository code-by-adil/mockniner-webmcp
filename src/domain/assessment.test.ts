import { describe, expect, it } from "vitest";
import { satPracticeAssessment } from "@/content/sat";
import {
  assessmentEvaluationInputSchema,
  gradeAssessment,
  parseAssessmentPackage,
  stripAssessmentAnswers,
  validateAssessmentEvaluation,
  type AssessmentSubmission,
} from "./assessment";

describe("universal assessment domain", () => {
  it("validates the built-in two-section SAT-style profile", () => {
    expect(satPracticeAssessment.profileId).toBe("sat-practice");
    expect(satPracticeAssessment.sections.map((section) => section.id)).toEqual([
      "reading-writing",
      "math",
    ]);
    expect(satPracticeAssessment.sections.every((section) => section.modules.length === 2)).toBe(true);
  });

  it("grades choice and numeric responses with domain summaries", () => {
    const result = gradeAssessment(satPracticeAssessment, {
      "rw-1": "b",
      "rw-2": "a",
      "rw-3": "a",
      "math-1": "6",
      "math-2": "68.0",
      "math-3": "c",
    });

    expect(result.rawScore).toBe(5);
    expect(result.maximumScore).toBe(12);
    expect(result.answeredCount).toBe(6);
    expect(result.domains.find((domain) => domain.domain === "Algebra")).toEqual({
      domain: "Algebra",
      correct: 1,
      total: 2,
    });
  });

  it("grades every deterministic universal interaction", () => {
    const prompt = [{ type: "text" as const, text: "Answer this question." }];
    const assessment = parseAssessmentPackage({
      schemaVersion: 2,
      packageId: "scoring-contract",
      revision: 1,
      profileId: "universal",
      title: "Scoring contract",
      sections: [{
        id: "core",
        title: "Core",
        modules: [{
          id: "module-1",
          title: "Module 1",
          items: [
            {
              id: "single",
              prompt,
              interaction: { type: "single_choice", options: [{ id: "a", label: "A" }, { id: "b", label: "B" }] },
              scoring: { type: "exact", answer: "b" },
            },
            {
              id: "multiple",
              prompt,
              interaction: {
                type: "multiple_choice",
                options: [{ id: "a", label: "A" }, { id: "b", label: "B" }, { id: "c", label: "C" }],
                minimumSelections: 2,
                maximumSelections: 2,
              },
              scoring: { type: "set", answers: ["a", "c"] },
            },
            {
              id: "text",
              prompt,
              interaction: { type: "text_entry" },
              scoring: { type: "aliases", answers: ["renewable energy"], ignorePunctuation: true },
            },
            {
              id: "numeric",
              prompt,
              interaction: { type: "numeric_entry" },
              scoring: { type: "numeric", answer: 3.14, tolerance: 0.01 },
            },
            {
              id: "matching",
              prompt,
              interaction: {
                type: "matching",
                prompts: [{ id: "p1", label: "One" }, { id: "p2", label: "Two" }],
                options: [{ id: "x", label: "X" }, { id: "y", label: "Y" }],
              },
              scoring: { type: "mapping", answers: { p1: "y", p2: "x" } },
            },
          ],
        }],
      }],
    });
    const result = gradeAssessment(assessment, {
      single: "b",
      multiple: ["c", "a"],
      text: "Renewable energy!",
      numeric: "3.149",
      matching: { p1: "y", p2: "x" },
    });
    expect(result).toMatchObject({ rawScore: 5, maximumScore: 5, answeredCount: 5 });
  });

  it("rejects duplicate item IDs", () => {
    const invalid = structuredClone(satPracticeAssessment);
    invalid.sections[1].modules[0].items[0].id = "rw-1";
    expect(() => parseAssessmentPackage(invalid)).toThrow(/Item IDs must be unique/);
  });

  it("rejects scoring rules that do not match their interaction", () => {
    const invalid = structuredClone(satPracticeAssessment);
    invalid.sections[0].modules[0].items[0].scoring = {
      type: "exact",
      answer: "missing-option",
    };
    expect(() => parseAssessmentPackage(invalid)).toThrow(/reference one option ID/);
  });

  it("keeps SAT Reading and Writing on the supported single-choice contract", () => {
    const invalid = structuredClone(satPracticeAssessment);
    invalid.sections[0].modules[0].items[0].interaction = {
      type: "numeric_entry",
    };
    invalid.sections[0].modules[0].items[0].scoring = {
      type: "numeric",
      answer: 4,
    };
    expect(() => parseAssessmentPackage(invalid)).toThrow(
      /SAT Reading and Writing items must use single choice/,
    );
  });

  it("requires one coherent rubric across subjective items in a submission", () => {
    const invalid = structuredClone(satPracticeAssessment);
    invalid.profileId = "universal";
    invalid.rubrics = ["essay-a", "essay-b"].map((id) => ({
      id,
      title: id,
      scale: { minimum: 0, maximum: 4, step: 1 },
      criteria: [{ id: "quality", label: "Quality", description: "Overall response quality." }],
      requireEvidence: true,
      allowAnnotations: true,
    }));
    invalid.sections[0].modules[0].items.slice(0, 2).forEach((item, index) => {
      item.interaction = { type: "extended_text" };
      item.scoring = { type: "agent" };
      item.evaluationRubricId = invalid.rubrics[index]!.id;
    });
    expect(() => parseAssessmentPackage(invalid)).toThrow(/must share one rubric/);
  });

  it("rejects scoring rules outside the short-text interaction contract", () => {
    const invalid = structuredClone(satPracticeAssessment);
    invalid.profileId = "universal";
    invalid.sections[0].modules[0].items[0].interaction = { type: "text_entry" };
    invalid.sections[0].modules[0].items[0].scoring = { type: "set", answers: ["a"] };
    expect(() => parseAssessmentPackage(invalid)).toThrow(
      /Text-entry items require exact, alias, or agent scoring/,
    );
  });

  it("removes answer keys from the candidate-facing package", () => {
    expect(JSON.stringify(stripAssessmentAnswers(satPracticeAssessment))).not.toContain('"scoring"');
  });

  it("requires a structured rubric evaluation", () => {
    const parsed = assessmentEvaluationInputSchema.safeParse({
      attemptId: crypto.randomUUID(),
      rubricId: "essay",
      overallScore: 4,
      criteria: [],
      summary: "Clear response.",
      strengths: ["Focused claim"],
      improvements: ["Add evidence"],
      annotations: [],
    });
    expect(parsed.success).toBe(false);
  });

  it("validates evidence and annotations against an immutable subjective submission", () => {
    const authored = structuredClone(satPracticeAssessment);
    authored.profileId = "universal";
    authored.packageId = "argument-writing";
    authored.sections = [authored.sections[0]!];
    authored.sections[0]!.id = "writing";
    authored.sections[0]!.modules = [authored.sections[0]!.modules[0]!];
    authored.sections[0]!.modules[0]!.items = [authored.sections[0]!.modules[0]!.items[0]!];
    const item = authored.sections[0]!.modules[0]!.items[0]!;
    item.id = "essay-1";
    item.interaction = { type: "extended_text", minimumWords: 1 };
    item.scoring = { type: "agent" };
    item.evaluationRubricId = "argument";
    authored.rubrics = [{
      id: "argument",
      title: "Argument rubric",
      scale: { minimum: 0, maximum: 4, step: 1 },
      criteria: [{ id: "claim", label: "Claim", description: "Quality of the central claim." }],
      requireEvidence: true,
      allowAnnotations: true,
    }];
    const assessment = parseAssessmentPackage(authored);
    const responses = { "essay-1": "Public libraries strengthen local communities." };
    expect(gradeAssessment(assessment, {}).awaitingEvaluationCount).toBe(0);
    const submission: AssessmentSubmission = {
      attemptId: "33333333-3333-4333-8333-333333333333",
      packageId: assessment.packageId,
      profileId: assessment.profileId,
      package: assessment,
      responses,
      result: gradeAssessment(assessment, responses),
      startedAt: "2026-09-02T10:00:00.000Z",
      submittedAt: "2026-09-02T10:10:00.000Z",
    };
    const evaluation = assessmentEvaluationInputSchema.parse({
      attemptId: submission.attemptId,
      rubricId: "argument",
      overallScore: 3,
      criteria: [{
        criterionId: "claim",
        score: 3,
        feedback: "The claim is direct and relevant.",
        evidence: ["strengthen local communities"],
      }],
      summary: "A clear start that needs supporting evidence.",
      strengths: ["Focused claim"],
      improvements: ["Add a concrete example"],
      annotations: [{
        itemId: "essay-1",
        originalText: "strengthen local communities",
        suggestion: "strengthen communities by expanding access",
        explanation: "This makes the mechanism more specific.",
      }],
    });

    expect(() => validateAssessmentEvaluation(submission, evaluation)).not.toThrow();
    expect(() => validateAssessmentEvaluation(submission, {
      ...evaluation,
      criteria: [{ ...evaluation.criteria[0]!, evidence: [] }],
    })).toThrow(/must include evidence/);
  });
});
