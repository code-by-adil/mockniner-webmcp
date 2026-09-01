import { describe, expect, it, vi } from "vitest";
import { satPracticeAssessment } from "@/content/sat";
import { gradeAssessment, type AssessmentSubmission } from "@/domain/assessment";
import { createAssessmentToolDefinitions } from "./assessmentTools";

const attemptId = "33333333-3333-4333-8333-333333333333";
const submission: AssessmentSubmission = {
  attemptId,
  packageId: satPracticeAssessment.packageId,
  profileId: satPracticeAssessment.profileId,
  package: satPracticeAssessment,
  responses: { "rw-1": "b" },
  result: gradeAssessment(satPracticeAssessment, { "rw-1": "b" }),
  startedAt: "2026-09-02T10:00:00.000Z",
  submittedAt: "2026-09-02T10:20:00.000Z",
};

const options = () => ({ signal: new AbortController().signal });

describe("universal assessment WebMCP tools", () => {
  it("describes the supported trusted component vocabulary", async () => {
    const tool = createAssessmentToolDefinitions({
      installAssessment: vi.fn(),
      readAssessmentAttempt: vi.fn(),
      attachEvaluation: vi.fn(),
      getCurrentAttemptId: () => undefined,
    }).find((candidate) => candidate.name === "get_assessment_capabilities")!;

    const result = await tool.execute({}, options()) as { ok: true; data: { interactions: string[] } };
    expect(result.data.interactions).toEqual(expect.arrayContaining([
      "single_choice",
      "numeric_entry",
      "extended_text",
      "matching",
    ]));
  });

  it("installs a complete assessment and reports its visible side effect", async () => {
    const installAssessment = vi.fn(async () => ({ ...satPracticeAssessment, source: "agent" as const }));
    const tool = createAssessmentToolDefinitions({
      installAssessment,
      readAssessmentAttempt: vi.fn(),
      attachEvaluation: vi.fn(),
      getCurrentAttemptId: () => undefined,
    }).find((candidate) => candidate.name === "install_assessment")!;

    const result = await tool.execute(satPracticeAssessment, options());
    expect(result).toMatchObject({
      ok: true,
      data: { profileId: "sat-practice", itemCount: 12 },
      sideEffect: { visibleView: "assessment_library" },
    });
  });

  it("never returns answer keys with a submission", async () => {
    const tool = createAssessmentToolDefinitions({
      installAssessment: vi.fn(),
      readAssessmentAttempt: async () => ({ submission, evaluation: null }),
      attachEvaluation: vi.fn(),
      getCurrentAttemptId: () => attemptId,
    }).find((candidate) => candidate.name === "get_assessment_submission")!;

    const result = await tool.execute({}, options());
    expect(result).toMatchObject({ ok: true, data: { evaluationStatus: "not_required" } });
    expect(JSON.stringify(result)).not.toContain('"scoring"');
  });
});
