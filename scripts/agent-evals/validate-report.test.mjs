import { describe, expect, it } from "vitest";
import { officialGreScoreClaims, validateUniversalSemantics } from "./validate-report.mjs";

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
    rubrics: [],
    parts: [{ tools: [], items }],
  };
}

describe("agent evaluation semantic gate", () => {
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
    writing.rubrics = [{ criteria: [{}, {}, {}, {}] }];
    const writingIssues = [];
    validateUniversalSemantics("writing-rubric", writing, writingIssues);
    expect(writingIssues).toEqual([]);
  });
});
