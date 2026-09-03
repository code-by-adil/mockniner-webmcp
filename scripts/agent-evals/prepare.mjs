import { mkdir, writeFile } from "node:fs/promises";
import {
  artifactDirectory,
  evalsArtifactPath,
  loadProjectModules,
  readCaseManifest,
  smokeEvalsArtifactPath,
  toolsArtifactPath,
} from "./shared.mjs";

function invalidRepairPackage(examplePackage) {
  return {
    ...examplePackage,
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
}

function evaluationToolSchemas(modules) {
  const never = async () => null;
  return modules.homeTools
    .createHomeToolDefinitions({
      installContent: never,
      installAssessment: never,
      readLearningSummary: never,
      readListeningAudio: never,
    })
    .map((tool) => ({
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
  const kit = getAssessmentAuthoringKit(definition.template);
  return {
    name: definition.name,
    messages: [{ role: "user", type: "message", content: definition.prompt }],
    expectedCall: [
      {
        functionName: "get_assessment_authoring_kit",
        arguments: { template: definition.template },
        result: { ok: true },
        mockOutput: {
          ok: true,
          data: kit,
        },
      },
      {
        functionName: "install_assessment",
        arguments: { schemaVersion: kit.examplePackage.schemaVersion },
        result: { ok: true },
        mockOutput: success,
      },
    ],
  };
}

function ieltsEval(definition, getIeltsAuthoringKit) {
  return {
    name: definition.name,
    messages: [{ role: "user", type: "message", content: definition.prompt }],
    expectedCall: [
      {
        functionName: "get_ielts_authoring_kit",
        arguments: { section: definition.section },
        result: { ok: true },
        mockOutput: {
          ok: true,
          data: getIeltsAuthoringKit(definition.section),
        },
      },
      {
        functionName: "install_ielts_practice_set",
        arguments: { section: definition.section },
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
        result: { ok: true },
        mockOutput: {
          ok: true,
          data: getAssessmentAuthoringKit(definition.template),
        },
      },
    ],
  };
}

function repairEval(definition, getAssessmentAuthoringKit) {
  const invalidPackage = invalidRepairPackage(getAssessmentAuthoringKit("minimal-objective").examplePackage);
  return {
    name: definition.name,
    messages: [
      { role: "user", type: "message", content: definition.prompt },
      {
        role: "model",
        type: "functioncall",
        name: "install_assessment",
        arguments: invalidPackage,
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
        arguments: { schemaVersion: invalidPackage.schemaVersion, packageId: invalidPackage.packageId },
        result: { ok: true },
        mockOutput: installSuccess(definition.id),
      },
    ],
  };
}

function buildEval(definition, getAssessmentAuthoringKit, getIeltsAuthoringKit) {
  if (definition.kind === "universal") {
    return universalEval(definition, getAssessmentAuthoringKit);
  }
  if (definition.kind === "ielts") {
    return ieltsEval(definition, getIeltsAuthoringKit);
  }
  if (definition.kind === "unsupported") {
    return unsupportedEval(definition, getAssessmentAuthoringKit);
  }
  if (definition.kind === "repair") return repairEval(definition, getAssessmentAuthoringKit);
  throw new Error(`Unknown agent eval case kind: ${definition.kind}`);
}

function browserSmokeEvals(modules) {
  const assessmentPackage = structuredClone(
    modules.examples.getAssessmentAuthoringKit("minimal-objective").examplePackage,
  );
  assessmentPackage.packageId = "browser-smoke-assessment";
  assessmentPackage.title = "Browser smoke assessment";
  const writingDocument = {
    ...structuredClone(modules.writing.writingDocument),
    contentKey: "browser-smoke-writing",
    name: "Browser smoke Writing practice",
  };

  return [
    {
      name: "Authoring tools install universal and IELTS practice",
      messages: [
        {
          role: "user",
          type: "message",
          content: "Install universal and IELTS Writing practice through the authoring tools.",
        },
      ],
      expectedCall: [
        {
          functionName: "get_ielts_learning_summary",
          arguments: { recentLimit: 1 },
        },
        {
          functionName: "get_ielts_authoring_kit",
          arguments: { section: "writing" },
        },
        {
          functionName: "get_assessment_authoring_kit",
          arguments: { template: "minimal-objective" },
        },
        {
          functionName: "install_assessment",
          arguments: assessmentPackage,
          result: { ok: true, data: { packageId: assessmentPackage.packageId, revision: 1, installed: true } },
        },
        {
          functionName: "install_ielts_practice_set",
          arguments: writingDocument,
          result: { ok: true, data: { contentKey: writingDocument.contentKey, section: "writing", active: true } },
        },
      ],
    },
    {
      name: "Installed practice survives a page reload",
      messages: [{ role: "user", type: "message", content: "Read back the practice saved by the authoring journey." }],
      expectedCall: [
        {
          functionName: "get_assessment_content",
          arguments: { packageId: assessmentPackage.packageId },
          result: { ok: true, data: { package: assessmentPackage, source: "agent", revision: 1, scope: { completePackage: true } } },
        },
        {
          functionName: "get_practice_library",
          arguments: { kind: "writing" },
          result: { ok: true, data: { items: [
            { contentKey: modules.writing.writingDocument.contentKey, active: false },
            { contentKey: writingDocument.contentKey, title: writingDocument.name, itemCount: 2, active: true },
          ], nextOffset: null, unavailableContentKeys: [] } },
        },
      ],
    },
  ];
}

export async function buildAgentEvalArtifacts() {
  const [manifest, modules] = await Promise.all([readCaseManifest(), loadProjectModules()]);
  const tools = evaluationToolSchemas(modules);
  const evals = manifest.cases.map((definition) =>
    buildEval(
      definition,
      modules.examples.getAssessmentAuthoringKit,
      modules.ieltsAuthoring.getIeltsAuthoringKit,
    ),
  );
  const smokeEvals = browserSmokeEvals(modules);

  return { manifest, tools, evals, smokeEvals, modules };
}

export async function prepareAgentEvalArtifacts() {
  const artifacts = await buildAgentEvalArtifacts();
  const { tools, evals, smokeEvals } = artifacts;
  await mkdir(artifactDirectory, { recursive: true });
  await Promise.all([
    writeFile(toolsArtifactPath, `${JSON.stringify({ tools }, null, 2)}\n`),
    writeFile(evalsArtifactPath, `${JSON.stringify(evals, null, 2)}\n`),
    writeFile(smokeEvalsArtifactPath, `${JSON.stringify(smokeEvals, null, 2)}\n`),
  ]);
  return artifacts;
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const { tools, evals, smokeEvals } = await prepareAgentEvalArtifacts();
  console.log(
    `Prepared ${tools.length} production tool definitions, ${evals.length} agent eval cases, and ${smokeEvals.length} browser smoke journey.`,
  );
}
