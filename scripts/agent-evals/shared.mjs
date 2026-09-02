import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

export const projectRoot = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
export const casesPath = path.join(projectRoot, "agent-evals", "authoring-cases.json");
export const artifactDirectory = path.join(projectRoot, ".evals", "agent-authoring", "fixtures");
export const reportDirectory = path.join(projectRoot, ".evals", "agent-authoring", "reports");
export const toolsArtifactPath = path.join(artifactDirectory, "tools.json");
export const evalsArtifactPath = path.join(artifactDirectory, "evals.json");
export const smokeEvalsArtifactPath = path.join(artifactDirectory, "smoke-evals.json");

export async function readCaseManifest() {
  return JSON.parse(await readFile(casesPath, "utf8"));
}

export async function loadProjectModules() {
  const { createServer } = await import("vite");
  const server = await createServer({
    root: projectRoot,
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });

  try {
    const [
      assessmentTools,
      practiceTools,
      learningTools,
      examples,
      assessment,
      contentDocument,
      writing,
    ] =
      await Promise.all([
        server.ssrLoadModule("/src/webmcp/assessmentTools.ts"),
        server.ssrLoadModule("/src/webmcp/practiceTools.ts"),
        server.ssrLoadModule("/src/webmcp/learningTools.ts"),
        server.ssrLoadModule("/src/content/assessmentExamples.ts"),
        server.ssrLoadModule("/src/domain/assessment.ts"),
        server.ssrLoadModule("/src/domain/contentDocument.ts"),
        server.ssrLoadModule("/src/content/writing.ts"),
      ]);
    return {
      assessmentTools,
      practiceTools,
      learningTools,
      examples,
      assessment,
      contentDocument,
      writing,
    };
  } finally {
    await server.close();
  }
}

export function collectCalls(results, caseName, runIndex) {
  return results
    .filter((entry) => entry.test?.name === caseName && (entry.runIndex ?? 1) === runIndex)
    .map((entry) => entry.response)
    .filter((response) => response && typeof response.functionName === "string");
}

export function collectTrajectoryText(results, caseName, runIndex) {
  const entry = results.find(
    (candidate) => candidate.test?.name === caseName && (candidate.runIndex ?? 1) === runIndex,
  );
  if (!entry?.trajectory) return "";
  return entry.trajectory
    .flatMap((step) => [step.text, step.reasoningText])
    .filter((value) => typeof value === "string")
    .join("\n");
}
