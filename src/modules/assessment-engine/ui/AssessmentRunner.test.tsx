import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { getAssessmentAuthoringKit } from "@/content/assessmentExamples";
import { satPracticeAssessment } from "@/content/sat";
import { compileAssessment, type AssessmentPlan } from "@/domain/assessment";
import {
  assessmentSessionReducer,
  initialAssessmentSession,
  type AssessmentSession,
} from "@/domain/assessmentSession";
import { AssessmentRunner } from "./AssessmentRunner";

const attemptId = "33333333-3333-4333-8333-333333333333";
const nowMs = Date.parse("2026-09-02T10:00:00.000Z");

function start(plan: AssessmentPlan): AssessmentSession {
  return assessmentSessionReducer(initialAssessmentSession, {
    type: "START",
    plan,
    attemptId,
    startedAt: new Date(nowMs).toISOString(),
    nowMs,
  });
}

function renderRunner(plan: AssessmentPlan, session: AssessmentSession): string {
  return renderToStaticMarkup(
    <AssessmentRunner
      plan={plan}
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
    const plan = compileAssessment({
      ...getAssessmentAuthoringKit("minimal-objective").examplePackage,
      source: "built-in",
    });
    const html = renderRunner(plan, start(plan));

    expect(html).toContain("Mark for review");
    expect(html).not.toContain('aria-label="Open calculator"');
    expect(html).not.toContain('aria-label="Open Math formulas"');
    expect(html).not.toContain('aria-label="Eliminate option');
    expect(html).not.toContain("select-none");
  });

  it("renders resources and tools declared by a math part", () => {
    const plan = compileAssessment(satPracticeAssessment);
    const session = {
      ...start(plan),
      partId: "math-module-1",
      itemId: "math-3",
    };
    const html = renderRunner(plan, session);

    expect(html).toContain('aria-label="Open Math formulas"');
    expect(html).toContain('aria-label="Open calculator"');
    expect(html).toContain('aria-label="Eliminate option a"');
  });
});
