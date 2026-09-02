import { spawn } from "node:child_process";
import path from "node:path";
import { prepareAgentEvalArtifacts } from "./prepare.mjs";
import { projectRoot, smokeEvalsArtifactPath } from "./shared.mjs";

await prepareAgentEvalArtifacts();

const command = path.join(projectRoot, "node_modules", ".bin", "webmcp-evals");
const argumentsList = [
  "smoke",
  "--url",
  process.env.AGENT_EVAL_URL ?? "http://127.0.0.1:5173/",
  "--evals",
  smokeEvalsArtifactPath,
  ...process.argv.slice(2),
];
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

process.exitCode = exitCode;
