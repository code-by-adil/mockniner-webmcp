import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { getAssessmentAuthoringKit } from "@/content/assessmentExamples";
import { satPracticeAssessment } from "@/content/sat";
import { type AssessmentPackage } from "@/domain/assessment";
import {
  assessmentSessionReducer,
  initialAssessmentSession,
  type AssessmentSession,
} from "@/domain/assessmentSession";
import { AssessmentRunner } from "./AssessmentRunner";

const attemptId = "33333333-3333-4333-8333-333333333333";
const nowMs = Date.parse("2026-09-02T10:00:00.000Z");

function start(assessment: AssessmentPackage): AssessmentSession {
  return assessmentSessionReducer(initialAssessmentSession, {
    type: "START",
    assessment,
    attemptId,
    startedAt: new Date(nowMs).toISOString(),
    nowMs,
  });
}

function renderRunner(assessment: AssessmentPackage, session: AssessmentSession): string {
  return renderToStaticMarkup(
    <AssessmentRunner
      assessment={assessment}
      session={session}
      onExit={() => undefined}
      onResponse={() => undefined}
      onToggleMark={() => undefined}
      onToggleElimination={() => undefined}
      onSetTimerHidden={() => undefined}
      onSetItem={() => undefined}
      onTick={() => undefined}
      onAdvanceItem={() => undefined}
      onCompletePart={() => undefined}
      onExpirePart={() => undefined}
      onSubmit={async () => {
        throw new Error("Submission is not called during server rendering.");
      }}
    />,
  );
}

describe("universal assessment shell", () => {
  it("omits candidate tools that the active part did not declare", () => {
    const assessment: AssessmentPackage = {
      ...getAssessmentAuthoringKit("minimal-objective").examplePackage,
      source: "built-in",
    };
    const html = renderRunner(assessment, start(assessment));

    expect(html).toContain("Mark for review");
    expect(html).not.toContain('aria-label="Open calculator"');
    expect(html).not.toContain('aria-label="Open Math formulas"');
    expect(html).not.toContain('aria-label="Eliminate option');
    expect(html).not.toContain("select-none");
  });

  it("renders resources and tools declared by a math part", () => {
    const session = {
      ...start(satPracticeAssessment),
      partId: "math-module-1",
      itemId: "math-3",
    };
    const html = renderRunner(satPracticeAssessment, session);

    expect(html).toContain('aria-label="Open Math formulas"');
    expect(html).toContain('aria-label="Open calculator"');
    expect(html).toContain('aria-label="Eliminate option a"');
  });
});
