import { describe, expect, it, vi } from "vitest";
import { ApplicationError } from '@/domain/errors';
import { getAssessmentAuthoringKit } from "@/content/assessmentExamples";
import { satPracticeAssessment } from "@/content/sat";
import {
  gradeAssessment,
  parseAssessmentAuthoringPackage,
  type AssessmentSubmission,
} from "@/domain/assessment";
import { createAssessmentAuthoringToolDefinitions, createAssessmentToolDefinitions } from "./assessmentTools";

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
  it("returns one complete authoring kit with explicit GRE coverage", async () => {
    const tool = createAssessmentAuthoringToolDefinitions({ installAssessment: vi.fn() })
      .find((candidate) => candidate.name === "get_assessment_authoring_kit")!;

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
    const tool = createAssessmentAuthoringToolDefinitions({ installAssessment: vi.fn() })
      .find((candidate) => candidate.name === "get_assessment_authoring_kit")!;

    await expect(
      tool.execute({ template: "minimal-objective" }, undefined as never),
    ).resolves.toMatchObject({ ok: true, data: { template: { id: "minimal-objective" } } });
  });

  it("still honors cancellation when the client supplies a signal", async () => {
    const tool = createAssessmentAuthoringToolDefinitions({ installAssessment: vi.fn() })
      .find((candidate) => candidate.name === "get_assessment_authoring_kit")!;
    const controller = new AbortController();
    controller.abort(new DOMException("Cancelled by client.", "AbortError"));

    await expect(
      tool.execute({ template: "minimal-objective" }, { signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it("installs a complete assessment and reports its visible side effect", async () => {
    const installAssessment = vi.fn(async () => ({ ...satPracticeAssessment, source: "agent" as const }));
    const tool = createAssessmentAuthoringToolDefinitions({ installAssessment })
      .find((candidate) => candidate.name === "install_assessment")!;

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
    const tool = createAssessmentAuthoringToolDefinitions({ installAssessment })
      .find((candidate) => candidate.name === "install_assessment")!;
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
      throw new ApplicationError('ASSESSMENT_INSTALL_CONFLICT',
        "Assessment gre-diagnostic cannot be replaced while its attempt is in progress. " +
        "Finish or discard the current attempt, then install the package again.",
        true,
      );
    });
    const tool = createAssessmentAuthoringToolDefinitions({ installAssessment })
      .find((candidate) => candidate.name === "install_assessment")!;

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

  it("returns answer keys when the submitted package allows answer review", async () => {
    const tool = createAssessmentToolDefinitions({
      readAssessmentAttempt: async () => ({ submission, evaluation: null }),
      attachEvaluation: vi.fn(),
      getCurrentAttemptId: () => attemptId,
    }).find((candidate) => candidate.name === "get_assessment_submission")!;

    const result = await tool.execute({}, options());
    expect(result).toMatchObject({ ok: true, data: { evaluationStatus: "not_required" } });
    expect(JSON.stringify(result)).toContain('"scoring"');
  });

  it('validates focused read inputs and preserves visible-attempt selection checks', async () => {
    let visibleId = attemptId;
    const read = vi.fn(async () => ({ submission, evaluation: null }));
    const tool = createAssessmentToolDefinitions({ readAssessmentAttempt: read, attachEvaluation: vi.fn(),
      getCurrentAttemptId: () => visibleId })[0];
    for (const input of [{ view: 'invalid' }, { itemId: '' }, { attemptId, latest: true }, { part: 1 }]) {
      await expect(tool.execute(input, options())).resolves.toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } });
    }
    expect(read).not.toHaveBeenCalled();
    await expect(tool.execute({ itemId: 'rw-1' }, options())).resolves.toMatchObject({ ok: true, data: {
      scope: { itemId: 'rw-1', partial: true }, submission: { responses: { 'rw-1': 'b' } },
    } });
    await expect(tool.execute({ itemId: 'missing' }, options())).resolves.toMatchObject({ ok: false, error: { code: 'ASSESSMENT_SCOPE_NOT_FOUND' } });
    read.mockImplementation(async () => { visibleId = crypto.randomUUID(); return { submission, evaluation: null }; });
    await expect(tool.execute({ view: 'summary' }, options())).resolves.toMatchObject({ ok: false, error: { code: 'VISIBLE_ATTEMPT_CHANGED' } });
    await expect(tool.execute({ attemptId, itemId: 'rw-1' }, options())).resolves.toMatchObject({ ok: true, data: { selection: { mode: 'id', isVisible: false } } });
  });

  it("keeps authoring and review tool groups explicit", () => {
    const dependencies = {
      readAssessmentAttempt: vi.fn(),
      attachEvaluation: vi.fn(),
      getCurrentAttemptId: () => undefined,
    };
    expect(createAssessmentAuthoringToolDefinitions({ installAssessment: vi.fn() }).map((tool) => tool.name)).toEqual([
      "get_assessment_authoring_kit", "install_assessment",
    ]);
    expect(createAssessmentToolDefinitions(dependencies).map((tool) => tool.name)).toEqual([
      "get_assessment_submission", "attach_assessment_evaluation",
    ]);
  });

  it("rejects an unknown authoring template without installing anything", async () => {
    const installAssessment = vi.fn();
    const tool = createAssessmentAuthoringToolDefinitions({ installAssessment })
      .find((candidate) => candidate.name === "get_assessment_authoring_kit")!;
    const result = await tool.execute({ template: "unknown" }, options());
    expect(result).toMatchObject({
      ok: false,
      error: { code: "INVALID_AUTHORING_TEMPLATE", retryable: true },
    });
    expect(installAssessment).not.toHaveBeenCalled();
  });

  it("describes universal authoring without cross-tool routing prose", () => {
    const tools = createAssessmentAuthoringToolDefinitions({ installAssessment: vi.fn() });
    expect(tools.find((tool) => tool.name === "get_assessment_authoring_kit")?.description)
      .toContain("universal engine capabilities");
    expect(tools.find((tool) => tool.name === "install_assessment")?.description)
      .not.toContain("IELTS");
  });
});
