import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { satPracticeAssessment } from "@/content/sat";
import { AssessmentRunnerHeader } from "./AssessmentRunnerHeader";

function renderHeader(secondsRemaining: number | null, timerHidden = false) {
  return renderToStaticMarkup(
    <AssessmentRunnerHeader
      assessmentTitle="Practice"
      part={satPracticeAssessment.parts[0]!}
      resources={[]}
      secondsRemaining={secondsRemaining}
      timerHidden={timerHidden}
      warning={false}
      calculatorEnabled={false}
      onSetTimerHidden={() => undefined}
      onExit={() => undefined}
    />,
  );
}

describe("assessment timer display", () => {
  it("keeps untimed parts distinct from zero remaining time", () => {
    expect(renderHeader(null)).toContain("Untimed");
    expect(renderHeader(null)).not.toContain('aria-label="Hide timer"');
    expect(renderHeader(0)).toContain("00:00");
  });

  it("preserves fractional seconds, clamps negatives, and hides the timer on request", () => {
    expect(renderHeader(65.5)).toContain("01:5.5");
    expect(renderHeader(-2.5)).toContain("00:00");
    expect(renderHeader(65.5, true)).toContain("••:••");
    expect(renderHeader(65.5, true)).not.toContain("01:5.5");
  });
});
