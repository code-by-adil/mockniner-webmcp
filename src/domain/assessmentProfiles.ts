import type { AssessmentPackage } from "./assessment";

export const UNIVERSAL_INTERACTIONS = [
  "single_choice",
  "multiple_choice",
  "text_entry",
  "numeric_entry",
  "extended_text",
  "matching",
] as const;

export const UNIVERSAL_CONTENT_BLOCKS = [
  "text",
  "passage",
  "math",
  "table",
  "bar_chart",
] as const;

export const UNIVERSAL_SCORING_RULES = [
  "exact",
  "aliases",
  "set",
  "numeric",
  "mapping",
  "agent",
] as const;

export type AssessmentProfileDefinition = {
  id: AssessmentPackage["profileId"];
  title: string;
  description: string;
  packageKind: "universal";
  allowedInteractions: readonly (typeof UNIVERSAL_INTERACTIONS)[number][];
};

export const assessmentProfiles: Record<
  AssessmentPackage["profileId"],
  AssessmentProfileDefinition
> = {
  universal: {
    id: "universal",
    title: "Universal assessment",
    description:
      "Flexible objective and subjective assessment assembled from trusted interaction components.",
    packageKind: "universal",
    allowedInteractions: UNIVERSAL_INTERACTIONS,
  },
  "sat-practice": {
    id: "sat-practice",
    title: "SAT-style practice",
    description:
      "Original Reading and Writing and Math practice with two modules per section and local raw scoring.",
    packageKind: "universal",
    allowedInteractions: ["single_choice", "numeric_entry"],
  },
};

export function getAssessmentCapabilities() {
  return {
    schemaVersion: 2,
    profiles: Object.values(assessmentProfiles).map((profile) => ({
      id: profile.id,
      title: profile.title,
      description: profile.description,
      packageKind: profile.packageKind,
      allowedInteractions: profile.allowedInteractions,
    })),
    contentBlocks: UNIVERSAL_CONTENT_BLOCKS,
    interactions: UNIVERSAL_INTERACTIONS,
    scoringRules: UNIVERSAL_SCORING_RULES,
    limits: {
      maximumItemsPerPackage: 300,
      maximumItemsPerModule: 100,
      maximumSections: 20,
      maximumModulesPerSection: 20,
    },
    authoringGuidance: [
      "Use original content and stable lowercase IDs.",
      "Use single_choice for one answer, multiple_choice for unordered answer sets, numeric_entry for numeric answers, text_entry for short text, extended_text for agent-evaluated writing, and matching for prompt-to-option mappings.",
      "Every deterministic item must include its declarative scoring rule. Extended-text items must reference a declared evaluation rubric.",
      "SAT-style practice must contain ordered reading-writing and math sections with exactly two modules each. Results are practice accuracy and domain performance, not official SAT scores.",
    ],
  };
}
