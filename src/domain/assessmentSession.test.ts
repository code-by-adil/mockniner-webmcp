import { describe, expect, it } from "vitest";
import { satPracticeAssessment } from "@/content/sat";
import { greStyleAssessment } from "@/content/gre";
import { gradeAssessment, parseAssessmentPackage, type AssessmentSubmission } from "./assessment";
import {
  assessmentSessionReducer,
  getDraftAssessmentPackageId,
  initialAssessmentSession,
  isFinalPart,
  isLastItemInPart,
} from "./assessmentSession";

const nowMs = Date.parse("2026-09-02T10:00:00.000Z");
const attemptId = "33333333-3333-4333-8333-333333333333";

function start() {
  return assessmentSessionReducer(initialAssessmentSession, {
    type: "START",
    assessment: satPracticeAssessment,
    attemptId,
    startedAt: new Date(nowMs).toISOString(),
    nowMs,
  });
}

describe("assessment session", () => {
  it("identifies only unfinished attempts as drafts", () => {
    const active = start();
    expect(getDraftAssessmentPackageId(active)).toBe(satPracticeAssessment.packageId);
    expect(getDraftAssessmentPackageId(initialAssessmentSession)).toBeNull();
    expect(getDraftAssessmentPackageId(assessmentSessionReducer(active, {
      type: "COMPLETE",
      submission: {
        attemptId,
        packageId: satPracticeAssessment.packageId,
        package: satPracticeAssessment,
        responses: {},
        result: gradeAssessment(satPracticeAssessment, {}),
        startedAt: new Date(nowMs).toISOString(),
        submittedAt: new Date(nowMs + 1_000).toISOString(),
      },
    }))).toBeNull();
  });

  it("discards every piece of draft state without touching package storage", () => {
    let active = start();
    active = assessmentSessionReducer(active, {
      type: "SET_RESPONSE",
      itemId: "rw-1",
      response: "b",
    });

    expect(assessmentSessionReducer(active, { type: "RESET" })).toEqual(
      initialAssessmentSession,
    );
  });

  it("uses stable IDs and makes part completion an explicit locking boundary", () => {
    let state = start();
    state = assessmentSessionReducer(state, { type: "SET_RESPONSE", itemId: "rw-1", response: "b" });
    state = { ...state, itemId: "rw-3" };
    expect(assessmentSessionReducer(state, {
      type: "ADVANCE_ITEM", assessment: satPracticeAssessment,
    })).toEqual(state);
    state = assessmentSessionReducer(state, {
      type: "COMPLETE_PART",
      assessment: satPracticeAssessment,
      partId: "rw-module-1",
      nowMs: nowMs + 5_000,
    });
    expect(state).toMatchObject({ partId: "rw-module-2", itemId: "rw-4", secondsRemaining: 480 });
    expect(state.responses["rw-1"]).toBe("b");
  });

  it("ignores duplicate or stale part-completion events", () => {
    const completion = {
      type: "COMPLETE_PART" as const,
      assessment: satPracticeAssessment,
      partId: "rw-module-1",
      nowMs: nowMs + 5_000,
    };
    const advanced = assessmentSessionReducer(start(), completion);

    expect(advanced.partId).toBe("rw-module-2");
    expect(assessmentSessionReducer(advanced, completion)).toEqual(advanced);
  });

  it("recognizes the end of a part separately from the end of the assessment", () => {
    expect(isLastItemInPart(satPracticeAssessment, { ...start(), itemId: "rw-3" })).toBe(true);
    expect(isFinalPart(satPracticeAssessment, { ...start(), partId: "rw-module-1" })).toBe(false);
    expect(isFinalPart(satPracticeAssessment, {
      ...start(), partId: "math-module-2", itemId: "math-6",
    })).toBe(true);
  });

  it("persists authorized marking and elimination and clears an eliminated response", () => {
    let state = start();
    state = assessmentSessionReducer(state, { type: "SET_RESPONSE", itemId: "rw-1", response: "b" });
    state = assessmentSessionReducer(state, {
      type: "TOGGLE_MARK", assessment: satPracticeAssessment, itemId: "rw-1",
    });
    state = assessmentSessionReducer(state, {
      type: "TOGGLE_ELIMINATION", assessment: satPracticeAssessment, itemId: "rw-1", optionId: "b",
    });
    expect(state.responses["rw-1"]).toBeUndefined();
    expect(state.workspace.markedItemIds).toEqual(["rw-1"]);
    expect(state.workspace.eliminatedOptionIds["rw-1"]).toEqual(["b"]);
  });

  it("clears a grouped-choice response when its selected option is eliminated", () => {
    let state = assessmentSessionReducer(initialAssessmentSession, {
      type: "START",
      assessment: greStyleAssessment,
      attemptId,
      startedAt: new Date(nowMs).toISOString(),
      nowMs,
    });
    state = { ...state, partId: "verbal-1", itemId: "gre-v1-completion-3" };
    state = assessmentSessionReducer(state, {
      type: "SET_RESPONSE",
      itemId: "gre-v1-completion-3",
      response: { "blank-1": "b1-b", "blank-2": "b2-a" },
    });
    state = assessmentSessionReducer(state, {
      type: "TOGGLE_ELIMINATION",
      assessment: greStyleAssessment,
      itemId: "gre-v1-completion-3",
      optionId: "b1-b",
    });

    expect(state.responses["gre-v1-completion-3"]).toEqual({ "blank-2": "b2-a" });
  });

  it("derives remaining time from an absolute deadline", () => {
    const active = start();
    const ticked = assessmentSessionReducer(active, { type: "TICK", nowMs: nowMs + 61_200 });
    expect(ticked.secondsRemaining).toBe(419);
    const resumed = assessmentSessionReducer({ ...ticked, view: "home" }, {
      type: "RESUME", assessment: satPracticeAssessment, nowMs: nowMs + 120_000,
    });
    expect(resumed).toMatchObject({ view: "assessment", secondsRemaining: 360 });
  });

  it("normalizes stale stored IDs to the first valid part and item", () => {
    const resumed = assessmentSessionReducer({
      ...start(), view: "home", partId: "missing", itemId: "missing",
    }, { type: "RESUME", assessment: satPracticeAssessment, nowMs });
    expect(resumed).toMatchObject({ partId: "rw-module-1", itemId: "rw-1" });
  });

  it("clamps a stale stored timer to the active part duration", () => {
    const resumed = assessmentSessionReducer({
      ...start(), view: "home", secondsRemaining: 9_999, deadlineAt: null,
    }, { type: "RESUME", assessment: satPracticeAssessment, nowMs });

    expect(resumed).toMatchObject({
      secondsRemaining: 480,
      deadlineAt: nowMs + 480_000,
    });
  });

  it("prevents direct navigation when a part declares linear delivery", () => {
    const linearPackage = parseAssessmentPackage({
      ...satPracticeAssessment,
      packageId: "linear-example",
      parts: [{ ...satPracticeAssessment.parts[0]!, navigation: "linear" }],
    });
    const active = assessmentSessionReducer(initialAssessmentSession, {
      type: "START", assessment: linearPackage, attemptId, startedAt: new Date(nowMs).toISOString(), nowMs,
    });
    expect(assessmentSessionReducer(active, {
      type: "SET_ITEM", assessment: linearPackage, itemId: "rw-3",
    }).itemId).toBe("rw-1");
  });

  it("opens immutable history in the result view", () => {
    const submission: AssessmentSubmission = {
      attemptId: "33333333-3333-4333-8333-333333333333",
      packageId: satPracticeAssessment.packageId,
      package: satPracticeAssessment,
      responses: { "rw-1": "b" },
      result: gradeAssessment(satPracticeAssessment, { "rw-1": "b" }),
      startedAt: new Date(nowMs).toISOString(),
      submittedAt: "2026-09-02T10:10:00.000Z",
    };
    expect(assessmentSessionReducer(initialAssessmentSession, {
      type: "OPEN_SUBMISSION", submission, evaluation: null,
    })).toMatchObject({ view: "result", packageId: null, submission });
  });

  it("preserves the draft while viewing history and resuming", () => {
    const draft = assessmentSessionReducer(start(), { type: "SET_RESPONSE", itemId: "rw-1", response: "b" });
    const submission: AssessmentSubmission = {
      attemptId: "44444444-4444-4444-8444-444444444444", packageId: satPracticeAssessment.packageId,
      package: satPracticeAssessment, responses: {}, result: gradeAssessment(satPracticeAssessment, {}),
      startedAt: new Date(nowMs).toISOString(), submittedAt: new Date(nowMs).toISOString(),
    };
    const review = assessmentSessionReducer(draft, { type: "OPEN_SUBMISSION", submission, evaluation: null });
    expect(review.responses).toEqual(draft.responses);
    expect(getDraftAssessmentPackageId(review)).toBe(draft.packageId);
    const resumed = assessmentSessionReducer(review, {
      type: "RESUME", assessment: satPracticeAssessment, nowMs,
    });
    expect(resumed).toMatchObject({ view: "assessment", attemptId, responses: { "rw-1": "b" } });
    expect(resumed.submission).toBeUndefined();
    expect(assessmentSessionReducer(resumed, { type: "COMPLETE", submission })).toBe(resumed);
  });
});
