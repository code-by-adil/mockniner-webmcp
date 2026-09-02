import { describe, expect, it } from "vitest";
import { getAssessmentAuthoringKit } from "@/content/assessmentExamples";
import { greStyleAssessment } from "@/content/gre";
import { satPracticeAssessment } from "@/content/sat";
import {
  ASSESSMENT_AUTHORING_TEMPLATE_IDS,
  assessmentEvaluationInputSchema,
  compileAssessment,
  getAssessmentPackageJsonSchema,
  getAssessmentResponseGuidance,
  gradeAssessment,
  parseAssessmentAuthoringPackage,
  parseAssessmentPackage,
  stripAssessmentAnswers,
  validateAssessmentEvaluation,
  type AssessmentPackage,
  type AssessmentSubmission,
} from "./assessment";

function scoringContract(): AssessmentPackage {
  const prompt = [{ type: "text" as const, text: "Answer this question." }];
  return parseAssessmentPackage({
    schemaVersion: 3 as const,
    packageId: "scoring-contract",
    revision: 1,
    title: "Scoring contract",
    source: "built-in",
    parts: [{
      id: "core",
      title: "Core",
      items: [
        {
          id: "single", prompt,
          interaction: { type: "single_choice" as const, options: [{ id: "a", label: "A" }, { id: "b", label: "B" }] },
          scoring: { type: "exact" as const, answer: "b" },
        },
        {
          id: "multiple", prompt,
          interaction: {
            type: "multiple_choice" as const,
            options: [{ id: "a", label: "A" }, { id: "b", label: "B" }, { id: "c", label: "C" }],
            minimumSelections: 2, maximumSelections: 2,
          },
          scoring: { type: "set" as const, answers: ["a", "c"] },
        },
        {
          id: "text", prompt,
          interaction: { type: "text_entry" as const },
          scoring: { type: "aliases" as const, answers: ["renewable energy"], ignorePunctuation: true },
        },
        {
          id: "numeric", prompt,
          interaction: { type: "numeric_entry" as const },
          scoring: { type: "numeric" as const, answer: 3.5 },
        },
        {
          id: "matching", prompt,
          interaction: {
            type: "matching" as const,
            prompts: [{ id: "p1", label: "One" }, { id: "p2", label: "Two" }],
            options: [{ id: "x", label: "X" }, { id: "y", label: "Y" }],
          },
          scoring: { type: "mapping" as const, answers: { p1: "y", p2: "x" } },
        },
        {
          id: "grouped", prompt,
          interaction: {
            type: "grouped_choice" as const,
            groups: [
              {
                id: "blank-1",
                label: "Blank 1",
                options: [{ id: "b1-a", label: "A" }, { id: "b1-b", label: "B" }],
              },
              {
                id: "blank-2",
                label: "Blank 2",
                options: [{ id: "b2-a", label: "A" }, { id: "b2-b", label: "B" }],
              },
            ],
          },
          scoring: { type: "mapping" as const, answers: { "blank-1": "b1-b", "blank-2": "b2-a" } },
        },
      ],
    }],
  });
}

describe("assessment domain", () => {
  it("keeps package provenance outside the agent authoring contract", () => {
    const { source: _source, ...authorable } = satPracticeAssessment;
    expect(parseAssessmentAuthoringPackage(authorable).packageId).toBe(authorable.packageId);
    expect(() => parseAssessmentAuthoringPackage(satPracticeAssessment)).toThrow(/Unrecognized key/);

    const schema = getAssessmentPackageJsonSchema() as { properties?: Record<string, unknown> };
    expect(schema.properties).not.toHaveProperty("source");
  });

  it("compiles the SAT-style package without encoding SAT rules in the engine", () => {
    const plan = compileAssessment(satPracticeAssessment);
    expect(satPracticeAssessment.schemaVersion).toBe(3);
    expect(plan.parts.map((part) => part.id)).toEqual([
      "rw-module-1", "rw-module-2", "math-module-1", "math-module-2",
    ]);
    expect(plan.parts[0]!.resources).toEqual([]);
    expect(plan.parts[2]!.resources.map((resource) => resource.id)).toEqual(["math-formulas"]);
    expect(plan.parts[0]!.items[0]!.layout).toBe("split");
    expect(plan.parts[2]!.items[1]!.layout).toBe("single");
  });

  it("grades every deterministic interaction, including fractional numeric input", () => {
    const assessment = parseAssessmentPackage(scoringContract());
    const result = gradeAssessment(assessment, {
      single: "b",
      multiple: ["c", "a"],
      text: "Renewable energy!",
      numeric: "7/2",
      matching: { p1: "y", p2: "x" },
      grouped: { "blank-1": "b1-b", "blank-2": "b2-a" },
    });
    expect(result).toMatchObject({ rawScore: 6, maximumScore: 6, answeredCount: 6 });
    expect(result.itemResults[0]).toMatchObject({ partId: "core" });
  });

  it("grades the complete GRE-style example and leaves its essay for evaluation", () => {
    const result = gradeAssessment(greStyleAssessment, {
      "verbal-reading-main-point": "c",
      "verbal-text-completion": { "blank-1": "blank-1-b", "blank-2": "blank-2-a" },
      "verbal-sentence-equivalence": ["d", "b"],
      "quant-comparison": "d",
      "quant-multiple-selection": ["b", "a"],
      "quant-numeric-entry": "1800",
      "quant-data-interpretation": "c",
      "analytical-writing-issue": "Public institutions should publish their evidence before acting.",
    });

    expect(result).toMatchObject({
      rawScore: 7,
      maximumScore: 7,
      answeredCount: 8,
      totalItems: 8,
      awaitingEvaluationCount: 1,
    });
  });

  it("rejects duplicate item IDs and invalid references", () => {
    const duplicate = structuredClone(scoringContract());
    duplicate.parts[0]!.items[1]!.id = "single";
    expect(() => parseAssessmentPackage(duplicate)).toThrow(/Item IDs must be unique/);

    const missingReference = structuredClone(scoringContract());
    missingReference.parts[0]!.tools = [{ type: "reference_document", resourceId: "missing" }];
    expect(() => parseAssessmentPackage(missingReference)).toThrow(/was not found/);
  });

  it("rejects presentation and scoring declarations that cannot be rendered correctly", () => {
    const invalidLayout = structuredClone(scoringContract());
    invalidLayout.parts[0]!.items[0]!.presentation = { layout: "split" };
    expect(() => parseAssessmentPackage(invalidLayout)).toThrow(/using split layout/);

    const invalidInheritedLayout = structuredClone(scoringContract());
    invalidInheritedLayout.parts[0]!.defaultLayout = "split";
    expect(() => parseAssessmentPackage(invalidInheritedLayout)).toThrow(/using split layout/);

    const invalidScoring = structuredClone(scoringContract());
    invalidScoring.parts[0]!.items[0]!.scoring = { type: "exact", answer: "missing" };
    expect(() => parseAssessmentPackage(invalidScoring)).toThrow(/reference one option ID/);

    const invalidTextScoring = structuredClone(scoringContract());
    invalidTextScoring.parts[0]!.items[2]!.scoring = { type: "set", answers: ["a"] };
    expect(() => parseAssessmentPackage(invalidTextScoring)).toThrow(/Text-entry items require/);

    const invalidGroupedAnswer = structuredClone(scoringContract());
    invalidGroupedAnswer.parts[0]!.items[5]!.scoring = {
      type: "mapping",
      answers: { "blank-1": "b2-a", "blank-2": "b2-b" },
    };
    expect(() => parseAssessmentPackage(invalidGroupedAnswer)).toThrow(/answer for 'blank-1'/);
  });

  it("turns declared response limits into candidate guidance", () => {
    const multipleChoice = scoringContract().parts[0]!.items[1]!;
    expect(getAssessmentResponseGuidance(multipleChoice, ["a"])).toEqual({
      instruction: "Choose exactly 2 answers.",
      issue: "Select 1 more answer.",
    });

    const writing = parseAssessmentPackage({
      schemaVersion: 3,
      packageId: "limited-writing",
      revision: 1,
      title: "Limited writing",
      source: "built-in",
      parts: [{
        id: "writing",
        title: "Writing",
        items: [{
          id: "response",
          prompt: [{ type: "text", text: "Respond." }],
          interaction: { type: "extended_text", minimumWords: 3, maximumWords: 5 },
          scoring: { type: "agent" },
          evaluationRubricId: "quality",
        }],
      }],
      rubrics: [{
        id: "quality",
        title: "Quality",
        scale: { minimum: 0, maximum: 4, step: 1 },
        criteria: [{ id: "quality", label: "Quality", description: "Response quality." }],
      }],
    });
    expect(getAssessmentResponseGuidance(writing.parts[0]!.items[0]!, "Two words")).toEqual({
      instruction: "Write 3 to 5 words.",
      issue: "Write 1 more word.",
    });
  });

  it("keeps assessment identity independent from interaction choice", () => {
    const packageInput = scoringContract();
    packageInput.parts[0]!.items = [packageInput.parts[0]!.items[3]!];
    expect(() => parseAssessmentPackage(packageInput)).not.toThrow();
  });

  it("keeps every authoring example valid and omits application-owned provenance", () => {
    ASSESSMENT_AUTHORING_TEMPLATE_IDS.forEach((template) => {
      const kit = getAssessmentAuthoringKit(template);
      expect(parseAssessmentAuthoringPackage(kit.examplePackage).schemaVersion).toBe(3);
      expect(kit.examplePackage).not.toHaveProperty("source");
      expect(kit.nextAction).toContain("install_assessment");
    });
  });

  it("uses references to keep the registered authoring schema compact", () => {
    const schema = getAssessmentPackageJsonSchema() as {
      definitions?: Record<string, unknown>;
      properties?: Record<string, unknown>;
    };
    const serialized = JSON.stringify(schema);
    expect(schema.definitions).toHaveProperty("AssessmentInteraction");
    expect(schema.definitions).toHaveProperty("AssessmentContentBlock");
    expect(schema.definitions).toHaveProperty("AssessmentRubric.properties.scale.properties.minimum");
    expect(schema.definitions).toHaveProperty("AssessmentRubric.properties.scale.properties.maximum");
    expect(serialized).toContain('"$ref"');
    expect(serialized.length).toBeLessThan(11_000);
    expect(schema.properties).not.toHaveProperty("source");
  });

  it("removes answer keys from candidate-visible packages", () => {
    expect(JSON.stringify(stripAssessmentAnswers(satPracticeAssessment))).not.toContain('"scoring"');
  });

  it("validates evaluation evidence against an immutable subjective submission", () => {
    const assessment = parseAssessmentPackage({
      schemaVersion: 3,
      packageId: "argument-writing",
      revision: 1,
      title: "Argument writing",
      source: "built-in",
      review: { mode: "responses" },
      rubrics: [{
        id: "argument", title: "Argument rubric",
        scale: { minimum: 0, maximum: 4, step: 1 },
        criteria: [{ id: "claim", label: "Claim", description: "Quality of the central claim." }],
        requireEvidence: true, allowAnnotations: true,
      }],
      parts: [{
        id: "writing", title: "Writing", navigation: "linear",
        items: [{
          id: "essay-1", stimulus: [],
          prompt: [{ type: "text", text: "Make an argument." }],
          interaction: { type: "extended_text", minimumWords: 1 },
          scoring: { type: "agent" }, evaluationRubricId: "argument",
        }],
      }],
    });
    const conflictingRubrics = structuredClone(assessment);
    conflictingRubrics.rubrics.push({
      ...conflictingRubrics.rubrics[0]!,
      id: "second-rubric",
    });
    conflictingRubrics.parts[0]!.items.push({
      ...conflictingRubrics.parts[0]!.items[0]!,
      id: "essay-2",
      evaluationRubricId: "second-rubric",
    });
    expect(() => parseAssessmentPackage(conflictingRubrics)).toThrow(/share one rubric/);
    const responses = { "essay-1": "Public libraries strengthen local communities." };
    const submission: AssessmentSubmission = {
      attemptId: "33333333-3333-4333-8333-333333333333",
      packageId: assessment.packageId,
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
        criterionId: "claim", score: 3, feedback: "Direct and relevant.",
        evidence: ["strengthen local communities"],
      }],
      summary: "A clear start that needs evidence.",
      strengths: ["Focused claim"], improvements: ["Add a concrete example"],
      annotations: [{
        itemId: "essay-1", originalText: "strengthen local communities",
        suggestion: "strengthen communities by expanding access",
        explanation: "This makes the mechanism specific.",
      }],
    });
    expect(() => validateAssessmentEvaluation(submission, evaluation)).not.toThrow();
    expect(() => validateAssessmentEvaluation(submission, {
      ...evaluation,
      criteria: [{ ...evaluation.criteria[0]!, evidence: [] }],
    })).toThrow(/must include evidence/);
  });
});
