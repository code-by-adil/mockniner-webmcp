import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { getAssessmentAuthoringKit } from "@/content/assessmentExamples";
import { greStyleAssessment } from "@/content/gre";
import { gradeAssessment, type AssessmentEvaluation, type AssessmentPackage, type AssessmentSubmission } from "@/domain/assessment";
import { AssessmentResults } from "./AssessmentResults";
import { AssessmentAnswerReview } from "./AssessmentAnswerReview";

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
  it("offers a separate answer review and a direct mistakes action", () => {
    const html = renderResults("answers");
    expect(html).toContain("Review answers");
    expect(html).toContain("Review mistakes");
    expect(html).not.toContain("What is the chemical formula");
  });

  it("shows candidate responses without answer keys in responses mode", () => {
    const html = renderResults("responses");
    expect(html).toContain("Review responses");
    expect(html).not.toContain("Review mistakes");
    expect(html).not.toContain("Correct answer</dt>");
  });

  it("omits item review entirely in none mode", () => {
    const html = renderResults("none");
    expect(html).not.toContain("Answer review");
    expect(html).not.toContain("Response review");
    expect(html).not.toContain("Your response:");
    expect(html).not.toContain('href="#');
  });

  it('provides review actions for every part', () => {
    const html = renderResults('answers');
    expect(html).toContain('Results by part');
    expect(html).toContain('aria-label="Review ');
    expect(renderResults('responses')).toContain('Review responses');
  });

  it('shows a pending submission without a misleading zero objective score', () => {
    const assessment: AssessmentPackage = {
      ...getAssessmentAuthoringKit('writing-with-rubric').examplePackage,
      source: 'built-in',
    };
    const responses = { [assessment.parts[0].items[0].id]: 'A saved essay response.' };
    const submission: AssessmentSubmission = {
      attemptId: '33333333-3333-4333-8333-333333333333',
      packageId: assessment.packageId,
      package: assessment,
      responses,
      result: gradeAssessment(assessment, responses),
      startedAt: '2026-09-03T10:00:00.000Z',
      submittedAt: '2026-09-03T10:05:00.000Z',
    };
    const html = renderToStaticMarkup(<AssessmentResults submission={submission} onHome={() => undefined} />);
    expect(html).toContain('Ready for feedback');
    expect(html).toContain('Get feedback on your responses');
    expect(html).toContain('Review responses');
    expect(html).not.toContain('0% correct');
    expect(html).not.toContain('Correct answers');
    expect(html).not.toContain('0% correct');
  });

  it('keeps objective and rubric scores visible in an evaluated mixed assessment', () => {
    const writing = getAssessmentAuthoringKit('writing-with-rubric').examplePackage;
    const objective = getAssessmentAuthoringKit('minimal-objective').examplePackage;
    const assessment: AssessmentPackage = { ...writing, source: 'built-in', parts: [...writing.parts, ...objective.parts] };
    const responses = { [writing.parts[0].items[0].id]: 'A saved essay response.', 'water-formula': 'b' };
    const submission: AssessmentSubmission = {
      attemptId: '33333333-3333-4333-8333-333333333333',
      packageId: assessment.packageId,
      package: assessment,
      responses,
      result: gradeAssessment(assessment, responses),
      startedAt: '2026-09-03T10:00:00.000Z',
      submittedAt: '2026-09-03T10:05:00.000Z',
    };
    const rubric = assessment.rubrics[0];
    const evaluation: AssessmentEvaluation = {
      attemptId: submission.attemptId, rubricId: rubric.id, overallScore: 3,
      criteria: rubric.criteria.map(criterion => ({ criterionId: criterion.id, score: 3, feedback: 'Develop this argument.', evidence: ['A saved essay response.'] })),
      summary: 'Evaluation complete.', strengths: ['Clear position.'], improvements: ['Add examples.'], annotations: [], evaluatedAt: '2026-09-03T10:06:00.000Z',
    };
    const html = renderToStaticMarkup(<AssessmentResults submission={submission} evaluation={evaluation} onHome={() => undefined} />);
    expect(html).toContain('50% correct');
    expect(html).toContain('Evaluation score');
    expect(html).toContain('Evaluation complete.');
    expect(html).not.toContain('Get feedback on your responses');
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
      <AssessmentAnswerReview submission={submission} initialItemId="verbal-text-completion" />,
    );
    expect(html).toContain('aria-label="Blank 1"');
    expect(html).toContain("inconclusive");
    expect(html).toContain('aria-label="Blank 2"');
    expect(html).toContain("cautious");
    expect(html).not.toContain("blank-1-b");
  });
});
