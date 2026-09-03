// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { LearningSummary } from "@/domain/learningSummary";
import { RecentAttempts } from "./RecentAttempts";

const summary: LearningSummary = {
  totalAttempts: 1,
  sections: {
    listening: { attemptCount: 0, recentAverageBand: null, recent: [] },
    reading: {
      attemptCount: 1,
      recentAverageBand: 7,
      recent: [{
        attemptId: "reading-attempt",
        contentKey: "reading-v1",
        band: 7,
        raw: 30,
        total: 40,
        answered: 40,
        submittedAt: "2026-09-02T11:00:00.000Z",
      }],
    },
    writing: {
      attemptCount: 0,
      evaluatedCount: 0,
      recentAverageOverallBand: null,
      recentAverageCriteria: null,
      recent: [],
    },
    speaking: { attemptCount: 0 },
  },
};

describe("recent attempts presentation", () => {
  it("omits the section when both histories are empty", () => {
    expect(renderToStaticMarkup(
      <RecentAttempts
        assessmentHistory={[]}
        learningSummary={null}
        onReviewAssessment={async () => undefined}
        onReviewAttempt={async () => undefined}
      />,
    )).toBe("");
  });

  it("combines the count while forwarding each review to its application callback", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const container = document.createElement("div");
    const root = createRoot(container);
    const onReviewAssessment = vi.fn(async () => undefined);
    const onReviewAttempt = vi.fn(async () => undefined);
    try {
      await act(async () => root.render(
        <RecentAttempts
          assessmentHistory={[{
            attemptId: "assessment-attempt",
            packageId: "diagnostic",
            title: "Diagnostic",
            rawScore: 2,
            maximumScore: 3,
            evaluationStatus: "not_required",
            submittedAt: "2026-09-02T12:00:00.000Z",
          }]}
          learningSummary={summary}
          onReviewAssessment={onReviewAssessment}
          onReviewAttempt={onReviewAttempt}
        />,
      ));
      expect(container.textContent).toContain("2 attempts saved in this browser");
      const buttons = container.querySelectorAll("button");
      expect(buttons).toHaveLength(2);
      await act(async () => { for (const button of buttons) button.click(); });
      expect(onReviewAssessment).toHaveBeenCalledExactlyOnceWith("assessment-attempt");
      expect(onReviewAttempt).toHaveBeenCalledExactlyOnceWith("reading-attempt", "reading");
    } finally {
      await act(async () => root.unmount());
      vi.unstubAllGlobals();
    }
  });
});
