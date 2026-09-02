import { describe, expect, it, vi } from "vitest";
import { getAssessmentAuthoringKit } from "@/content/assessmentExamples";
import { satPracticeAssessment } from "@/content/sat";
import {
  gradeAssessment,
  parseAssessmentAuthoringPackage,
  type AssessmentSubmission,
} from "@/domain/assessment";
import { createAssessmentToolDefinitions } from "./assessmentTools";

const attemptId = "33333333-3333-4333-8333-333333333333";
const submission: AssessmentSubmission = {
  attemptId,
  packageId: satPracticeAssessment.packageId,
  package: satPracticeAssessment,
  responses: { "rw-1": "b" },
  result: gradeAssessment(satPracticeAssessment, { "rw-1": "b" }),
  startedAt: "2026-09-02T10:00:00.000Z",
  submittedAt: "2026-09-02T10:20:00.000Z",
};

const options = () => ({ signal: new AbortController().signal });

describe("universal assessment WebMCP tools", () => {
  it("returns one complete authoring kit with honest GRE coverage", async () => {
    const tool = createAssessmentToolDefinitions({
      installAssessment: vi.fn(),
      readAssessmentAttempt: vi.fn(),
      attachEvaluation: vi.fn(),
      getCurrentAttemptId: () => undefined,
    }).find((candidate) => candidate.name === "get_assessment_authoring_kit")!;

    const result = await tool.execute({ template: "gre-style" }, options()) as {
      ok: true;
      data: {
        capabilities: { interactions: string[] };
        template: { coverage: { unsupported: Array<{ capability: string }> } };
        examplePackage: { source?: string; parts: Array<{ items: Array<{ interaction: { type: string } }> }> };
      };
    };
    expect(result.data.capabilities.interactions).toEqual(expect.arrayContaining([
      "single_choice",
      "numeric_entry",
      "extended_text",
      "grouped_choice",
    ]));
    expect(result.data.template.coverage.unsupported).toContainEqual(
      expect.objectContaining({ capability: "select in passage" }),
    );
    expect(result.data.examplePackage).not.toHaveProperty("source");
    expect(result.data.examplePackage.parts.flatMap((part) => part.items))
      .toContainEqual(expect.objectContaining({ interaction: expect.objectContaining({ type: "grouped_choice" }) }));
  });

  it("supports native clients that omit callback options", async () => {
    const tool = createAssessmentToolDefinitions({
      installAssessment: vi.fn(),
      readAssessmentAttempt: vi.fn(),
      attachEvaluation: vi.fn(),
      getCurrentAttemptId: () => undefined,
    }).find((candidate) => candidate.name === "get_assessment_authoring_kit")!;

    await expect(
      tool.execute({ template: "minimal-objective" }, undefined as never),
    ).resolves.toMatchObject({ ok: true, data: { template: { id: "minimal-objective" } } });
  });

  it("still honors cancellation when the client supplies a signal", async () => {
    const tool = createAssessmentToolDefinitions({
      installAssessment: vi.fn(),
      readAssessmentAttempt: vi.fn(),
      attachEvaluation: vi.fn(),
      getCurrentAttemptId: () => undefined,
    }).find((candidate) => candidate.name === "get_assessment_authoring_kit")!;
    const controller = new AbortController();
    controller.abort(new DOMException("Cancelled by client.", "AbortError"));

    await expect(
      tool.execute({ template: "minimal-objective" }, { signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it("installs a complete assessment and reports its visible side effect", async () => {
    const installAssessment = vi.fn(async () => ({ ...satPracticeAssessment, source: "agent" as const }));
    const tool = createAssessmentToolDefinitions({
      installAssessment,
      readAssessmentAttempt: vi.fn(),
      attachEvaluation: vi.fn(),
      getCurrentAttemptId: () => undefined,
    }).find((candidate) => candidate.name === "install_assessment")!;

    const result = await tool.execute(getAssessmentAuthoringKit("sat-style").examplePackage, options());
    expect(result).toMatchObject({
      ok: true,
      data: { itemCount: 12 },
      sideEffect: { visibleView: "assessment_library" },
    });
    expect(tool.annotations).toMatchObject({
      readOnlyHint: false,
      untrustedContentHint: true,
    });
  });

  it("returns repairable paths when a complete package fails validation", async () => {
    const installAssessment = vi.fn(async (input: unknown) => ({
      ...parseAssessmentAuthoringPackage(input),
      source: "agent" as const,
    }));
    const tool = createAssessmentToolDefinitions({
      installAssessment,
      readAssessmentAttempt: vi.fn(),
      attachEvaluation: vi.fn(),
      getCurrentAttemptId: () => undefined,
    }).find((candidate) => candidate.name === "install_assessment")!;
    const invalid = structuredClone(getAssessmentAuthoringKit("minimal-objective").examplePackage);
    invalid.parts[0]!.items[0]!.interaction = {
      type: "single_choice",
      options: [{ id: "a", label: "Only one option" }],
    };

    const result = await tool.execute(invalid, options());
    expect(result).toMatchObject({
      ok: false,
      error: { code: "INVALID_ASSESSMENT", retryable: true },
    });
    expect(result).toHaveProperty(
      "error.issues",
      expect.arrayContaining([
        expect.objectContaining({ path: "parts.0.items.0.interaction.options" }),
      ]),
    );
  });

  it("tells the agent how to resolve an active-attempt install conflict", async () => {
    const installAssessment = vi.fn(async () => {
      throw new Error(
        "Assessment gre-diagnostic cannot be replaced while its attempt is in progress. " +
        "Finish or discard the current attempt, then install the package again.",
      );
    });
    const tool = createAssessmentToolDefinitions({
      installAssessment,
      readAssessmentAttempt: vi.fn(),
      attachEvaluation: vi.fn(),
      getCurrentAttemptId: () => undefined,
    }).find((candidate) => candidate.name === "install_assessment")!;

    const result = await tool.execute(
      getAssessmentAuthoringKit("gre-style").examplePackage,
      options(),
    );

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "ASSESSMENT_INSTALL_CONFLICT",
        retryable: true,
        message: expect.stringContaining("Finish or discard the current attempt"),
      },
    });
  });

  it("never returns answer keys with a submission", async () => {
    const tool = createAssessmentToolDefinitions({
      installAssessment: vi.fn(),
      readAssessmentAttempt: async () => ({ submission, evaluation: null }),
      attachEvaluation: vi.fn(),
      getCurrentAttemptId: () => attemptId,
    }, "results").find((candidate) => candidate.name === "get_assessment_submission")!;

    const result = await tool.execute({}, options());
    expect(result).toMatchObject({ ok: true, data: { evaluationStatus: "not_required" } });
    expect(JSON.stringify(result)).not.toContain('"scoring"');
  });

  it("registers only tools relevant to the visible assessment surface", () => {
    const dependencies = {
      installAssessment: vi.fn(),
      readAssessmentAttempt: vi.fn(),
      attachEvaluation: vi.fn(),
      getCurrentAttemptId: () => undefined,
    };
    expect(createAssessmentToolDefinitions(dependencies, "authoring").map((tool) => tool.name)).toEqual([
      "get_assessment_authoring_kit", "install_assessment",
    ]);
    expect(createAssessmentToolDefinitions(dependencies, "results").map((tool) => tool.name)).toEqual([
      "get_assessment_submission",
    ]);
    expect(createAssessmentToolDefinitions(dependencies, "evaluation").map((tool) => tool.name)).toEqual([
      "get_assessment_submission", "attach_assessment_evaluation",
    ]);
    expect(createAssessmentToolDefinitions(dependencies, "none")).toEqual([]);
  });

  it("rejects an unknown authoring template without installing anything", async () => {
    const installAssessment = vi.fn();
    const tool = createAssessmentToolDefinitions({
      installAssessment,
      readAssessmentAttempt: vi.fn(),
      attachEvaluation: vi.fn(),
      getCurrentAttemptId: () => undefined,
    }).find((candidate) => candidate.name === "get_assessment_authoring_kit")!;
    const result = await tool.execute({ template: "unknown" }, options());
    expect(result).toMatchObject({
      ok: false,
      error: { code: "INVALID_AUTHORING_TEMPLATE", retryable: true },
    });
    expect(installAssessment).not.toHaveBeenCalled();
  });

  it("describes universal authoring without cross-tool routing prose", () => {
    const tools = createAssessmentToolDefinitions({
      installAssessment: vi.fn(),
      readAssessmentAttempt: vi.fn(),
      attachEvaluation: vi.fn(),
      getCurrentAttemptId: () => undefined,
    });
    expect(tools.find((tool) => tool.name === "get_assessment_authoring_kit")?.description)
      .toContain("universal engine capabilities");
    expect(tools.find((tool) => tool.name === "install_assessment")?.description)
      .not.toContain("IELTS");
  });
});
