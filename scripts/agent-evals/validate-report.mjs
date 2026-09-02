import { readFile } from "node:fs/promises";
import {
  collectCalls,
  collectTrajectoryText,
  loadProjectModules,
  readCaseManifest,
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
      assessment.rubrics.length === 1,
      `expected one rubric, received ${assessment.rubrics.length}`,
      issues,
    );
    assert(
      assessment.rubrics[0]?.criteria.length === 4,
      `expected four rubric criteria, received ${assessment.rubrics[0]?.criteria.length ?? 0}`,
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

function expectedRoute(definition) {
  if (definition.kind === "universal") {
    return ["get_assessment_authoring_kit", "install_assessment"];
  }
  if (definition.kind === "ielts") {
    return ["get_ielts_authoring_kit", "install_ielts_practice_set"];
  }
  if (definition.kind === "unsupported") return ["get_assessment_authoring_kit"];
  if (definition.kind === "repair") return ["install_assessment"];
  return [];
}

function sameRoute(expected, actual) {
  return (
    expected.length === actual.length && expected.every((name, index) => actual[index] === name)
  );
}

async function validateRun(definition, runIndex, reportResults, modules) {
  const issues = [];
  const entries = reportResults.filter(
    (entry) => entry.test?.name === definition.name && (entry.runIndex ?? 1) === runIndex,
  );
  const calls = collectCalls(reportResults, definition.name, runIndex);
  const route = calls.map((call) => call.functionName);
  assert(entries.length > 0, "evaluation runner returned no result", issues);
  assert(
    entries.every((entry) => entry.outcome === "pass"),
    "WebMCP call matcher reported a failure",
    issues,
  );
  assert(
    sameRoute(expectedRoute(definition), route),
    `expected route ${expectedRoute(definition).join(" -> ")}, received ${route.join(" -> ") || "no calls"}`,
    issues,
  );

  if (definition.kind === "universal" || definition.kind === "repair") {
    const install = calls.find((call) => call.functionName === "install_assessment");
    if (install) {
      try {
        const assessment = modules.assessment.parseAssessmentAuthoringPackage(install.args);
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
        const content = modules.contentDocument.parsePracticeContentDocument({
          ...install.args,
          source: "agent",
        });
        assert(
          content.section === "reading",
          `expected IELTS Reading, received ${content.section}`,
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
    const responseText = collectTrajectoryText(reportResults, definition.name, runIndex);
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
  const [manifest, modules, report] = await Promise.all([
    readCaseManifest(),
    loadProjectModules(),
    readFile(reportPath, "utf8").then(JSON.parse),
  ]);
  const reportResults = report.results?.results ?? [];
  const runCount = report.config?.runs ?? 1;
  const results = [];
  for (const definition of manifest.cases) {
    for (let runIndex = 1; runIndex <= runCount; runIndex += 1) {
      results.push(await validateRun(definition, runIndex, reportResults, modules));
    }
  }
  printResults(results);
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
