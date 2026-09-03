import { parseArgs } from "node:util";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { executeSmokeEvals } from "webmcp-evals/dist/evaluator/smokeEvaluator.js";
import { BrowserToolRegistry } from "webmcp-evals/dist/evaluator/browser.js";
import { matchesArgument } from "webmcp-evals/dist/matcher.js";
import { prepareAgentEvalArtifacts } from "./prepare.mjs";
import { reportDirectory } from "./shared.mjs";

export function assertSmokeResult(raw, expected = { ok: true }) {
  const result = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (result?.ok !== true) {
    throw new Error(`Application rejected the smoke call: ${JSON.stringify(result)}`);
  }
  if (!matchesArgument(expected, result)) {
    throw new Error(`Smoke readback mismatch. Expected ${JSON.stringify(expected)}; received ${JSON.stringify(result)}`);
  }
  return result;
}

// The pinned runner checks transport errors, but does not recognize our ok:false
// result or assert fixture results. Check both before it advances to another call.
export function checkedSmokeRegistry(registry, test) {
  let stepIndex = 0;
  return {
    getCurrentTools: () => registry.getCurrentTools(),
    async executeToolChecked(name, args) {
      const expected = test.expectedCall[stepIndex++];
      if (expected?.functionName !== name) throw new Error(`Unexpected smoke call ${name}.`);
      const outcome = await registry.executeToolChecked(name, args);
      if (!outcome.success) return outcome;
      return { success: true, result: assertSmokeResult(outcome.result, expected.result) };
    },
  };
}

async function main() {
  const { values } = parseArgs({ options: {
    "chrome-channel": { type: "string", default: "chrome-canary" },
    verbose: { type: "boolean", default: false },
    timeout: { type: "string", default: "30000" },
    url: { type: "string", default: process.env.AGENT_EVAL_URL ?? "http://127.0.0.1:5173/" },
  } });
  const timeoutMs = Number(values.timeout);
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) throw new Error("--timeout must be a positive integer in milliseconds.");
  const { smokeEvals } = await prepareAgentEvalArtifacts();
  const config = { url: values.url, chromeChannel: values["chrome-channel"], verbose: values.verbose, timeoutMs };
  const results = await executeSmokeEvals(smokeEvals, config, {
    createRegistry: (page, testIndex) => checkedSmokeRegistry(new BrowserToolRegistry(page), smokeEvals[testIndex]),
  });
  await mkdir(reportDirectory, { recursive: true });
  const reportPath = path.join(reportDirectory, `smoke-${Date.now()}.json`);
  await writeFile(reportPath, `${JSON.stringify({ config, results }, null, 2)}\n`);
  for (const result of results.results) {
    console.log(`${result.outcome === "pass" ? "PASS" : "FAIL"}  ${result.testName}: ${result.functionName}${result.error ? `\n  ${result.error}` : ""}`);
  }
  console.log(`\n${results.passCount}/${results.totalExpectedSteps} authoring and persisted-readback calls passed. Report: ${reportPath}`);
  if (results.errorCount || results.passCount !== results.totalExpectedSteps) process.exitCode = 1;
}

if (process.argv[1] === new URL(import.meta.url).pathname) await main();
