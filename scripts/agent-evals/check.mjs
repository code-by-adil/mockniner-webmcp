import assert from "node:assert/strict";
import { prepareAgentEvalArtifacts } from "./prepare.mjs";

const { manifest, tools, evals, smokeEvals, modules } = await prepareAgentEvalArtifacts();

assert.equal(manifest.contractVersion, 1);
assert.equal(manifest.cases.length, 7);
assert.equal(new Set(manifest.cases.map((entry) => entry.id)).size, manifest.cases.length);
assert.equal(new Set(tools.map((tool) => tool.name)).size, tools.length);
assert.deepEqual(
  tools.map((tool) => tool.name),
  [
    "install_practice_set",
    "get_learning_summary",
    "get_assessment_authoring_kit",
    "install_assessment",
  ],
);

const byName = Object.fromEntries(tools.map((tool) => [tool.name, tool]));
assert.match(byName.get_assessment_authoring_kit.description, /closest template/i);
assert.match(byName.get_assessment_authoring_kit.description, /install_practice_set/);
assert.match(byName.install_assessment.description, /GRE-style/);
assert.match(byName.install_practice_set.description, /install_assessment/);

const webMcpToolName = /^[A-Za-z0-9_.-]{1,128}$/;
for (const tool of tools) {
  assert.match(tool.name, webMcpToolName);
  assert(tool.description.trim().length > 0, `${tool.name} needs a non-empty description.`);
  assert.doesNotThrow(
    () => JSON.stringify(tool.inputSchema),
    `${tool.name} has an input schema that cannot be serialized.`,
  );
}

for (const template of ["minimal-objective", "writing-with-rubric", "sat-style", "gre-style"]) {
  const kit = modules.examples.getAssessmentAuthoringKit(template);
  modules.assessment.parseAssessmentAuthoringPackage(kit.examplePackage);
}

const greCoverage = modules.examples.getAssessmentAuthoringKit("gre-style").template.coverage;
assert(greCoverage.unsupported.some((entry) => entry.capability === "select in passage"));
assert(greCoverage.limited.some((entry) => /not an ETS score or percentile/i.test(entry.note)));

assert.equal(evals.length, manifest.cases.length);
for (const evaluation of evals) {
  assert(Array.isArray(evaluation.messages) && evaluation.messages.length > 0);
  assert(Array.isArray(evaluation.expectedCall));
}
assert.deepEqual(
  smokeEvals[0].expectedCall.map((step) => step.functionName),
  [
    "get_learning_summary",
    "get_assessment_authoring_kit",
    "install_assessment",
    "install_practice_set",
  ],
);

console.log(
  `Agent eval preflight passed: ${tools.length} live tool schemas, ${evals.length} cases, 4 valid authoring kits.`,
);
