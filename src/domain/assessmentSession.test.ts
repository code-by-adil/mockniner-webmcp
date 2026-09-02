import { describe, expect, it } from "vitest";
import { satPracticeAssessment } from "@/content/sat";
import { greStyleAssessment } from "@/content/gre";
import { compileAssessment, gradeAssessment, parseAssessmentPackage, type AssessmentSubmission } from "./assessment";
import {
  assessmentSessionReducer,
  getDraftAssessmentPackageId,
  initialAssessmentSession,
  isFinalPart,
  isLastItemInPart,
} from "./assessmentSession";

const plan = compileAssessment(satPracticeAssessment);
const nowMs = Date.parse("2026-09-02T10:00:00.000Z");
const attemptId = "33333333-3333-4333-8333-333333333333";

function start() {
  return assessmentSessionReducer(initialAssessmentSession, {
    type: "START",
    plan,
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
    expect(getDraftAssessmentPackageId({
      ...active,
      submission: {
        attemptId,
        packageId: satPracticeAssessment.packageId,
        package: satPracticeAssessment,
        responses: {},
        result: gradeAssessment(satPracticeAssessment, {}),
        startedAt: new Date(nowMs).toISOString(),
        submittedAt: new Date(nowMs + 1_000).toISOString(),
      },
    })).toBeNull();
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
    expect(assessmentSessionReducer(state, { type: "ADVANCE_ITEM", plan })).toEqual(state);
    state = assessmentSessionReducer(state, {
      type: "COMPLETE_PART",
      plan,
      partId: "rw-module-1",
      nowMs: nowMs + 5_000,
    });
    expect(state).toMatchObject({ partId: "rw-module-2", itemId: "rw-4", secondsRemaining: 480 });
    expect(state.responses["rw-1"]).toBe("b");
  });

  it("ignores duplicate or stale part-completion events", () => {
    const completion = {
      type: "COMPLETE_PART" as const,
      plan,
      partId: "rw-module-1",
      nowMs: nowMs + 5_000,
    };
    const advanced = assessmentSessionReducer(start(), completion);

    expect(advanced.partId).toBe("rw-module-2");
    expect(assessmentSessionReducer(advanced, completion)).toEqual(advanced);
  });

  it("recognizes the end of a part separately from the end of the assessment", () => {
    expect(isLastItemInPart(plan, { ...start(), itemId: "rw-3" })).toBe(true);
    expect(isFinalPart(plan, { ...start(), partId: "rw-module-1" })).toBe(false);
    expect(isFinalPart(plan, { ...start(), partId: "math-module-2", itemId: "math-6" })).toBe(true);
  });

  it("persists authorized marking and elimination and clears an eliminated response", () => {
    let state = start();
    state = assessmentSessionReducer(state, { type: "SET_RESPONSE", itemId: "rw-1", response: "b" });
    state = assessmentSessionReducer(state, { type: "TOGGLE_MARK", plan, itemId: "rw-1" });
    state = assessmentSessionReducer(state, {
      type: "TOGGLE_ELIMINATION", plan, itemId: "rw-1", optionId: "b",
    });
    expect(state.responses["rw-1"]).toBeUndefined();
    expect(state.workspace.markedItemIds).toEqual(["rw-1"]);
    expect(state.workspace.eliminatedOptionIds["rw-1"]).toEqual(["b"]);
  });

  it("clears a grouped-choice response when its selected option is eliminated", () => {
    const grePlan = compileAssessment(greStyleAssessment);
    let state = assessmentSessionReducer(initialAssessmentSession, {
      type: "START",
      plan: grePlan,
      attemptId,
      startedAt: new Date(nowMs).toISOString(),
      nowMs,
    });
    state = { ...state, itemId: "verbal-text-completion" };
    state = assessmentSessionReducer(state, {
      type: "SET_RESPONSE",
      itemId: "verbal-text-completion",
      response: { "blank-1": "blank-1-b", "blank-2": "blank-2-a" },
    });
    state = assessmentSessionReducer(state, {
      type: "TOGGLE_ELIMINATION",
      plan: grePlan,
      itemId: "verbal-text-completion",
      optionId: "blank-1-b",
    });

    expect(state.responses["verbal-text-completion"]).toEqual({ "blank-2": "blank-2-a" });
  });

  it("derives remaining time from an absolute deadline", () => {
    const active = start();
    const ticked = assessmentSessionReducer(active, { type: "TICK", nowMs: nowMs + 61_200 });
    expect(ticked.secondsRemaining).toBe(419);
    const resumed = assessmentSessionReducer({ ...ticked, view: "home" }, {
      type: "RESUME", plan, nowMs: nowMs + 120_000,
    });
    expect(resumed).toMatchObject({ view: "assessment", secondsRemaining: 360 });
  });

  it("normalizes stale stored IDs to the first valid part and item", () => {
    const resumed = assessmentSessionReducer({
      ...start(), view: "home", partId: "missing", itemId: "missing",
    }, { type: "RESUME", plan, nowMs });
    expect(resumed).toMatchObject({ partId: "rw-module-1", itemId: "rw-1" });
  });

  it("prevents direct navigation when a part declares linear delivery", () => {
    const linearPackage = parseAssessmentPackage({
      ...satPracticeAssessment,
      packageId: "linear-example",
      parts: [{ ...satPracticeAssessment.parts[0]!, navigation: "linear" }],
    });
    const linearPlan = compileAssessment(linearPackage);
    const active = assessmentSessionReducer(initialAssessmentSession, {
      type: "START", plan: linearPlan, attemptId, startedAt: new Date(nowMs).toISOString(), nowMs,
    });
    expect(assessmentSessionReducer(active, {
      type: "SET_ITEM", plan: linearPlan, itemId: "rw-3",
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
    })).toMatchObject({ view: "result", packageId: submission.packageId, submission });
  });
});
