import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { getAssessmentAuthoringKit } from "@/content/assessmentExamples";
import { greStyleAssessment } from "@/content/gre";
import { gradeAssessment, type AssessmentPackage, type AssessmentSubmission } from "@/domain/assessment";
import { AssessmentResults } from "./AssessmentResults";

function renderResults(reviewMode: AssessmentPackage["review"]["mode"]): string {
  const assessment: AssessmentPackage = {
    ...getAssessmentAuthoringKit("minimal-objective").examplePackage,
    source: "built-in",
    review: { mode: reviewMode },
  };
  const responses = { "water-formula": "a" };
  const submission: AssessmentSubmission = {
    attemptId: "33333333-3333-4333-8333-333333333333",
    packageId: assessment.packageId,
    package: assessment,
    responses,
    result: gradeAssessment(assessment, responses),
    startedAt: "2026-09-02T10:00:00.000Z",
    submittedAt: "2026-09-02T10:05:00.000Z",
  };

  return renderToStaticMarkup(
    <AssessmentResults submission={submission} onHome={() => undefined} />,
  );
}

describe("universal assessment result review policy", () => {
  it("shows candidate responses and answer keys in answers mode", () => {
    const html = renderResults("answers");
    expect(html).toContain("Answer review");
    expect(html).toContain("Your response:");
    expect(html).toContain("Expected:");
  });

  it("shows candidate responses without answer keys in responses mode", () => {
    const html = renderResults("responses");
    expect(html).toContain("Response review");
    expect(html).toContain("Your response:");
    expect(html).not.toContain("Expected:");
  });

  it("omits item review entirely in none mode", () => {
    const html = renderResults("none");
    expect(html).not.toContain("Answer review");
    expect(html).not.toContain("Response review");
    expect(html).not.toContain("Your response:");
  });

  it("shows grouped-choice labels instead of internal IDs", () => {
    const responses = {
      "verbal-text-completion": { "blank-1": "blank-1-b", "blank-2": "blank-2-a" },
    };
    const submission: AssessmentSubmission = {
      attemptId: "44444444-4444-4444-8444-444444444444",
      packageId: greStyleAssessment.packageId,
      package: greStyleAssessment,
      responses,
      result: gradeAssessment(greStyleAssessment, responses),
      startedAt: "2026-09-02T10:00:00.000Z",
      submittedAt: "2026-09-02T10:05:00.000Z",
    };

    const html = renderToStaticMarkup(
      <AssessmentResults submission={submission} onHome={() => undefined} />,
    );
    expect(html).toContain("Blank 1: inconclusive");
    expect(html).toContain("Blank 2: cautious");
    expect(html).not.toContain("blank-1-b");
  });
});
