import { describe, expect, it } from "vitest";
import { writingDocument } from "@/content/writing";
import { initialAssessmentSession } from "@/domain/assessmentSession";
import { initialSession } from "@/domain/session";
import type { SpeakingSubmission, WritingSubmission } from "@/domain/types";
import { getAssessmentToolSurface, getNativeToolSurfaces } from "./toolSurfaces";

const writingSubmission: WritingSubmission = {
  attemptId: "22222222-2222-4222-8222-222222222222",
  contentKey: "writing",
  tasks: [
    { task: writingDocument.tasks[0], response: "Task one response.", wordCount: 3 },
    { task: writingDocument.tasks[1], response: "Task two response.", wordCount: 3 },
  ],
  startedAt: "2026-09-02T10:00:00.000Z",
  submittedAt: "2026-09-02T11:00:00.000Z",
};

const speakingSubmission: SpeakingSubmission = {
  attemptId: "33333333-3333-4333-8333-333333333333",
  contentKey: "speaking",
  responses: [],
  startedAt: "2026-09-02T10:00:00.000Z",
  submittedAt: "2026-09-02T10:15:00.000Z",
};

describe("contextual WebMCP surfaces", () => {
  it("shows only authoring tools in the library", () => {
    expect(getAssessmentToolSurface(true, initialAssessmentSession)).toBe("authoring");
    expect(getNativeToolSurfaces(initialSession, initialAssessmentSession)).toEqual({
      authoringEnabled: true,
      writing: "none",
      speaking: "none",
    });
  });

  it("hides native tools when a universal assessment owns the screen", () => {
    expect(
      getNativeToolSurfaces(initialSession, {
        ...initialAssessmentSession,
        view: "assessment",
        packageId: "sat-practice",
        partId: "reading",
      }),
    ).toEqual({ authoringEnabled: false, writing: "none", speaking: "none" });
  });

  it("shows Writing evaluation tools only around a visible submission", () => {
    expect(
      getNativeToolSurfaces(
        {
          ...initialSession,
          view: "transition",
          currentSection: "writing",
          writingSubmission,
        },
        initialAssessmentSession,
      ).writing,
    ).toBe("evaluation");

    expect(
      getNativeToolSurfaces(
        {
          ...initialSession,
          view: "home",
          currentSection: "writing",
          writingSubmission,
        },
        initialAssessmentSession,
      ).writing,
    ).toBe("none");
  });

  it("shows the live Speaking tool during the interview and evaluation tools after submission", () => {
    expect(
      getNativeToolSurfaces(
        {
          ...initialSession,
          view: "exam",
          currentSection: "speaking",
        },
        initialAssessmentSession,
      ).speaking,
    ).toBe("interview");

    expect(
      getNativeToolSurfaces(
        {
          ...initialSession,
          view: "transition",
          currentSection: "speaking",
          speakingSubmission,
        },
        initialAssessmentSession,
      ).speaking,
    ).toBe("evaluation");
  });
});
