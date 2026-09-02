import { parseAssessmentPackage } from "@/domain/assessment";

export const greStyleAssessment = parseAssessmentPackage({
  schemaVersion: 3,
  packageId: "example-gre-style-diagnostic",
  revision: 2,
  title: "GRE-Style Diagnostic",
  description: "An original mixed diagnostic for verbal reasoning, quantitative reasoning, and analytical writing.",
  source: "built-in",
  metadata: {
    subject: "Graduate admissions practice",
    difficulty: "mixed",
    locale: "en-US",
    shortLabel: "GRE-style",
    disclaimer:
      "Independent GRE-style practice. GRE is a registered trademark of ETS, which is not affiliated with or endorsing this application. Results are practice feedback, not an ETS score or percentile.",
  },
  presentation: { accent: "violet", density: "comfortable" },
  resources: [
    {
      id: "quantitative-reference",
      type: "document",
      title: "Quantitative reference",
      description: "General formulas available during the quantitative part.",
      content: [
        {
          type: "table",
          caption: "Common formulas",
          columns: ["Topic", "Formula"],
          rows: [
            ["Circle", "Area = pi x radius squared"],
            ["Rectangle", "Area = length x width"],
            ["Triangle", "Area = one half x base x height"],
            ["Average", "Sum of values divided by number of values"],
          ],
        },
      ],
    },
  ],
  review: { mode: "answers" },
  rubrics: [
    {
      id: "analytical-writing",
      title: "Analytical writing rubric",
      scale: { minimum: 0, maximum: 6, step: 1 },
      criteria: [
        {
          id: "reasoning",
          label: "Reasoning",
          description: "The response states a clear position and develops a sound line of reasoning.",
          weight: 0.34,
        },
        {
          id: "development",
          label: "Development",
          description: "The response supports its claims with relevant reasons and concrete examples.",
          weight: 0.33,
        },
        {
          id: "control",
          label: "Control of language",
          description: "The response is organized, precise, and readable, with errors that do not impede meaning.",
          weight: 0.33,
        },
      ],
      requireEvidence: true,
      allowAnnotations: true,
    },
  ],
  parts: [
    {
      id: "verbal-reasoning",
      groupTitle: "GRE-style diagnostic",
      title: "Verbal Reasoning",
      description: "Reading comprehension, text completion, and sentence equivalence.",
      durationSeconds: 12 * 60,
      navigation: "free",
      defaultLayout: "single",
      tools: [{ type: "mark_for_review" }, { type: "option_eliminator" }],
      items: [
        {
          id: "verbal-reading-main-point",
          domain: "Verbal Reasoning",
          skill: "Reading comprehension",
          stimulus: [
            {
              type: "passage",
              title: "Municipal weather journals",
              paragraphs: [
                "Many nineteenth-century towns kept daily weather journals, but historians long treated the records as too irregular for climate research. A recent project compared overlapping journals from neighboring towns and found that differences in instruments could be estimated when observers recorded the same storms. The adjusted records cannot replace modern measurements, yet they can reveal local drought and frost patterns decades before national weather services existed.",
              ],
            },
          ],
          prompt: [{ type: "text", text: "Which choice best states the main point of the passage?" }],
          interaction: {
            type: "single_choice",
            options: [
              { id: "a", label: "Early municipal weather journals are too inconsistent to support any historical research." },
              { id: "b", label: "Modern weather services should replace their instruments with those described in town journals." },
              { id: "c", label: "Comparing overlapping journals can make some early local weather records useful for climate research." },
              { id: "d", label: "Most nineteenth-century towns recorded storms but ignored droughts and frosts." },
            ],
          },
          scoring: { type: "exact", answer: "c" },
          presentation: { layout: "split", stimulusLabel: "Passage" },
        },
        {
          id: "verbal-text-completion",
          domain: "Verbal Reasoning",
          skill: "Text completion",
          stimulus: [],
          prompt: [
            {
              type: "text",
              text: "Because the survey sampled only weekday commuters, its findings were [Blank 1] for weekend travel. The report therefore adopted a [Blank 2] tone when discussing Saturday service.",
            },
          ],
          interaction: {
            type: "grouped_choice",
            groups: [
              {
                id: "blank-1",
                label: "Blank 1",
                options: [
                  { id: "blank-1-a", label: "conclusive" },
                  { id: "blank-1-b", label: "inconclusive" },
                  { id: "blank-1-c", label: "indispensable" },
                ],
              },
              {
                id: "blank-2",
                label: "Blank 2",
                options: [
                  { id: "blank-2-a", label: "cautious" },
                  { id: "blank-2-b", label: "celebratory" },
                  { id: "blank-2-c", label: "dismissive" },
                ],
              },
            ],
          },
          scoring: {
            type: "mapping",
            answers: { "blank-1": "blank-1-b", "blank-2": "blank-2-a" },
          },
        },
        {
          id: "verbal-sentence-equivalence",
          domain: "Verbal Reasoning",
          skill: "Sentence equivalence",
          stimulus: [],
          prompt: [
            {
              type: "text",
              text: "The biographer's account is deliberately ______. She presents the evidence for each disputed episode but refuses to decide which version is correct.",
            },
          ],
          interaction: {
            type: "multiple_choice",
            minimumSelections: 2,
            maximumSelections: 2,
            options: [
              { id: "a", label: "authoritative" },
              { id: "b", label: "noncommittal" },
              { id: "c", label: "exhaustive" },
              { id: "d", label: "equivocal" },
              { id: "e", label: "chronological" },
              { id: "f", label: "accusatory" },
            ],
          },
          scoring: { type: "set", answers: ["b", "d"] },
        },
      ],
    },
    {
      id: "quantitative-reasoning",
      groupTitle: "GRE-style diagnostic",
      title: "Quantitative Reasoning",
      description: "Quantitative comparison, multiple selection, numeric entry, and data interpretation.",
      durationSeconds: 14 * 60,
      navigation: "free",
      defaultLayout: "single",
      tools: [
        { type: "mark_for_review" },
        { type: "calculator" },
        { type: "reference_document", resourceId: "quantitative-reference" },
      ],
      items: [
        {
          id: "quant-comparison",
          domain: "Quantitative Reasoning",
          skill: "Quantitative comparison",
          stimulus: [
            {
              type: "math",
              expression: "x² = y² and x ≠ y\n\nQuantity A: x    Quantity B: y",
              accessibleLabel: "x squared equals y squared, and x does not equal y. Compare x with y.",
            },
          ],
          prompt: [{ type: "text", text: "Compare Quantity A and Quantity B." }],
          interaction: {
            type: "single_choice",
            options: [
              { id: "a", label: "Quantity A is greater." },
              { id: "b", label: "Quantity B is greater." },
              { id: "c", label: "The two quantities are equal." },
              { id: "d", label: "The relationship cannot be determined from the information given." },
            ],
          },
          scoring: { type: "exact", answer: "d" },
        },
        {
          id: "quant-multiple-selection",
          domain: "Quantitative Reasoning",
          skill: "Properties of integers",
          stimulus: [],
          prompt: [
            { type: "text", text: "Which expressions are even for every integer n? Select all that apply." },
          ],
          interaction: {
            type: "multiple_choice",
            minimumSelections: 2,
            maximumSelections: 2,
            options: [
              { id: "a", label: "n(n + 1)" },
              { id: "b", label: "2n + 4" },
              { id: "c", label: "n² + n + 1" },
              { id: "d", label: "3n + 1" },
            ],
          },
          scoring: { type: "set", answers: ["a", "b"] },
        },
        {
          id: "quant-numeric-entry",
          domain: "Quantitative Reasoning",
          skill: "Rates",
          stimulus: [],
          prompt: [
            {
              type: "text",
              text: "Three identical printers produce 450 pages in 5 minutes. At the same constant rate, how many pages will five printers produce in 12 minutes?",
            },
          ],
          interaction: { type: "numeric_entry", placeholder: "Enter a number" },
          scoring: { type: "numeric", answer: 1800 },
        },
        {
          id: "quant-data-interpretation",
          domain: "Quantitative Reasoning",
          skill: "Data interpretation",
          stimulus: [
            {
              type: "table",
              caption: "Average weekday riders, in thousands",
              columns: ["Route", "2024", "2025"],
              rows: [
                ["Harbor", "40", "50"],
                ["Market", "60", "69"],
                ["University", "30", "42"],
              ],
            },
          ],
          prompt: [{ type: "text", text: "Which route had the greatest percentage increase from 2024 to 2025?" }],
          interaction: {
            type: "single_choice",
            options: [
              { id: "a", label: "Harbor" },
              { id: "b", label: "Market" },
              { id: "c", label: "University" },
              { id: "d", label: "All three had the same percentage increase." },
            ],
          },
          scoring: { type: "exact", answer: "c" },
          presentation: { layout: "split", stimulusLabel: "Data" },
        },
      ],
    },
    {
      id: "analytical-writing",
      groupTitle: "GRE-style diagnostic",
      title: "Analytical Writing",
      description: "Develop and support a position on the issue below.",
      durationSeconds: 30 * 60,
      navigation: "linear",
      defaultLayout: "single",
      tools: [],
      items: [
        {
          id: "analytical-writing-issue",
          domain: "Analytical Writing",
          skill: "Issue analysis",
          stimulus: [],
          prompt: [
            {
              type: "text",
              variant: "title",
              text: "Public institutions should publish the evidence behind major policy decisions before those decisions take effect.",
            },
            {
              type: "text",
              variant: "muted",
              text: "Write a response in which you discuss how much you agree or disagree. Explain your position and address circumstances that might strengthen or weaken it.",
            },
          ],
          interaction: {
            type: "extended_text",
            minimumWords: 250,
            maximumWords: 1_500,
            placeholder: "Write your response",
          },
          scoring: { type: "agent" },
          evaluationRubricId: "analytical-writing",
        },
      ],
    },
  ],
});
