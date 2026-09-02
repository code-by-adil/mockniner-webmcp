import {
  getAssessmentAuthoringGuide,
  parseAssessmentPackage,
  type AssessmentAuthoringPackage,
  type AssessmentAuthoringTemplateId,
  type AssessmentPackage,
} from "@/domain/assessment";
import { greStyleAssessment } from "./gre";
import { satPracticeAssessment } from "./sat";

const minimalObjectiveAssessment = parseAssessmentPackage({
  schemaVersion: 3,
  packageId: "example-minimal-objective",
  revision: 1,
  title: "General Knowledge Check",
  source: "built-in",
  description: "A small example showing the minimum useful objective assessment package.",
  metadata: { subject: "General knowledge", difficulty: "standard", locale: "en-US", shortLabel: "Quiz" },
  presentation: { accent: "blue", density: "comfortable" },
  resources: [],
  review: { mode: "answers" },
  rubrics: [],
  parts: [
    {
      id: "questions",
      title: "Questions",
      navigation: "free",
      defaultLayout: "single",
      tools: [{ type: "mark_for_review" }],
      items: [
        {
          id: "water-formula",
          domain: "Science",
          stimulus: [],
          prompt: [{ type: "text", text: "What is the chemical formula for water?" }],
          interaction: {
            type: "single_choice",
            options: [
              { id: "a", label: "CO2" },
              { id: "b", label: "H2O" },
              { id: "c", label: "O2" },
            ],
          },
          scoring: { type: "exact", answer: "b" },
        },
        {
          id: "half-of-seven",
          domain: "Mathematics",
          stimulus: [],
          prompt: [{ type: "text", text: "What is one half of 7?" }],
          interaction: { type: "numeric_entry", placeholder: "Enter a decimal or fraction" },
          scoring: { type: "numeric", answer: 3.5 },
        },
      ],
    },
  ],
});

const writingWithRubricAssessment = parseAssessmentPackage({
  schemaVersion: 3,
  packageId: "example-writing-with-rubric",
  revision: 1,
  title: "Public Policy Essay",
  source: "built-in",
  description: "One extended response followed by structured agent evaluation.",
  metadata: {
    subject: "Argument writing",
    difficulty: "standard",
    locale: "en-US",
    shortLabel: "Writing",
    disclaimer: "Practice feedback is advisory and does not represent an official examination score.",
  },
  presentation: { accent: "green", density: "comfortable" },
  resources: [],
  review: { mode: "responses" },
  rubrics: [
    {
      id: "argument-writing",
      title: "Argument writing rubric",
      scale: { minimum: 0, maximum: 4, step: 1 },
      criteria: [
        {
          id: "claim",
          label: "Claim and reasoning",
          description: "The response states a clear position and supports it with sound reasoning.",
          weight: 0.5,
        },
        {
          id: "evidence",
          label: "Evidence and explanation",
          description: "The response uses relevant examples and explains how they support the position.",
          weight: 0.5,
        },
      ],
      requireEvidence: true,
      allowAnnotations: true,
    },
  ],
  parts: [
    {
      id: "essay",
      title: "Essay",
      description: "Write one focused argument.",
      durationSeconds: 30 * 60,
      navigation: "linear",
      defaultLayout: "single",
      tools: [],
      items: [
        {
          id: "public-library-essay",
          domain: "Argument writing",
          stimulus: [],
          prompt: [
            {
              type: "text",
              text: "Should public libraries stop charging overdue fines? Develop a position and support it with reasons and examples.",
            },
          ],
          interaction: {
            type: "extended_text",
            minimumWords: 200,
            maximumWords: 1_200,
            placeholder: "Write your response",
          },
          scoring: { type: "agent" },
          evaluationRubricId: "argument-writing",
        },
      ],
    },
  ],
});

const examples = {
  "minimal-objective": minimalObjectiveAssessment,
  "writing-with-rubric": writingWithRubricAssessment,
  "sat-style": satPracticeAssessment,
  "gre-style": greStyleAssessment,
} satisfies Record<AssessmentAuthoringTemplateId, AssessmentPackage>;

export type AssessmentAuthoringKit = ReturnType<typeof getAssessmentAuthoringGuide> & {
  examplePackage: AssessmentAuthoringPackage;
  nextAction: string;
};

export function getAssessmentAuthoringKit(
  templateId: AssessmentAuthoringTemplateId,
): AssessmentAuthoringKit {
  const { source: _source, ...examplePackage } = examples[templateId];
  return {
    ...structuredClone(getAssessmentAuthoringGuide(templateId)),
    examplePackage: structuredClone(examplePackage),
    nextAction: "Edit examplePackage, then pass the complete object to install_assessment.",
  };
}
