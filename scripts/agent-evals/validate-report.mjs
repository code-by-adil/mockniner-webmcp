import { readFile, writeFile } from "node:fs/promises";
import { evaluateExecutionTrajectory } from "webmcp-evals/dist/utils.js";
import { buildAgentEvalArtifacts } from "./prepare.mjs";
import {
  collectCalls,
  readFinalResponseText,
} from "./shared.mjs";

function walk(value, visit) {
  if (!value || typeof value !== "object") return;
  visit(value);
  if (Array.isArray(value)) {
    value.forEach((entry) => walk(entry, visit));
    return;
  }
  Object.values(value).forEach((entry) => walk(entry, visit));
}

function objectsWithType(value, type) {
  const matches = [];
  walk(value, (entry) => {
    if (entry.type === type) matches.push(entry);
  });
  return matches;
}

function allItems(assessment) {
  return assessment.parts.flatMap((part) => part.items);
}

function allLearnerTools(assessment) {
  return assessment.parts.flatMap((part) => part.tools ?? []).map((tool) => tool.type);
}

function assert(condition, message, issues) {
  if (!condition) issues.push(message);
}

export function officialGreScoreClaims(value) {
  const claims = [];
  walk(value, (entry) => {
    for (const candidate of Object.values(entry)) {
      if (typeof candidate !== "string") continue;
      const sentences = candidate.split(/(?<=[.!?])\s+/);
      for (const sentence of sentences) {
        const mentionsOfficialScore =
          /\b(?:official\s+(?:GRE|ETS)|ETS)\s+(?:score|scoring|percentile)/i.test(sentence);
        const negatesClaim =
          /\b(?:not|isn't|is not|doesn't|does not|unofficial|practice-only|practice only)\b/i.test(
            sentence,
          );
        if (mentionsOfficialScore && !negatesClaim) claims.push(sentence);
      }
    }
  });
  return claims;
}

export function validateUniversalSemantics(caseId, assessment, issues) {
  const items = allItems(assessment);
  const tools = allLearnerTools(assessment);
  const scoreClaims = officialGreScoreClaims(assessment);
  assert(
    scoreClaims.length === 0,
    `claims official GRE or ETS scoring: ${scoreClaims.join(" | ")}`,
    issues,
  );

  if (caseId === "sat-full" || caseId === "gre-full") {
    const counts = caseId === "sat-full" ? [27, 27, 22, 22] : [1, 12, 12, 15, 15];
    const times = caseId === "sat-full" ? [1920, 1920, 2100, 2100] : [1800, 1080, 1260, 1380, 1560];
    assert(JSON.stringify(assessment.parts.map(part => part.items.length)) === JSON.stringify(counts), 'full exam question counts do not match the template', issues);
    assert(JSON.stringify(assessment.parts.map(part => part.durationSeconds)) === JSON.stringify(times), 'full exam timings do not match the template', issues);
  }

  if (caseId === "gre-verbal") {
    const completions = items.filter((item) => item.interaction.type === "grouped_choice");
    assert(items.length === 10, `expected 10 items, received ${items.length}`, issues);
    const passages = objectsWithType(assessment, "passage");
    assert(passages.length === 1, `expected one passage, received ${passages.length}`, issues);
    assert(
      completions.length === 2,
      `expected 2 grouped-choice Text Completion items, received ${completions.length}`,
      issues,
    );
    completions.forEach((item, index) => {
      assert(
        item.interaction.groups.length === 3,
        `Text Completion ${index + 1} does not have three blanks`,
        issues,
      );
    });
  }

  if (caseId === "gre-quantitative") {
    assert(
      items.length >= 3 && items.length <= 8,
      `expected a short set of 3-8 items, received ${items.length}`,
      issues,
    );
    assert(tools.includes("calculator"), "calculator is not declared on a part", issues);
    assert(objectsWithType(assessment, "table").length >= 1, "missing a data table", issues);
  }

  if (caseId === "biology-minimal") {
    assert(assessment.resources.length === 0, "biology quiz declares a resource", issues);
    assert(!tools.includes("calculator"), "biology quiz declares a calculator", issues);
    assert(
      !tools.includes("reference_document"),
      "biology quiz declares a reference document",
      issues,
    );
  }

  if (caseId === "writing-rubric") {
    assert(
      Boolean(assessment.rubric),
      "missing the assessment rubric",
      issues,
    );
    assert(
      assessment.rubric?.criteria.length === 4,
      `expected four rubric criteria, received ${assessment.rubric?.criteria.length ?? 0}`,
      issues,
    );
    assert(
      items.some((item) => item.interaction.type === "extended_text"),
      "missing an extended-text response",
      issues,
    );
    assert(
      items.every((item) => item.scoring.type === "agent"),
      "writing item is not agent scored",
      issues,
    );
  }
}

// These reads may inform authoring or verify its result. Other calls, including
// every mutation and authoring-kit selection, remain part of the ordered check.
const authoringDiscoveryTools = new Set([
  "get_practice_context", "get_practice_library", "get_practice_history",
  "get_practice_activity", "get_ielts_learning_summary", "get_assessment_content",
]);

export function evaluateAuthoringCalls(expected, calls) {
  return evaluateExecutionTrajectory(expected, calls.filter(call => !authoringDiscoveryTools.has(call.functionName)));
}

export function validateRun(definition, runIndex, reportResults, modules, expectedCalls) {
  const issues = [];
  const entries = reportResults.filter(
    (entry) => entry.test?.name === definition.name && (entry.runIndex ?? 1) === runIndex,
  );
  const calls = collectCalls(reportResults, definition.name, runIndex);
  assert(entries.length > 0, "evaluation runner returned no result", issues);
  assert(
    entries.every((entry) => entry.outcome !== "error"),
    "WebMCP execution reported an error",
    issues,
  );
  assert(
    evaluateAuthoringCalls(expectedCalls, calls).every(entry => entry.outcome === "pass"),
    "Required authoring calls did not match their order, arguments or successful results, or an unexpected tool was called",
    issues,
  );

  if (definition.kind === "universal" || definition.kind === "repair") {
    const install = calls.find((call) => call.functionName === "install_assessment");
    if (install) {
      try {
        const { openAfterInstall: _openAfterInstall, ...document } = install.args;
        const assessment = modules.assessment.parseAssessmentAuthoringPackage(document);
        validateUniversalSemantics(definition.id, assessment, issues);
      } catch (error) {
        issues.push(
          `install_assessment payload fails the application parser: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  if (definition.kind === "ielts") {
    const install = calls.find(
      (call) => call.functionName === "install_ielts_practice_set",
    );
    if (install) {
      try {
        const { openAfterInstall: _openAfterInstall, ...document } = install.args;
        const content = modules.contentDocument.parsePracticeContentDocument({
          ...document,
          source: "agent",
        });
        assert(
          content.section === definition.section,
          `expected IELTS ${definition.section}, received ${content.section}`,
          issues,
        );
      } catch (error) {
        issues.push(
          `install_ielts_practice_set payload fails the application parser: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  if (definition.kind === "unsupported") {
    const responseText = readFinalResponseText(reportResults, definition.name, runIndex);
    assert(
      /(?:unsupported|not supported|cannot|can't)/i.test(responseText),
      "final response does not explain that the interaction is unsupported",
      issues,
    );
    assert(
      /(?:passage|sentence)/i.test(responseText),
      "final response does not identify passage sentence selection",
      issues,
    );
  }

  return { definition, runIndex, issues, passed: issues.length === 0 };
}

function printResults(results) {
  console.log("\nAgent authoring contract\n");
  for (const result of results) {
    const status = result.passed ? "PASS" : "FAIL";
    console.log(`${status}  ${result.definition.id}  run ${result.runIndex}`);
    result.issues.forEach((issue) => console.log(`      - ${issue}`));
  }
}

function enforceReleaseBar(results, release) {
  const passed = results.filter((result) => result.passed).length;
  const overallRate = results.length === 0 ? 0 : passed / results.length;
  const requiredOverall = release ? 0.9 : 1;
  const requiredPerCase = release ? 0.8 : 1;
  const safetyCases = new Set(["ielts-reading", "unsupported-passage-selection"]);
  const failures = [];

  if (overallRate < requiredOverall) {
    failures.push(
      `overall pass rate ${(overallRate * 100).toFixed(1)}% is below ${(requiredOverall * 100).toFixed(0)}%`,
    );
  }

  const byCase = Map.groupBy(results, (result) => result.definition.id);
  for (const [caseId, caseResults] of byCase) {
    const caseRate = caseResults.filter((result) => result.passed).length / caseResults.length;
    const threshold = safetyCases.has(caseId) ? 1 : requiredPerCase;
    if (caseRate < threshold) {
      failures.push(
        `${caseId} pass rate ${(caseRate * 100).toFixed(1)}% is below ${(threshold * 100).toFixed(0)}%`,
      );
    }
  }

  console.log(
    `\n${passed}/${results.length} case runs passed (${(overallRate * 100).toFixed(1)}%).`,
  );
  if (failures.length) throw new Error(`Agent evaluation gate failed:\n- ${failures.join("\n- ")}`);
}

export async function validateAgentEvalReport(reportPath, { release = false } = {}) {
  const [{ manifest, modules, evals }, report] = await Promise.all([
    buildAgentEvalArtifacts(),
    readFile(reportPath, "utf8").then(JSON.parse),
  ]);
  const reportResults = report.results?.results ?? [];
  const runCount = report.config?.runs ?? 1;
  const results = [];
  for (const definition of manifest.cases) {
    for (let runIndex = 1; runIndex <= runCount; runIndex += 1) {
      results.push(validateRun(definition, runIndex, reportResults, modules,
        evals.find(evaluation => evaluation.name === definition.name).expectedCall));
    }
  }
  printResults(results);
  const validationPath = reportPath.replace(/\.json$/, "") + ".validation.json";
  await writeFile(validationPath, `${JSON.stringify({
    sourceReport: reportPath,
    policy: "Ordered authoring calls with read-only discovery; application schema and request-specific validation",
    config: report.config,
    release,
    results: results.map(({ definition, runIndex, issues, passed }) => ({ caseId: definition.id, runIndex, issues, passed })),
  }, null, 2)}\n`);
  console.log(`Application validation report: ${validationPath}`);
  enforceReleaseBar(results, release);
  return results;
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const reportPath = process.argv[2];
  if (!reportPath)
    throw new Error(
      "Usage: node scripts/agent-evals/validate-report.mjs <report.json> [--release]",
    );
  await validateAgentEvalReport(reportPath, { release: process.argv.includes("--release") });
}
