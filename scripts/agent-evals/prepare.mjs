import { mkdir, writeFile } from "node:fs/promises";
import {
  artifactDirectory,
  evalsArtifactPath,
  loadProjectModules,
  readCaseManifest,
  toolsArtifactPath,
} from "./shared.mjs";

const invalidRepairPackage = {
  schemaVersion: 3,
  packageId: "biology-repair-check",
  revision: 1,
  title: "Biology Repair Check",
  metadata: {
    subject: "Biology",
    difficulty: "standard",
    locale: "en-US",
    shortLabel: "Biology",
  },
  presentation: { accent: "green", density: "comfortable" },
  resources: [],
  review: { mode: "answers" },
  rubrics: [],
  parts: [
    {
      id: "questions",
      title: "Questions",
      navigation: "free",
      defaultLayout: "single",
      tools: [],
      items: [
        {
          id: "cell-energy",
          domain: "Cell biology",
          stimulus: [],
          prompt: [{ type: "text", text: "Which organelle produces most cellular ATP?" }],
          interaction: {
            type: "single_choice",
            options: [{ id: "a", label: "Nucleus" }],
          },
          scoring: { type: "exact", answer: "b" },
        },
      ],
    },
  ],
};

function toolDefinitions(modules) {
  const never = async () => null;
  return [
    ...modules.practiceTools.createPracticeToolDefinitions({ installContent: never }),
    ...modules.learningTools.createLearningToolDefinitions({ readLearningSummary: never }),
    ...modules.assessmentTools.createAssessmentToolDefinitions(
      {
        installAssessment: never,
        readAssessmentAttempt: never,
        attachEvaluation: never,
        getCurrentAttemptId: () => undefined,
      },
      "authoring",
    ),
  ].map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema ?? null,
  }));
}

function installSuccess(caseId) {
  const exactCounts = {
    "gre-verbal": 10,
    "writing-rubric": 1,
    "validation-repair": 1,
  };
  const itemCount = exactCounts[caseId] ?? 4;
  return {
    ok: true,
    data: {
      packageId: `${caseId}-package`,
      revision: 1,
      title: `${caseId} package`,
      itemCount,
      installed: true,
    },
  };
}

function universalEval(definition, getAssessmentAuthoringKit) {
  const success = installSuccess(definition.id);
  return {
    name: definition.name,
    messages: [{ role: "user", type: "message", content: definition.prompt }],
    expectedCall: [
      {
        functionName: "get_assessment_authoring_kit",
        arguments: { template: definition.template },
        mockOutput: {
          ok: true,
          data: getAssessmentAuthoringKit(definition.template),
        },
      },
      {
        functionName: "install_assessment",
        arguments: { schemaVersion: 3 },
        result: { ok: true },
        mockOutput: success,
      },
    ],
  };
}

function ieltsEval(definition) {
  return {
    name: definition.name,
    messages: [{ role: "user", type: "message", content: definition.prompt }],
    expectedCall: [
      {
        functionName: "install_practice_set",
        arguments: { section: "reading" },
        result: { ok: true, data: { section: "reading", itemCount: 40 } },
        mockOutput: {
          ok: true,
          data: {
            contentKey: "agent-ielts-reading",
            section: "reading",
            name: "IELTS Reading Practice",
            schemaVersion: 1,
            source: "agent",
            itemCount: 40,
            active: true,
          },
        },
      },
    ],
  };
}

function unsupportedEval(definition, getAssessmentAuthoringKit) {
  return {
    name: definition.name,
    messages: [{ role: "user", type: "message", content: definition.prompt }],
    expectedCall: [
      {
        functionName: "get_assessment_authoring_kit",
        arguments: { template: definition.template },
        mockOutput: {
          ok: true,
          data: getAssessmentAuthoringKit(definition.template),
        },
      },
    ],
  };
}

function repairEval(definition) {
  return {
    name: definition.name,
    messages: [
      { role: "user", type: "message", content: definition.prompt },
      {
        role: "model",
        type: "functioncall",
        name: "install_assessment",
        arguments: invalidRepairPackage,
      },
      {
        role: "user",
        type: "functionresponse",
        name: "install_assessment",
        response: {
          ok: false,
          error: {
            code: "INVALID_ASSESSMENT",
            message: "The assessment does not satisfy the universal content contract.",
            retryable: true,
            issues: [
              {
                path: "parts.0.items.0.interaction.options",
                message:
                  "A single-choice interaction needs at least two options, and the scoring answer must name one of them.",
              },
            ],
          },
        },
      },
      {
        role: "user",
        type: "message",
        content: "Repair the returned issue path and retry the complete package now.",
      },
    ],
    expectedCall: [
      {
        functionName: "install_assessment",
        arguments: { schemaVersion: 3, packageId: "biology-repair-check" },
        result: { ok: true },
        mockOutput: installSuccess(definition.id),
      },
    ],
  };
}

function buildEval(definition, getAssessmentAuthoringKit) {
  if (definition.kind === "universal") {
    return universalEval(definition, getAssessmentAuthoringKit);
  }
  if (definition.kind === "ielts") return ieltsEval(definition);
  if (definition.kind === "unsupported") {
    return unsupportedEval(definition, getAssessmentAuthoringKit);
  }
  if (definition.kind === "repair") return repairEval(definition);
  throw new Error(`Unknown agent eval case kind: ${definition.kind}`);
}

export async function prepareAgentEvalArtifacts() {
  const [manifest, modules] = await Promise.all([readCaseManifest(), loadProjectModules()]);
  const tools = toolDefinitions(modules);
  const evals = manifest.cases.map((definition) =>
    buildEval(definition, modules.examples.getAssessmentAuthoringKit),
  );

  await mkdir(artifactDirectory, { recursive: true });
  await Promise.all([
    writeFile(toolsArtifactPath, `${JSON.stringify({ tools }, null, 2)}\n`),
    writeFile(evalsArtifactPath, `${JSON.stringify(evals, null, 2)}\n`),
  ]);
  return { manifest, tools, evals, modules };
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const { tools, evals } = await prepareAgentEvalArtifacts();
  console.log(
    `Prepared ${tools.length} production tool definitions and ${evals.length} agent eval cases.`,
  );
}
