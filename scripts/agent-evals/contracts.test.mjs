import { beforeAll, describe, expect, it } from "vitest";
import { buildAgentEvalArtifacts } from "./prepare.mjs";

describe("agent evaluation fixtures", () => {
  let artifacts;

  beforeAll(async () => {
    artifacts = await buildAgentEvalArtifacts();
  });

  it("compiles the ten source cases without writing artifacts", () => {
    expect(artifacts.manifest.contractVersion).toBe(3);
    expect(artifacts.manifest.cases).toHaveLength(10);
    expect(new Set(artifacts.manifest.cases.map((entry) => entry.id)).size).toBe(10);
    expect(artifacts.evals).toHaveLength(10);

    for (const evaluation of artifacts.evals) {
      expect(evaluation.messages.length).toBeGreaterThan(0);
      expect(Array.isArray(evaluation.expectedCall)).toBe(true);
    }
  });

  it("references only tools supplied by the production home composer", () => {
    const toolNames = new Set(artifacts.tools.map((tool) => tool.name));
    const referencedNames = artifacts.evals
      .flatMap((evaluation) => evaluation.expectedCall)
      .map((call) => call.functionName);

    expect(referencedNames.every((name) => toolNames.has(name))).toBe(true);
  });

  it("reads the installed packages from a fresh page in the smoke journey", () => {
    expect(artifacts.smokeEvals).toHaveLength(2);
    expect(artifacts.smokeEvals[1].expectedCall.map(call => call.functionName)).toEqual([
      "get_assessment_content", "get_practice_library",
    ]);
    expect(artifacts.smokeEvals[1].expectedCall.every(call => call.result.ok === true)).toBe(true);
    const { openAfterInstall, ...installed } = artifacts.smokeEvals[0].expectedCall.find(call => call.functionName === "install_assessment").arguments;
    expect(openAfterInstall).toBe(false);
    expect(artifacts.smokeEvals[1].expectedCall[0].result.data.package).toEqual(installed);
  });
});
