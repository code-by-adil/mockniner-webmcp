import { describe, expect, it } from "vitest";
import { getAssessmentAuthoringKit } from "@/content/assessmentExamples";
import { greStyleAssessment } from "@/content/gre";
import { satPracticeAssessment } from "@/content/sat";
import {
  ASSESSMENT_AUTHORING_TEMPLATE_IDS,
  getAssessmentItemLayout,
  getAssessmentPartResources,
  getAssessmentResponseGuidance,
  gradeAssessment,
  parseAssessmentAuthoringPackage,
  parseAssessmentPackage,
  stripAssessmentAnswers,
  type AssessmentPackage,
} from "./assessment";

function scoringContract(): AssessmentPackage {
  const prompt = [{ type: "text" as const, text: "Answer this question." }];
  return parseAssessmentPackage({
    schemaVersion: 4 as const,
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

  });

  it("derives runtime resources and layouts directly from the validated package", () => {
    expect(satPracticeAssessment.schemaVersion).toBe(4);
    expect(satPracticeAssessment.parts.map((part) => part.id)).toEqual([
      "rw-module-1", "rw-module-2", "math-module-1", "math-module-2",
    ]);
    expect(getAssessmentPartResources(satPracticeAssessment, satPracticeAssessment.parts[0]!)).toEqual([]);
    expect(getAssessmentPartResources(satPracticeAssessment, satPracticeAssessment.parts[2]!)
      .map((resource) => resource.id)).toEqual(["math-formulas"]);
    expect(getAssessmentItemLayout(
      satPracticeAssessment.parts[0]!,
      satPracticeAssessment.parts[0]!.items[0]!,
    )).toBe("split");
    expect(getAssessmentItemLayout(
      satPracticeAssessment.parts[2]!,
      satPracticeAssessment.parts[2]!.items[1]!,
    )).toBe("single");
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
      "gre-v1-reading-1": "b",
      "gre-v1-completion-3": { "blank-1": "b1-b", "blank-2": "b2-a" },
      "gre-v1-equivalence-1": ["d", "b"],
      "gre-q1-compare-2": "d",
      "gre-q1-multiple-2": ["e", "d"],
      "gre-q1-numeric-1": "25",
      "gre-q2-choice-6": "b",
      "gre-issue": "Public institutions should publish their evidence before acting.",
    });

    expect(result).toMatchObject({
      rawScore: 7,
      maximumScore: 54,
      answeredCount: 8,
      totalItems: 55,
      awaitingEvaluationCount: 1,
    });
    expect(greStyleAssessment.parts[0]!.tools).not.toContainEqual(
      expect.objectContaining({ type: "calculator" }),
    );
    expect(greStyleAssessment.parts[2]!.tools).toContainEqual({ type: "calculator" });
    expect(greStyleAssessment.parts[2]!.tools.some(tool => tool.type === 'reference_document')).toBe(false);
    expect(greStyleAssessment.parts[0]!.tools).toEqual([]);
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
      schemaVersion: 4,
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
        }],
      }],
      rubric: {
        title: "Quality",
        scale: { minimum: 0, maximum: 4, step: 1 },
        criteria: [{ id: "quality", label: "Quality", description: "Response quality." }],
      },
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
      expect(parseAssessmentAuthoringPackage(kit.examplePackage).schemaVersion).toBe(4);
      expect(kit.examplePackage).not.toHaveProperty("source");
      expect(kit.nextAction).toContain("install_assessment");
    });
  });

  it("removes answer keys from candidate-visible packages", () => {
    expect(JSON.stringify(stripAssessmentAnswers(satPracticeAssessment))).not.toContain('"scoring"');
  });

  it("rejects old package versions and requires one package rubric for agent scoring", () => {
    const assessment = { ...getAssessmentAuthoringKit("writing-with-rubric").examplePackage, source: "agent" };
    expect(() => parseAssessmentPackage({ ...assessment, schemaVersion: 3 })).toThrow();
    expect(() => parseAssessmentPackage({ ...assessment, rubric: undefined })).toThrow(/require a package rubric/);
    expect(() => parseAssessmentPackage({ ...assessment, rubrics: [assessment.rubric] })).toThrow(/Unrecognized key/);
  });

  it("requires a reachable text answer within the character limit", () => {
    const assessment = scoringContract();
    const text = assessment.parts[0]!.items[2]!;
    text.interaction = { type: "text_entry", maximumCharacters: 3 };
    text.scoring = { type: "exact", answer: "twelve" };
    expect(() => parseAssessmentPackage(assessment)).toThrow(/allow at least one accepted answer/);
    text.scoring = { type: "aliases", answers: ["twelve", "12"] };
    expect(() => parseAssessmentPackage(assessment)).not.toThrow();
    text.scoring = { type: "aliases", answers: ["twelve", "twelves"] };
    expect(() => parseAssessmentPackage(assessment)).toThrow(/allow at least one accepted answer/);
    text.scoring = { type: "exact", answer: "A   B" };
    expect(() => parseAssessmentPackage(assessment)).not.toThrow();
    expect(gradeAssessment(assessment, { text: "a b" }).itemResults.find(item => item.itemId === "text")?.correct).toBe(true);
    text.scoring = { type: "aliases", answers: ["Yes!"], ignorePunctuation: true };
    expect(() => parseAssessmentPackage(assessment)).not.toThrow();
    expect(gradeAssessment(assessment, { text: "yes" }).itemResults.find(item => item.itemId === "text")?.correct).toBe(true);
  });
});
