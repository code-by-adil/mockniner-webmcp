// @vitest-environment happy-dom
import { act, StrictMode, useReducer, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { satPracticeAssessment } from "@/content/sat";
import { gradeAssessment, parseAssessmentPackage, type AssessmentPackage, type AssessmentSubmission } from "@/domain/assessment";
import { assessmentSessionReducer, initialAssessmentSession, type AssessmentSession } from "@/domain/assessmentSession";
import { AssessmentRunner } from "./AssessmentRunner";

const nowMs = Date.parse("2026-09-03T10:00:00Z");
const resumeMs = nowMs + 481_000;
const noop = () => undefined;
const controls = {
  onExit: noop, onResponse: noop, onToggleMark: noop, onToggleElimination: noop,
  onSetTimerHidden: noop, onSetItem: noop, onTick: noop, onAdvanceItem: noop, onCompletePart: noop,
};

function start(assessment = satPracticeAssessment): AssessmentSession {
  return assessmentSessionReducer(initialAssessmentSession, {
    type: "START", assessment, attemptId: "33333333-3333-4333-8333-333333333333",
    startedAt: new Date(nowMs).toISOString(), nowMs,
  });
}

function submission(assessment: AssessmentPackage): AssessmentSubmission {
  return { attemptId: "33333333-3333-4333-8333-333333333333", packageId: assessment.packageId,
    package: assessment, responses: {}, result: gradeAssessment(assessment, {}),
    startedAt: new Date(nowMs).toISOString(), submittedAt: new Date(resumeMs).toISOString() };
}

function ResumeHost({ assessment, onExpirePart, onSubmit }: Pick<ComponentProps<typeof AssessmentRunner>, "assessment" | "onExpirePart" | "onSubmit">) {
  const [session, dispatch] = useReducer(assessmentSessionReducer,
    assessmentSessionReducer(start(assessment), { type: "GO_HOME" }));
  if (session.view === "home") return <button type="button" onClick={() => dispatch({ type: "RESUME", assessment, nowMs: resumeMs })}>Resume</button>;
  if (session.view === "result") return <p>Result saved</p>;
  return <AssessmentRunner key={session.partId} {...controls} assessment={assessment} session={session}
    onExpirePart={partId => { onExpirePart(partId); dispatch({ type: "EXPIRE_PART", assessment, partId, nowMs: resumeMs }); }}
    onSubmit={async () => { const saved = await onSubmit(); dispatch({ type: "COMPLETE", submission: saved }); return saved; }} />;
}

describe("mounted assessment runner", () => {
  let host: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove(); vi.useRealTimers(); vi.unstubAllGlobals();
  });

  it("advances an expired draft exactly once when resumed under StrictMode", async () => {
    const onExpirePart = vi.fn();
    const onSubmit = vi.fn(async () => submission(satPracticeAssessment));
    await act(async () => root.render(<StrictMode><ResumeHost assessment={satPracticeAssessment} onExpirePart={onExpirePart} onSubmit={onSubmit} /></StrictMode>));
    await act(async () => host.querySelector<HTMLButtonElement>("button")!.click());
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(onExpirePart).toHaveBeenCalledExactlyOnceWith("rw-module-1");
    expect(onSubmit).not.toHaveBeenCalled();
    expect(host.textContent).toContain("Average weekly bicycle trips");
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(onExpirePart).toHaveBeenCalledTimes(1);
  });

  it("submits an expired final part exactly once", async () => {
    const assessment = parseAssessmentPackage({ ...satPracticeAssessment, parts: [satPracticeAssessment.parts.at(-1)!] });
    const onSubmit = vi.fn(async () => submission(assessment));
    const onExpirePart = vi.fn();
    await act(async () => root.render(<StrictMode><ResumeHost assessment={assessment} onExpirePart={onExpirePart} onSubmit={onSubmit} /></StrictMode>));
    await act(async () => host.querySelector<HTMLButtonElement>("button")!.click());
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onExpirePart).not.toHaveBeenCalled();
    expect(host.textContent).toBe("Result saved");
  });

  it("reschedules a canceled expiry when its callback changes before delivery", async () => {
    const session = { ...start(), secondsRemaining: 0 };
    const first = vi.fn();
    const second = vi.fn();
    const onSubmit = vi.fn(async () => submission(satPracticeAssessment));
    await act(async () => root.render(<AssessmentRunner key={session.partId} {...controls} assessment={satPracticeAssessment} session={session} onExpirePart={first} onSubmit={onSubmit} />));
    await act(async () => root.render(<AssessmentRunner key={session.partId} {...controls} assessment={satPracticeAssessment} session={session} onExpirePart={second} onSubmit={onSubmit} />));
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledExactlyOnceWith("rw-module-1");
  });

  it("performs chained arithmetic through the visible calculator buttons", async () => {
    const session = { ...start(), partId: "math-module-1", itemId: "math-3" };
    await act(async () => root.render(<StrictMode><AssessmentRunner key={session.partId} {...controls} assessment={satPracticeAssessment} session={session} onExpirePart={noop} onSubmit={async () => submission(satPracticeAssessment)} /></StrictMode>));
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Open calculator"]')!.click());
    const calculator = host.querySelector<HTMLDialogElement>('[aria-labelledby="assessment-calculator-title"]')!;
    expect(calculator.open).toBe(true);
    for (const label of ["2", "+", "3", "+", "4", "="]) {
      await act(async () => [...calculator.querySelectorAll("button")].find(button => button.textContent === label)!.click());
    }
    expect(calculator.querySelector("output")!.textContent.trim()).toBe("9");
  });
});
