const ASSESSMENT_CONTENT_BLOCKS = ["text", "passage", "math", "table", "bar_chart"] as const;
const ASSESSMENT_INTERACTIONS = [
  "single_choice",
  "multiple_choice",
  "text_entry",
  "numeric_entry",
  "extended_text",
  "matching",
  "grouped_choice",
] as const;
const ASSESSMENT_SCORING_RULES = ["exact", "aliases", "set", "numeric", "mapping", "agent"] as const;
const ASSESSMENT_TOOLS = [
  "mark_for_review", "option_eliminator", "calculator", "reference_document",
] as const;

export const ASSESSMENT_AUTHORING_TEMPLATE_IDS = [
  "minimal-objective",
  "writing-with-rubric",
  "sat-style",
  "gre-style",
] as const;
export type AssessmentAuthoringTemplateId = typeof ASSESSMENT_AUTHORING_TEMPLATE_IDS[number];

type AssessmentCoverage = {
  supported: string[];
  limited: Array<{ capability: string; note: string }>;
  unsupported: Array<{ capability: string; note: string }>;
};

type AssessmentAuthoringTemplate = {
  id: AssessmentAuthoringTemplateId;
  title: string;
  useWhen: string;
  coverage: AssessmentCoverage;
};

const ASSESSMENT_AUTHORING_TEMPLATES: readonly AssessmentAuthoringTemplate[] = [
  {
    id: "minimal-objective",
    title: "Minimal objective assessment",
    useWhen: "Use for quizzes, diagnostics, and other assessments that need only objective questions.",
    coverage: {
      supported: ["single choice", "numeric entry", "free navigation", "answer review"],
      limited: [],
      unsupported: [],
    },
  },
  {
    id: "writing-with-rubric",
    title: "Writing assessment with a rubric",
    useWhen: "Use for essays and other extended responses that an agent will evaluate after submission.",
    coverage: {
      supported: ["extended response", "one shared rubric", "evidence", "annotations", "response review"],
      limited: [],
      unsupported: [],
    },
  },
  {
    id: "sat-style",
    title: "SAT-style diagnostic",
    useWhen: "Use for original SAT-style Reading and Writing and Math practice.",
    coverage: {
      supported: ["timed parts", "passage questions", "single choice", "numeric entry", "calculator", "reference document"],
      limited: [
        {
          capability: "score reporting",
          note: "Results report practice accuracy and domain totals, not a College Board score.",
        },
      ],
      unsupported: [
        {
          capability: "adaptive routing",
          note: "The package runs its declared parts in a fixed order.",
        },
      ],
    },
  },
  {
    id: "gre-style",
    title: "GRE-style diagnostic",
    useWhen: "Use for original GRE-style Verbal Reasoning, Quantitative Reasoning, and analytical writing practice.",
    coverage: {
      supported: [
        "reading comprehension",
        "text completion with independent choice groups",
        "sentence equivalence",
        "quantitative comparison",
        "single and multiple choice",
        "numeric entry",
        "data interpretation",
        "calculator",
        "analytical writing",
      ],
      limited: [
        {
          capability: "figures",
          note: "The engine renders text, math, tables, and bar charts. It does not render arbitrary diagrams.",
        },
        {
          capability: "score reporting",
          note: "Results report practice accuracy and rubric feedback, not an ETS score or percentile.",
        },
      ],
      unsupported: [
        {
          capability: "select in passage",
          note: "Passage sentences cannot act as response targets.",
        },
        {
          capability: "adaptive routing",
          note: "The package runs its declared parts in a fixed order.",
        },
      ],
    },
  },
];

export function getAssessmentAuthoringGuide(templateId: AssessmentAuthoringTemplateId) {
  const template = ASSESSMENT_AUTHORING_TEMPLATES.find((candidate) => candidate.id === templateId)!;
  return {
    contractVersion: 3,
    template,
    mentalModel: {
      package: "One complete assessment installed in a single call.",
      part: "A timed navigation boundary. Finishing a part locks it.",
      item: "One prompt, one response interaction, and one scoring rule.",
      resource: "Candidate-visible reference content opened from a tool declared on a part.",
    },
    capabilities: {
      contentBlocks: ASSESSMENT_CONTENT_BLOCKS,
      interactions: ASSESSMENT_INTERACTIONS,
      scoringRules: ASSESSMENT_SCORING_RULES,
      layouts: ["single", "split"],
      navigationModes: ["free", "linear"],
      tools: ASSESSMENT_TOOLS,
      accents: ["red", "blue", "green", "violet"],
      reviewModes: ["answers", "responses", "none"],
    },
    scoringByInteraction: {
      single_choice: "Use exact with one option ID.",
      multiple_choice: "Use set with every correct option ID. The order does not matter and scoring is all or nothing.",
      text_entry: "Use exact, aliases, or agent. Agent scoring requires the package rubric.",
      numeric_entry: "Use numeric with the correct number and an optional tolerance.",
      extended_text: "Use agent and reference the package rubric with evaluationRubricId.",
      matching: "Use mapping with one answer for every prompt ID.",
      grouped_choice: "Use mapping with one answer from each group's own options. Keep option IDs unique across the item. Scoring is all or nothing.",
    },
    limits: {
      maximumItemsPerPackage: 300,
      maximumItemsPerPart: 100,
      maximumParts: 50,
      maximumResources: 20,
    },
    instructions: [
      "Copy the example package, then replace its ID, title, content, options, answers, and rubric details.",
      "Keep schemaVersion 3. Omit source because the application records agent authorship itself.",
      "Use stable lowercase IDs made from letters, numbers, periods, underscores, or hyphens. Item IDs must be unique across the package.",
      "Declare only the tools the learner needs. An empty tools array is valid.",
      "Use split layout only when an item has stimulus content. Put labels such as Passage or Source in presentation.stimulusLabel.",
      "Give every objective item a deterministic scoring rule. Agent-scored items must share one declared rubric.",
      "Use original or redistributable content. Exam names may describe a style, but results must not claim official scoring.",
      "Pass the edited package directly to install_assessment. If validation fails, repair the returned paths and retry with the full package.",
    ],
  };
}
