import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { getAssessmentAuthoringKit } from "@/content/assessmentExamples";
import { objectiveContentDocumentSchema } from "@/domain/objectiveContent";
import { writingContentDocumentSchema } from "@/domain/writingContent";
import {
  ASSESSMENT_AUTHORING_TEMPLATE_IDS,
  parseAssessmentAuthoringPackage,
} from "@/domain/assessment";
import {
  getIeltsAuthoringKit,
  IELTS_AUTHORING_SECTIONS,
} from "./ieltsAuthoring";
import { createHomeToolDefinitions } from "./homeTools";

function homeTools() {
  return createHomeToolDefinitions({
    installContent: vi.fn(),
    installAssessment: vi.fn(),
    readLearningSummary: vi.fn(),
  });
}

describe("home authoring WebMCP contracts", () => {
  it("provides unique, serializable WebMCP tool definitions", () => {
    const tools = homeTools();
    const names = tools.map((tool) => tool.name);

    expect(new Set(names).size).toBe(names.length);
    for (const tool of tools) {
      expect(tool.name).toMatch(/^[A-Za-z0-9_.-]{1,128}$/);
      expect(tool.description.trim()).not.toBe("");
      expect(() => JSON.stringify(tool.inputSchema)).not.toThrow();
    }
  });

  it("keeps the always-loaded IELTS installation schema compact", () => {
    const installTool = homeTools().find(
      (tool) => tool.name === "install_ielts_practice_set",
    );
    const compactSchemaSize = JSON.stringify(installTool?.inputSchema).length;
    const fullSchemaSize = JSON.stringify(z.toJSONSchema(z.union([
      objectiveContentDocumentSchema,
      writingContentDocumentSchema,
    ]), { target: "draft-07" })).length;

    expect(compactSchemaSize).toBeLessThan(fullSchemaSize * 0.1);
  });

  it("keeps each IELTS kit scoped to its requested section", () => {
    for (const section of IELTS_AUTHORING_SECTIONS) {
      const kit = getIeltsAuthoringKit(section);
      expect(kit.section).toBe(section);
      expect(kit.documentSchema.properties?.section).toMatchObject({ const: section });
    }

    const listeningSchema = JSON.stringify(
      getIeltsAuthoringKit("listening").documentSchema,
    );
    expect(listeningSchema).toContain('"audio"');
    expect(listeningSchema).toContain('"kokoro"');
    expect(listeningSchema).toContain('"parts"');
    expect(listeningSchema).toContain('"contentKey"');
    expect(listeningSchema).toContain('"local-original"');
  });

  it("keeps every universal example valid and the GRE limits explicit", () => {
    for (const template of ASSESSMENT_AUTHORING_TEMPLATE_IDS) {
      const kit = getAssessmentAuthoringKit(template);
      expect(() => parseAssessmentAuthoringPackage(kit.examplePackage)).not.toThrow();
    }

    const coverage = getAssessmentAuthoringKit("gre-style").template.coverage;
    expect(coverage.unsupported).toEqual(
      expect.arrayContaining([expect.objectContaining({ capability: "select in passage" })]),
    );
    expect(coverage.limited.some((entry) => /not an ETS score or percentile/i.test(entry.note)))
      .toBe(true);
  });
});
