import { describe, expect, it } from "vitest";
import { evaluateAuthoringCalls, officialGreScoreClaims, validateRun, validateUniversalSemantics } from "./validate-report.mjs";
import { readFinalResponseText } from "./shared.mjs";

function objectiveItem(id, stimulus = []) {
  return {
    id,
    stimulus,
    prompt: [{ type: "text", text: "Question" }],
    interaction: {
      type: "single_choice",
      options: [
        { id: "a", label: "A" },
        { id: "b", label: "B" },
      ],
    },
    scoring: { type: "exact", answer: "a" },
  };
}

function groupedItem(id) {
  return {
    ...objectiveItem(id),
    interaction: {
      type: "grouped_choice",
      groups: [1, 2, 3].map((number) => ({
        id: `blank-${number}`,
        label: `Blank ${number}`,
        options: [
          { id: `${number}-a`, label: "A" },
          { id: `${number}-b`, label: "B" },
        ],
      })),
    },
    scoring: {
      type: "mapping",
      answers: { "blank-1": "1-a", "blank-2": "2-a", "blank-3": "3-a" },
    },
  };
}

function assessment(items) {
  return {
    title: "Practice diagnostic",
    resources: [],
    parts: [{ tools: [], items }],
  };
}

describe("agent evaluation semantic gate", () => {
  const expected = [
    { functionName: "get_assessment_authoring_kit", arguments: { template: "minimal-objective" }, result: { ok: true } },
    { functionName: "install_assessment", result: { ok: true } },
  ];
  const requiredCalls = [
    { functionName: "get_assessment_authoring_kit", args: { template: "minimal-objective" }, result: { ok: true } },
    { functionName: "install_assessment", args: {}, result: { ok: true } },
  ];

  it("allows repeated read-only discovery before, between and after authoring calls", () => {
    const context = { functionName: "get_practice_context", args: {}, result: { ok: true } };
    const calls = [context, requiredCalls[0], context, requiredCalls[1], context];
    expect(evaluateAuthoringCalls(expected, calls).every(entry => entry.outcome === "pass")).toBe(true);
    const definition = { id: "biology-minimal", name: "biology", kind: "universal" };
    // The upstream exact matcher marks this valid trajectory as failed.
    const report = calls.map(response => ({ test: { name: definition.name }, response, outcome: "fail" }));
    const modules = { assessment: { parseAssessmentAuthoringPackage: () => assessment([objectiveItem("biology")]) } };
    expect(validateRun(definition, 1, report, modules, expected).passed).toBe(true);
  });

  it("still rejects wrong order, wrong kit, wrong-family writes, extra mutations and failed writes", () => {
    const trajectories = [
      [...requiredCalls].reverse(),
      [{ ...requiredCalls[0], args: { template: "gre-style" } }, requiredCalls[1]],
      [requiredCalls[0], { ...requiredCalls[1], functionName: "install_ielts_practice_set" }],
      [...requiredCalls, { functionName: "open_practice", args: { action: "start" }, result: { ok: true } }],
      [requiredCalls[0], { ...requiredCalls[1], result: { ok: false, error: { code: "INVALID_ASSESSMENT" } } }],
    ];
    for (const calls of trajectories) {
      expect(evaluateAuthoringCalls(expected, calls).some(entry => entry.outcome !== "pass")).toBe(true);
    }
  });

  it("cannot pass an invalid package because its tool result claims success", () => {
    const definition = { id: "biology-minimal", name: "biology", kind: "universal" };
    const report = requiredCalls.map(response => ({ test: { name: definition.name }, response, outcome: "pass" }));
    const modules = { assessment: { parseAssessmentAuthoringPackage: () => { throw new Error("Invalid package"); } } };
    expect(validateRun(definition, 1, report, modules, expected)).toMatchObject({ passed: false,
      issues: [expect.stringContaining("Invalid package")] });
  });

  it("checks only the final user-visible response for unsupported-capability explanations", () => {
    const definition = { id: "unsupported-passage-selection", name: "unsupported", kind: "unsupported" };
    const entry = { test: { name: definition.name }, response: requiredCalls[0], outcome: "pass", trajectory: [
      { text: "Passage sentence selection is unsupported.", reasoningText: "It cannot do that." },
      { text: "Your assessment is ready." },
    ] };
    expect(readFinalResponseText([entry], definition.name, 1)).toBe("Your assessment is ready.");
    expect(validateRun(definition, 1, [entry], {}, [expected[0]]).passed).toBe(false);
    entry.trajectory = [{ reasoningText: "Passage sentence selection is unsupported.", text: "Your assessment is ready." }];
    expect(validateRun(definition, 1, [entry], {}, [expected[0]]).passed).toBe(false);
    entry.trajectory = [{ text: "Selecting a sentence inside a passage is not supported." }];
    expect(validateRun(definition, 1, [entry], {}, [expected[0]]).passed).toBe(true);
    entry.trajectory[0].toolCalls = [{}];
    expect(readFinalResponseText([entry], definition.name, 1)).toBe("");
  });

  it("accepts the requested ten-item GRE verbal structure", () => {
    const candidate = assessment([
      objectiveItem("reading", [{ type: "passage", paragraphs: ["Original passage."] }]),
      groupedItem("completion-1"),
      groupedItem("completion-2"),
      ...Array.from({ length: 7 }, (_, index) => objectiveItem(`question-${index + 4}`)),
    ]);
    const issues = [];
    validateUniversalSemantics("gre-verbal", candidate, issues);
    expect(issues).toEqual([]);
  });

  it("reports prompt-specific omissions that the generic schema cannot express", () => {
    const candidate = assessment([groupedItem("only-completion")]);
    const issues = [];
    validateUniversalSemantics("gre-verbal", candidate, issues);
    expect(issues).toEqual(
      expect.arrayContaining([
        "expected 10 items, received 1",
        "expected one passage, received 0",
        "expected 2 grouped-choice Text Completion items, received 1",
      ]),
    );
  });

  it("rejects positive official-score claims but permits an explicit disclaimer", () => {
    expect(officialGreScoreClaims({ description: "This gives an official GRE score." })).toEqual([
      "This gives an official GRE score.",
    ]);
    expect(
      officialGreScoreClaims({ disclaimer: "This is practice and is not an official GRE score." }),
    ).toEqual([]);
  });

  it("enforces the no-tools biology request and four-criterion writing rubric", () => {
    const biology = assessment([objectiveItem("biology")]);
    biology.resources.push({ id: "reference" });
    biology.parts[0].tools.push({ type: "calculator" });
    const biologyIssues = [];
    validateUniversalSemantics("biology-minimal", biology, biologyIssues);
    expect(biologyIssues).toEqual([
      "biology quiz declares a resource",
      "biology quiz declares a calculator",
    ]);

    const writing = assessment([
      {
        ...objectiveItem("essay"),
        interaction: { type: "extended_text" },
        scoring: { type: "agent" },
      },
    ]);
    writing.rubric = { criteria: [{}, {}, {}, {}] };
    const writingIssues = [];
    validateUniversalSemantics("writing-rubric", writing, writingIssues);
    expect(writingIssues).toEqual([]);
  });
});
