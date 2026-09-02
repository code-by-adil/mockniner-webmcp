import { beforeAll, describe, expect, it } from "vitest";
import { buildAgentEvalArtifacts } from "./prepare.mjs";

describe("agent evaluation fixtures", () => {
  let artifacts;

  beforeAll(async () => {
    artifacts = await buildAgentEvalArtifacts();
  });

  it("compiles the seven source cases without writing artifacts", () => {
    expect(artifacts.manifest.contractVersion).toBe(2);
    expect(artifacts.manifest.cases).toHaveLength(7);
    expect(new Set(artifacts.manifest.cases.map((entry) => entry.id)).size).toBe(7);
    expect(artifacts.evals).toHaveLength(7);

    for (const evaluation of artifacts.evals) {
      expect(evaluation.messages.length).toBeGreaterThan(0);
      expect(Array.isArray(evaluation.expectedCall)).toBe(true);
    }
  });

  it("references only tools supplied by the production home composer", () => {
    const toolNames = new Set(artifacts.tools.map((tool) => tool.name));
    const referencedNames = [...artifacts.evals, ...artifacts.smokeEvals]
      .flatMap((evaluation) => evaluation.expectedCall)
      .map((call) => call.functionName);

    expect(referencedNames.every((name) => toolNames.has(name))).toBe(true);
  });
});
