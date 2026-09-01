import { z } from "zod";

// Declarative assessment package and evaluation contracts.

const identifierSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9][a-z0-9._-]*$/);
const shortTextSchema = z.string().trim().min(1).max(500);
const bodyTextSchema = z.string().trim().min(1).max(20_000);
const optionSchema = z.strictObject({
  id: identifierSchema,
  label: bodyTextSchema,
});

export const assessmentContentBlockSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("text"),
    text: bodyTextSchema,
    variant: z.enum(["title", "subtitle", "body", "muted"]).optional(),
  }),
  z.strictObject({
    type: z.literal("passage"),
    title: shortTextSchema.optional(),
    paragraphs: z.array(bodyTextSchema).min(1).max(30),
  }),
  z.strictObject({
    type: z.literal("math"),
    expression: shortTextSchema,
    accessibleLabel: shortTextSchema.optional(),
  }),
  z.strictObject({
    type: z.literal("table"),
    caption: shortTextSchema.optional(),
    columns: z.array(shortTextSchema).min(1).max(12),
    rows: z.array(z.array(shortTextSchema).min(1).max(12)).min(1).max(50),
  }),
  z.strictObject({
    type: z.literal("bar_chart"),
    title: shortTextSchema,
    unit: shortTextSchema.optional(),
    bars: z.array(z.strictObject({
      label: shortTextSchema,
      value: z.number().finite(),
    })).min(1).max(20),
  }),
]);

export const assessmentInteractionSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("single_choice"),
    options: z.array(optionSchema).min(2).max(12),
  }),
  z.strictObject({
    type: z.literal("multiple_choice"),
    options: z.array(optionSchema).min(2).max(20),
    minimumSelections: z.number().int().positive().max(20).optional(),
    maximumSelections: z.number().int().positive().max(20).optional(),
  }),
  z.strictObject({
    type: z.literal("text_entry"),
    placeholder: shortTextSchema.optional(),
    maximumCharacters: z.number().int().positive().max(4_000).optional(),
  }),
  z.strictObject({
    type: z.literal("numeric_entry"),
    placeholder: shortTextSchema.optional(),
  }),
  z.strictObject({
    type: z.literal("extended_text"),
    placeholder: shortTextSchema.optional(),
    minimumWords: z.number().int().nonnegative().max(20_000).optional(),
    maximumWords: z.number().int().positive().max(20_000).optional(),
  }),
  z.strictObject({
    type: z.literal("matching"),
    prompts: z.array(z.strictObject({
      id: identifierSchema,
      label: bodyTextSchema,
    })).min(1).max(30),
    options: z.array(optionSchema).min(2).max(30),
  }),
]);

const scoringRuleSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("exact"), answer: shortTextSchema }),
  z.strictObject({
    type: z.literal("aliases"),
    answers: z.array(shortTextSchema).min(1).max(20),
    ignorePunctuation: z.boolean().optional(),
  }),
  z.strictObject({
    type: z.literal("set"),
    answers: z.array(identifierSchema).min(1).max(20),
  }),
  z.strictObject({
    type: z.literal("numeric"),
    answer: z.number().finite(),
    tolerance: z.number().nonnegative().finite().optional(),
  }),
  z.strictObject({
    type: z.literal("mapping"),
    answers: z.record(identifierSchema, identifierSchema),
  }),
  z.strictObject({ type: z.literal("agent") }),
]);

const rubricCriterionSchema = z.strictObject({
  id: identifierSchema,
  label: shortTextSchema,
  description: bodyTextSchema,
  weight: z.number().positive().max(1).optional(),
});

export const assessmentRubricSchema = z.strictObject({
  id: identifierSchema,
  title: shortTextSchema,
  scale: z.strictObject({
    minimum: z.number().finite(),
    maximum: z.number().finite(),
    step: z.number().positive().finite(),
  }),
  criteria: z.array(rubricCriterionSchema).min(1).max(20),
  requireEvidence: z.boolean().default(true),
  allowAnnotations: z.boolean().default(true),
});

export const assessmentItemSchema = z.strictObject({
  id: identifierSchema,
  domain: shortTextSchema.optional(),
  skill: shortTextSchema.optional(),
  stimulus: z.array(assessmentContentBlockSchema).max(20).default([]),
  prompt: z.array(assessmentContentBlockSchema).min(1).max(20),
  interaction: assessmentInteractionSchema,
  scoring: scoringRuleSchema,
  evaluationRubricId: identifierSchema.optional(),
});

const assessmentModuleSchema = z.strictObject({
  id: identifierSchema,
  title: shortTextSchema,
  durationSeconds: z.number().int().positive().max(14_400).optional(),
  items: z.array(assessmentItemSchema).min(1).max(100),
});

const assessmentSectionSchema = z.strictObject({
  id: identifierSchema,
  title: shortTextSchema,
  description: bodyTextSchema.optional(),
  modules: z.array(assessmentModuleSchema).min(1).max(20),
});

export const assessmentPackageSchema = z.strictObject({
  schemaVersion: z.literal(2),
  packageId: identifierSchema,
  revision: z.number().int().positive().max(10_000),
  profileId: z.enum(["universal", "sat-practice"]),
  title: shortTextSchema,
  description: bodyTextSchema.optional(),
  source: z.enum(["built-in", "agent"]).optional(),
  metadata: z.strictObject({
    subject: shortTextSchema.optional(),
    difficulty: z.enum(["foundation", "standard", "advanced", "mixed"]).optional(),
    locale: z.string().trim().min(2).max(20).optional(),
    disclaimer: bodyTextSchema.optional(),
  }).optional(),
  sections: z.array(assessmentSectionSchema).min(1).max(20),
  rubrics: z.array(assessmentRubricSchema).max(20).default([]),
}).superRefine((assessment, context) => {
  const sectionIds = assessment.sections.map((section) => section.id);
  addDuplicateIssues(sectionIds, ["sections"], "Section IDs", context);

  const moduleIds: string[] = [];
  const itemIds: string[] = [];
  const agentRubricIds = new Set<string>();
  const rubricIds = assessment.rubrics.map((rubric) => rubric.id);
  const rubricIdSet = new Set(rubricIds);
  addDuplicateIssues(rubricIds, ["rubrics"], "Rubric IDs", context);

  assessment.rubrics.forEach((rubric, rubricIndex) => {
    const criterionIds = rubric.criteria.map((criterion) => criterion.id);
    addDuplicateIssues(
      criterionIds,
      ["rubrics", rubricIndex, "criteria"],
      "Criterion IDs",
      context,
    );
    if (rubric.scale.maximum <= rubric.scale.minimum) {
      context.addIssue({
        code: "custom",
        path: ["rubrics", rubricIndex, "scale"],
        message: "The rubric maximum must be greater than its minimum.",
      });
    } else {
      const steps = (rubric.scale.maximum - rubric.scale.minimum) / rubric.scale.step;
      if (Math.abs(steps - Math.round(steps)) > 1e-8) {
        context.addIssue({
          code: "custom",
          path: ["rubrics", rubricIndex, "scale", "step"],
          message: "The rubric step must divide the scale range exactly.",
        });
      }
    }
    const weights = rubric.criteria.map((criterion) => criterion.weight);
    const suppliedWeights = weights.filter((weight): weight is number => weight !== undefined);
    if (suppliedWeights.length > 0 && suppliedWeights.length !== weights.length) {
      context.addIssue({
        code: "custom",
        path: ["rubrics", rubricIndex, "criteria"],
        message: "Rubric criterion weights must be supplied for every criterion or omitted for all.",
      });
    } else if (
      suppliedWeights.length === weights.length &&
      suppliedWeights.length > 0 &&
      Math.abs(suppliedWeights.reduce((sum, weight) => sum + weight, 0) - 1) > 1e-8
    ) {
      context.addIssue({
        code: "custom",
        path: ["rubrics", rubricIndex, "criteria"],
        message: "Rubric criterion weights must sum to 1.",
      });
    }
  });

  assessment.sections.forEach((section, sectionIndex) => {
    section.modules.forEach((module, moduleIndex) => {
      moduleIds.push(module.id);
      module.items.forEach((item, itemIndex) => {
        itemIds.push(item.id);
        if (item.scoring.type === "agent" && item.evaluationRubricId) {
          agentRubricIds.add(item.evaluationRubricId);
        }
        const path = ["sections", sectionIndex, "modules", moduleIndex, "items", itemIndex];
        validateItemContract(item, path, rubricIdSet, context);
      });
    });
  });
  addDuplicateIssues(moduleIds, ["sections"], "Module IDs", context);
  addDuplicateIssues(itemIds, ["sections"], "Item IDs", context);

  if (itemIds.length > 300) {
    context.addIssue({
      code: "custom",
      path: ["sections"],
      message: "An assessment package cannot contain more than 300 items.",
    });
  }

  if (agentRubricIds.size > 1) {
    context.addIssue({
      code: "custom",
      path: ["sections"],
      message:
        "All agent-evaluated items in one assessment must share one rubric so one immutable submission receives one coherent evaluation.",
    });
  }

  if (assessment.profileId === "sat-practice") {
    const expectedSections = ["reading-writing", "math"];
    if (
      sectionIds.length !== expectedSections.length ||
      expectedSections.some((id, index) => sectionIds[index] !== id)
    ) {
      context.addIssue({
        code: "custom",
        path: ["sections"],
        message: "SAT practice must contain ordered reading-writing and math sections.",
      });
    }
    assessment.sections.forEach((section, sectionIndex) => {
      if (section.modules.length !== 2) {
        context.addIssue({
          code: "custom",
          path: ["sections", sectionIndex, "modules"],
          message: "Each SAT practice section must contain exactly two modules.",
        });
      }
      section.modules.forEach((module, moduleIndex) => {
        module.items.forEach((item, itemIndex) => {
          const allowed = section.id === "reading-writing"
            ? ["single_choice"]
            : ["single_choice", "numeric_entry"];
          if (!allowed.includes(item.interaction.type)) {
            context.addIssue({
              code: "custom",
              path: [
                "sections",
                sectionIndex,
                "modules",
                moduleIndex,
                "items",
                itemIndex,
                "interaction",
              ],
              message: section.id === "reading-writing"
                ? "SAT Reading and Writing items must use single choice."
                : "SAT Math items must use single choice or numeric entry.",
            });
          }
        });
      });
    });
  }
});

function addDuplicateIssues(
  values: string[],
  path: Array<string | number>,
  label: string,
  context: z.RefinementCtx,
): void {
  if (new Set(values).size !== values.length) {
    context.addIssue({ code: "custom", path, message: `${label} must be unique.` });
  }
}

function validateItemContract(
  item: z.infer<typeof assessmentItemSchema>,
  path: Array<string | number>,
  rubricIds: Set<string>,
  context: z.RefinementCtx,
): void {
  item.stimulus.forEach((block, blockIndex) => {
    validateContentBlock(block, [...path, "stimulus", blockIndex], context);
  });
  item.prompt.forEach((block, blockIndex) => {
    validateContentBlock(block, [...path, "prompt", blockIndex], context);
  });

  if (
    item.interaction.type === "extended_text" &&
    item.interaction.minimumWords !== undefined &&
    item.interaction.maximumWords !== undefined &&
    item.interaction.minimumWords > item.interaction.maximumWords
  ) {
    context.addIssue({
      code: "custom",
      path: [...path, "interaction"],
      message: "Minimum words cannot exceed maximum words.",
    });
  }

  const optionIds = item.interaction.type === "single_choice" ||
      item.interaction.type === "multiple_choice"
    ? item.interaction.options.map((option) => option.id)
    : [];
  if (optionIds.length && new Set(optionIds).size !== optionIds.length) {
    context.addIssue({
      code: "custom",
      path: [...path, "interaction", "options"],
      message: "Option IDs must be unique within an item.",
    });
  }

  if (item.interaction.type === "single_choice") {
    if (item.scoring.type !== "exact" || !optionIds.includes(item.scoring.answer)) {
      context.addIssue({
        code: "custom",
        path: [...path, "scoring"],
        message: "Single-choice scoring must reference one option ID.",
      });
    }
  } else if (item.interaction.type === "multiple_choice") {
    if (
      item.scoring.type !== "set" ||
      item.scoring.answers.some((answer) => !optionIds.includes(answer))
    ) {
      context.addIssue({
        code: "custom",
        path: [...path, "scoring"],
        message: "Multiple-choice scoring must reference valid option IDs.",
      });
    }
    const maximum = item.interaction.maximumSelections;
    const minimum = item.interaction.minimumSelections;
    if (maximum && maximum > optionIds.length) {
      context.addIssue({
        code: "custom",
        path: [...path, "interaction", "maximumSelections"],
        message: "Maximum selections cannot exceed the number of options.",
      });
    }
    if (minimum && minimum > optionIds.length) {
      context.addIssue({
        code: "custom",
        path: [...path, "interaction", "minimumSelections"],
        message: "Minimum selections cannot exceed the number of options.",
      });
    }
    if (minimum && maximum && minimum > maximum) {
      context.addIssue({
        code: "custom",
        path: [...path, "interaction"],
        message: "Minimum selections cannot exceed maximum selections.",
      });
    }
  } else if (item.interaction.type === "numeric_entry" && item.scoring.type !== "numeric") {
    context.addIssue({
      code: "custom",
      path: [...path, "scoring"],
      message: "Numeric-entry items require numeric scoring.",
    });
  } else if (
    item.interaction.type === "text_entry" &&
    !["exact", "aliases", "agent"].includes(item.scoring.type)
  ) {
    context.addIssue({
      code: "custom",
      path: [...path, "scoring"],
      message: "Text-entry items require exact, alias, or agent scoring.",
    });
  } else if (item.interaction.type === "matching" && item.scoring.type !== "mapping") {
    context.addIssue({
      code: "custom",
      path: [...path, "scoring"],
      message: "Matching items require mapping scoring.",
    });
  } else if (item.interaction.type === "extended_text" && item.scoring.type !== "agent") {
    context.addIssue({
      code: "custom",
      path: [...path, "scoring"],
      message: "Extended-text items require agent evaluation.",
    });
  }

  if (item.interaction.type === "multiple_choice" && item.scoring.type === "set") {
    const uniqueAnswers = new Set(item.scoring.answers);
    if (uniqueAnswers.size !== item.scoring.answers.length) {
      context.addIssue({
        code: "custom",
        path: [...path, "scoring", "answers"],
        message: "Multiple-choice answer IDs must be unique.",
      });
    }
    if (
      (item.interaction.minimumSelections &&
        item.scoring.answers.length < item.interaction.minimumSelections) ||
      (item.interaction.maximumSelections &&
        item.scoring.answers.length > item.interaction.maximumSelections)
    ) {
      context.addIssue({
        code: "custom",
        path: [...path, "scoring", "answers"],
        message: "The correct answer set must satisfy the interaction selection limits.",
      });
    }
  }

  if (item.scoring.type === "agent") {
    if (!item.evaluationRubricId || !rubricIds.has(item.evaluationRubricId)) {
      context.addIssue({
        code: "custom",
        path: [...path, "evaluationRubricId"],
        message: "Agent-evaluated items must reference a declared rubric.",
      });
    }
  } else if (item.evaluationRubricId) {
    context.addIssue({
      code: "custom",
      path: [...path, "evaluationRubricId"],
      message: "Only agent-evaluated items may reference a rubric.",
    });
  }

  if (item.interaction.type === "matching" && item.scoring.type === "mapping") {
    const promptIdList = item.interaction.prompts.map((prompt) => prompt.id);
    const matchingOptionIdList = item.interaction.options.map((option) => option.id);
    const promptIds = new Set(promptIdList);
    const matchingOptionIds = new Set(matchingOptionIdList);
    if (promptIds.size !== promptIdList.length || matchingOptionIds.size !== matchingOptionIdList.length) {
      context.addIssue({
        code: "custom",
        path: [...path, "interaction"],
        message: "Matching prompt and option IDs must be unique.",
      });
    }
    if (
      Object.keys(item.scoring.answers).length !== promptIds.size ||
      Object.keys(item.scoring.answers).some((id) => !promptIds.has(id)) ||
      Object.values(item.scoring.answers).some((id) => !matchingOptionIds.has(id))
    ) {
      context.addIssue({
        code: "custom",
        path: [...path, "scoring", "answers"],
        message: "Matching answers must cover every prompt and reference declared option IDs.",
      });
    }
  }
}

function validateContentBlock(
  block: z.infer<typeof assessmentContentBlockSchema>,
  path: Array<string | number>,
  context: z.RefinementCtx,
): void {
  if (block.type === "table" && block.rows.some((row) => row.length !== block.columns.length)) {
    context.addIssue({
      code: "custom",
      path,
      message: "Every table row must contain one cell for each column.",
    });
  }
}

export type AssessmentPackage = z.infer<typeof assessmentPackageSchema>;
export type AssessmentSection = AssessmentPackage["sections"][number];
export type AssessmentModule = AssessmentSection["modules"][number];
export type AssessmentItem = AssessmentModule["items"][number];
export type CandidateAssessmentPackage = Omit<AssessmentPackage, "sections"> & {
  sections: Array<Omit<AssessmentSection, "modules"> & {
    modules: Array<Omit<AssessmentModule, "items"> & {
      items: Array<Omit<AssessmentItem, "scoring">>;
    }>;
  }>;
};
export type AssessmentContentBlock = z.infer<typeof assessmentContentBlockSchema>;
export type AssessmentInteraction = z.infer<typeof assessmentInteractionSchema>;
export type AssessmentRubric = z.infer<typeof assessmentRubricSchema>;
export type AssessmentResponse = string | string[] | Record<string, string>;
export type AssessmentResponseMap = Record<string, AssessmentResponse>;

export const assessmentResponseSchema = z.union([
  z.string(),
  z.array(z.string()),
  z.record(z.string(), z.string()),
]);

export const assessmentResponseMapSchema: z.ZodType<AssessmentResponseMap> = z.record(
  z.string(),
  assessmentResponseSchema,
);

export type AssessmentItemResult = {
  itemId: string;
  sectionId: string;
  moduleId: string;
  domain?: string;
  answered: boolean;
  correct: boolean | null;
};

export type AssessmentResult = {
  rawScore: number;
  maximumScore: number;
  answeredCount: number;
  totalItems: number;
  awaitingEvaluationCount: number;
  itemResults: AssessmentItemResult[];
  domains: Array<{
    domain: string;
    correct: number;
    total: number;
  }>;
};

export type AssessmentSubmission = {
  attemptId: string;
  packageId: string;
  profileId: AssessmentPackage["profileId"];
  package: AssessmentPackage;
  responses: AssessmentResponseMap;
  result: AssessmentResult;
  startedAt: string;
  submittedAt: string;
};

export type AssessmentHistoryEntry = {
  attemptId: string;
  packageId: string;
  profileId: AssessmentPackage["profileId"];
  title: string;
  rawScore: number;
  maximumScore: number;
  awaitingEvaluationCount: number;
  submittedAt: string;
};

export const assessmentResultSchema: z.ZodType<AssessmentResult> = z.strictObject({
  rawScore: z.number().int().nonnegative(),
  maximumScore: z.number().int().nonnegative(),
  answeredCount: z.number().int().nonnegative(),
  totalItems: z.number().int().nonnegative(),
  awaitingEvaluationCount: z.number().int().nonnegative(),
  itemResults: z.array(z.strictObject({
    itemId: identifierSchema,
    sectionId: identifierSchema,
    moduleId: identifierSchema,
    domain: z.string().optional(),
    answered: z.boolean(),
    correct: z.boolean().nullable(),
  })),
  domains: z.array(z.strictObject({
    domain: z.string().min(1),
    correct: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
  })),
});

const evaluationScoreSchema = z.strictObject({
  criterionId: identifierSchema,
  score: z.number().finite(),
  feedback: bodyTextSchema,
  evidence: z.array(bodyTextSchema).max(20).default([]),
});

export const assessmentEvaluationInputSchema = z.strictObject({
  attemptId: z.uuid(),
  rubricId: identifierSchema,
  overallScore: z.number().finite(),
  criteria: z.array(evaluationScoreSchema).min(1).max(20),
  summary: bodyTextSchema,
  strengths: z.array(shortTextSchema).min(1).max(10),
  improvements: z.array(shortTextSchema).min(1).max(10),
  annotations: z.array(z.strictObject({
    itemId: identifierSchema,
    originalText: bodyTextSchema,
    suggestion: bodyTextSchema,
    explanation: bodyTextSchema,
  })).max(100).default([]),
});

export const assessmentEvaluationSchema = assessmentEvaluationInputSchema.extend({
  evaluatedAt: z.iso.datetime({ offset: true }),
});

export type AssessmentEvaluationInput = z.infer<typeof assessmentEvaluationInputSchema>;
export type AssessmentEvaluation = z.infer<typeof assessmentEvaluationSchema>;

export function parseAssessmentPackage(input: unknown): AssessmentPackage {
  return assessmentPackageSchema.parse(input);
}

export function getAssessmentPackageJsonSchema() {
  return z.toJSONSchema(assessmentPackageSchema, { target: "draft-07" });
}

export function getAssessmentEvaluationJsonSchema() {
  return z.toJSONSchema(assessmentEvaluationInputSchema, { target: "draft-07" });
}
