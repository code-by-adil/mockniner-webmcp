import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { greStyleAssessment } from "@/content/gre";
import { satPracticeAssessment } from "@/content/sat";
import { initialAssessmentSession } from "@/domain/assessmentSession";
import { AssessmentLifecycleDialog } from "./AssessmentLifecycleDialog";
import { UniversalAssessmentLibrary } from "./UniversalAssessmentLibrary";
import { UniversalAssessmentHistoryRows } from "./UniversalAssessmentLibrary";

const noOp = () => undefined;
const noOpAsync = async () => undefined;

function renderLibrary(session = initialAssessmentSession) {
  return renderToStaticMarkup(
    <UniversalAssessmentLibrary
      assessments={[satPracticeAssessment, { ...greStyleAssessment, source: "agent" }]}
      assessmentSession={session}
      onStartAssessment={noOp}
      onResumeAssessment={noOp}
      onRestartAssessment={noOp}
      onDiscardAssessment={noOp}
      onDeleteAssessment={noOpAsync}
    />,
  );
}

describe("universal assessment library", () => {
  it("offers start for idle packages and deletion only for agent-installed packages", () => {
    const html = renderLibrary();

    expect(html.match(/Start assessment/g)).toHaveLength(2);
    expect(html.match(/Delete assessment/g)).toHaveLength(1);
    expect(html).not.toContain("Restart");
    expect(html).not.toContain("Discard");
  });

  it("offers resume, restart, and discard for the draft and blocks other starts", () => {
    const html = renderLibrary({
      ...initialAssessmentSession,
      view: "home",
      attemptId: "99999999-9999-4999-8999-999999999999",
      packageId: satPracticeAssessment.packageId,
      partId: satPracticeAssessment.parts[0]!.id,
      itemId: satPracticeAssessment.parts[0]!.items[0]!.id,
      startedAt: "2026-09-02T10:00:00.000Z",
    });

    expect(html).toContain("Resume assessment");
    expect(html).toContain("Restart");
    expect(html).toContain("Discard");
    expect(html).toContain("Discard the current attempt to start this assessment.");
    expect(html).toMatch(/disabled=""[^>]*title="Discard the unfinished attempt/);
  });
});

describe("assessment lifecycle confirmation", () => {
  it("states exactly what deletion removes and preserves", () => {
    const html = renderToStaticMarkup(
      <AssessmentLifecycleDialog
        action={{ type: "delete", assessment: { ...greStyleAssessment, source: "agent" } }}
        onClose={noOp}
        onConfirm={noOpAsync}
      />,
    );

    expect(html).toContain("Delete assessment?");
    expect(html).toContain("Any unfinished attempt for it will be discarded");
    expect(html).toContain("submitted attempts and results remain in history");
  });
});

describe("universal assessment history", () => {
  it("distinguishes pending and completed evaluations", () => {
    const base = {
      packageId: greStyleAssessment.packageId,
      title: greStyleAssessment.title,
      rawScore: 7,
      maximumScore: 7,
      submittedAt: "2026-09-02T10:40:00.000Z",
    };
    const html = renderToStaticMarkup(
      <UniversalAssessmentHistoryRows
        history={[
          {
            ...base,
            attemptId: "88888888-8888-4888-8888-888888888888",
            evaluationStatus: "awaiting_evaluation",
          },
          {
            ...base,
            attemptId: "99999999-9999-4999-8999-999999999999",
            evaluationStatus: "evaluated",
          },
        ]}
        onReview={async () => undefined}
      />,
    );

    expect(html).toContain("Evaluation pending");
    expect(html).toContain("Evaluated");
  });
});
