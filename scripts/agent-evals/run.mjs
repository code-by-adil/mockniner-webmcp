import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { prepareAgentEvalArtifacts } from "./prepare.mjs";
import { evalsArtifactPath, projectRoot, reportDirectory, toolsArtifactPath } from "./shared.mjs";
import { validateAgentEvalReport } from "./validate-report.mjs";

const mode = process.argv[2];
if (!new Set(["local", "browser"]).has(mode)) {
  throw new Error("Usage: node scripts/agent-evals/run.mjs <local|browser> [webmcp-evals options]");
}

const forwarded = process.argv.slice(3);
const release = forwarded.includes("--release");
const cliArguments = forwarded.filter((argument) => argument !== "--release");

function readRuns(argumentsList, fallback) {
  const longIndex = argumentsList.findIndex((argument) => argument === "--runs");
  const shortIndex = argumentsList.findIndex((argument) => argument === "-r");
  const equalsArgument = argumentsList.find((argument) => argument.startsWith("--runs="));
  const value =
    longIndex >= 0
      ? argumentsList[longIndex + 1]
      : shortIndex >= 0
        ? argumentsList[shortIndex + 1]
        : equalsArgument?.slice("--runs=".length);
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0)
    throw new Error("--runs must be a positive integer.");
  return parsed;
}

function withoutRuns(argumentsList) {
  const result = [];
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === "--runs" || argument === "-r") {
      index += 1;
      continue;
    }
    if (argument.startsWith("--runs=")) continue;
    result.push(argument);
  }
  return result;
}

async function listJsonReports() {
  await mkdir(reportDirectory, { recursive: true });
  return (await readdir(reportDirectory))
    .filter((name) => /^report-\d+\.json$/.test(name))
    .map((name) => path.join(reportDirectory, name));
}

async function runEvaluator(argumentsList) {
  const reportsBefore = new Set(await listJsonReports());
  const command = path.join(projectRoot, "node_modules", ".bin", "webmcp-evals");
  const child = spawn(command, argumentsList, {
    cwd: projectRoot,
    env: process.env,
    stdio: "inherit",
  });
  const exitCode = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) reject(new Error(`webmcp-evals stopped by ${signal}`));
      else resolve(code ?? 1);
    });
  });
  if (exitCode !== 0) process.exit(exitCode);

  const candidates = (await listJsonReports()).filter(
    (reportPath) => !reportsBefore.has(reportPath),
  );
  if (candidates.length === 0) throw new Error("webmcp-evals did not produce a new JSON report.");
  const newest = (
    await Promise.all(
      candidates.map(async (reportPath) => ({
        reportPath,
        modifiedAt: (await stat(reportPath)).mtimeMs,
      })),
    )
  ).sort((left, right) => right.modifiedAt - left.modifiedAt)[0];
  return newest.reportPath;
}

async function aggregateReports(reportPaths) {
  const reports = await Promise.all(
    reportPaths.map((reportPath) => readFile(reportPath, "utf8").then(JSON.parse)),
  );
  const results = reports.flatMap((report, index) =>
    (report.results?.results ?? []).map((result) => ({ ...result, runIndex: index + 1 })),
  );
  const aggregate = {
    config: { ...reports[0].config, runs: reports.length, isolatedBrowserRuns: true },
    results: {
      results,
      testCount: reports.reduce((sum, report) => sum + (report.results?.testCount ?? 0), 0),
      passCount: results.filter((result) => result.outcome === "pass").length,
      failCount: results.filter((result) => result.outcome === "fail").length,
      errorCount: results.filter((result) => result.outcome === "error").length,
    },
  };
  const aggregatePath = path.join(reportDirectory, `release-${Date.now()}.json`);
  await writeFile(aggregatePath, `${JSON.stringify(aggregate, null, 2)}\n`);
  return aggregatePath;
}

await prepareAgentEvalArtifacts();

const modeArguments =
  mode === "local"
    ? ["local", "--tools", toolsArtifactPath, "--evals", evalsArtifactPath]
    : [
        "browser",
        "--url",
        process.env.AGENT_EVAL_URL ?? "http://127.0.0.1:5173/",
        "--evals",
        evalsArtifactPath,
      ];
const reportArguments = ["--reporter", "console", "json", "html", "--output-dir", reportDirectory];

if (release) {
  if (mode !== "browser") throw new Error("Release evaluation requires live browser mode.");
  const runCount = readRuns(cliArguments, 5);
  const stableArguments = withoutRuns(cliArguments);
  const reports = [];
  for (let index = 0; index < runCount; index += 1) {
    console.log(`\nIsolated browser run ${index + 1}/${runCount}\n`);
    reports.push(
      await runEvaluator([...modeArguments, ...stableArguments, "--runs", "1", ...reportArguments]),
    );
  }
  const aggregatePath = await aggregateReports(reports);
  await validateAgentEvalReport(aggregatePath, { release: true });
  console.log(`\nValidated aggregate release report: ${aggregatePath}`);
} else {
  const reportPath = await runEvaluator([...modeArguments, ...cliArguments, ...reportArguments]);
  await validateAgentEvalReport(reportPath);
  console.log(`\nValidated report: ${reportPath}`);
}
