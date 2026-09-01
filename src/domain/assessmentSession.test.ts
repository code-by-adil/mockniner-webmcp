import { describe, expect, it } from "vitest";
import { satPracticeAssessment } from "@/content/sat";
import { gradeAssessment, type AssessmentSubmission } from "./assessment";
import {
  assessmentSessionReducer,
  initialAssessmentSession,
  isFinalAssessmentItem,
  isFinalAssessmentModule,
} from "./assessmentSession";

describe("assessment session", () => {
  it("starts, records responses, and moves forward without crossing backward between modules", () => {
    let state = assessmentSessionReducer(initialAssessmentSession, {
      type: "START",
      assessment: satPracticeAssessment,
      startedAt: "2026-09-02T10:00:00.000Z",
    });
    state = assessmentSessionReducer(state, {
      type: "SET_RESPONSE",
      itemId: "rw-1",
      response: "b",
    });
    state = { ...state, itemIndex: 2 };
    state = assessmentSessionReducer(state, {
      type: "ADVANCE",
      assessment: satPracticeAssessment,
    });

    expect(state.responses["rw-1"]).toBe("b");
    expect(state.moduleIndex).toBe(1);
    expect(state.itemIndex).toBe(0);
    expect(state.secondsRemaining).toBe(8 * 60);
  });

  it("recognizes only the final item in the final module", () => {
    const finalState = {
      ...initialAssessmentSession,
      view: "assessment" as const,
      packageId: satPracticeAssessment.packageId,
      sectionIndex: 1,
      moduleIndex: 1,
      itemIndex: 2,
    };
    expect(isFinalAssessmentItem(satPracticeAssessment, finalState)).toBe(true);
    expect(isFinalAssessmentItem(satPracticeAssessment, { ...finalState, itemIndex: 1 })).toBe(false);
    expect(isFinalAssessmentModule(satPracticeAssessment, finalState)).toBe(true);
    expect(isFinalAssessmentModule(satPracticeAssessment, { ...finalState, moduleIndex: 0 })).toBe(false);
  });

  it("closes an expired module regardless of the current question", () => {
    const active = assessmentSessionReducer(initialAssessmentSession, {
      type: "START",
      assessment: satPracticeAssessment,
      startedAt: "2026-09-02T10:00:00.000Z",
    });
    const expired = assessmentSessionReducer(active, {
      type: "EXPIRE_MODULE",
      assessment: satPracticeAssessment,
    });
    expect(expired).toMatchObject({ sectionIndex: 0, moduleIndex: 1, itemIndex: 0 });
    expect(expired.secondsRemaining).toBe(8 * 60);
  });

  it("opens an immutable historical submission in the result view", () => {
    const submission: AssessmentSubmission = {
      attemptId: "33333333-3333-4333-8333-333333333333",
      packageId: satPracticeAssessment.packageId,
      profileId: satPracticeAssessment.profileId,
      package: satPracticeAssessment,
      responses: { "rw-1": "b" },
      result: gradeAssessment(satPracticeAssessment, { "rw-1": "b" }),
      startedAt: "2026-09-02T10:00:00.000Z",
      submittedAt: "2026-09-02T10:10:00.000Z",
    };
    const state = assessmentSessionReducer(initialAssessmentSession, {
      type: "OPEN_SUBMISSION",
      submission,
      evaluation: null,
    });
    expect(state).toMatchObject({ view: "result", packageId: submission.packageId, submission });
  });

  it("clamps stale persisted navigation before resuming", () => {
    const resumed = assessmentSessionReducer({
      ...initialAssessmentSession,
      packageId: satPracticeAssessment.packageId,
      sectionIndex: 99,
      moduleIndex: 99,
      itemIndex: 99,
      secondsRemaining: 99_999,
      startedAt: "2026-09-02T10:00:00.000Z",
    }, {
      type: "RESUME",
      assessment: satPracticeAssessment,
    });

    expect(resumed).toMatchObject({
      view: "assessment",
      sectionIndex: 1,
      moduleIndex: 1,
      itemIndex: 2,
      secondsRemaining: 8 * 60,
    });
  });

  it("keeps direct item navigation inside the active module", () => {
    const active = assessmentSessionReducer(initialAssessmentSession, {
      type: "START",
      assessment: satPracticeAssessment,
      startedAt: "2026-09-02T10:00:00.000Z",
    });
    const moved = assessmentSessionReducer(active, {
      type: "SET_ITEM",
      assessment: satPracticeAssessment,
      itemIndex: 99,
    });

    expect(moved.itemIndex).toBe(2);
  });
});
