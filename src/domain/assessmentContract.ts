import { z } from "zod";

const identifierSchema = z.string().trim().min(1).max(100)
  .regex(/^[a-z0-9][a-z0-9._-]*$/);
const shortTextSchema = z.string().trim().min(1).max(500);
const compactLabelSchema = z.string().trim().min(1).max(40);
const bodyTextSchema = z.string().trim().min(1).max(20_000);
const optionSchema = z.strictObject({ id: identifierSchema, label: bodyTextSchema })
  .describe("One learner-visible answer option. The ID is used by responses and scoring.")
  .meta({ id: "AssessmentOption" });
const groupedChoiceGroupSchema = z.strictObject({
  id: identifierSchema,
  label: shortTextSchema,
  options: z.array(optionSchema).min(2).max(12),
})
  .describe("One labeled choice group with its own answer options.")
  .meta({ id: "GroupedChoiceGroup" });

export const assessmentContentBlockSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("text"), text: bodyTextSchema,
    variant: z.enum(["title", "subtitle", "body", "muted"]).optional(),
  }),
  z.strictObject({
    type: z.literal("passage"), title: shortTextSchema.optional(),
    paragraphs: z.array(bodyTextSchema).min(1).max(30),
  }),
  z.strictObject({
    type: z.literal("math"), expression: shortTextSchema,
    accessibleLabel: shortTextSchema.optional(),
  }),
  z.strictObject({
    type: z.literal("table"), caption: shortTextSchema.optional(),
    columns: z.array(shortTextSchema).min(1).max(12),
    rows: z.array(z.array(shortTextSchema).min(1).max(12)).min(1).max(50),
  }),
  z.strictObject({
    type: z.literal("bar_chart"), title: shortTextSchema,
    unit: shortTextSchema.optional(),
    bars: z.array(z.strictObject({ label: shortTextSchema, value: z.number().finite() })).min(1).max(20),
  }),
])
  .describe("Trusted content rendered by the application. It cannot contain HTML or executable code.")
  .meta({ id: "AssessmentContentBlock" });

export const assessmentInteractionSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("single_choice"), options: z.array(optionSchema).min(2).max(12) }),
  z.strictObject({
    type: z.literal("multiple_choice"), options: z.array(optionSchema).min(2).max(20),
    minimumSelections: z.number().int().positive().max(20).optional(),
    maximumSelections: z.number().int().positive().max(20).optional(),
  }),
  z.strictObject({
    type: z.literal("text_entry"), placeholder: shortTextSchema.optional(),
    maximumCharacters: z.number().int().positive().max(4_000).optional(),
  }),
  z.strictObject({ type: z.literal("numeric_entry"), placeholder: shortTextSchema.optional() }),
  z.strictObject({
    type: z.literal("extended_text"), placeholder: shortTextSchema.optional(),
    minimumWords: z.number().int().nonnegative().max(20_000).optional(),
    maximumWords: z.number().int().positive().max(20_000).optional(),
  }),
  z.strictObject({
    type: z.literal("matching"),
    prompts: z.array(z.strictObject({ id: identifierSchema, label: bodyTextSchema })).min(1).max(30),
    options: z.array(optionSchema).min(2).max(30),
  }),
  z.strictObject({
    type: z.literal("grouped_choice"),
    groups: z.array(groupedChoiceGroupSchema).min(1).max(10),
  }),
])
  .describe("The learner response control for one item. Its type must match the scoring rule.")
  .meta({ id: "AssessmentInteraction" });

const scoringRuleSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("exact"), answer: shortTextSchema }),
  z.strictObject({
    type: z.literal("aliases"), answers: z.array(shortTextSchema).min(1).max(20),
    ignorePunctuation: z.boolean().optional(),
  }),
  z.strictObject({ type: z.literal("set"), answers: z.array(identifierSchema).min(1).max(20) }),
  z.strictObject({
    type: z.literal("numeric"), answer: z.number().finite(),
    tolerance: z.number().nonnegative().finite().optional(),
  }),
  z.strictObject({ type: z.literal("mapping"), answers: z.record(identifierSchema, identifierSchema) }),
  z.strictObject({ type: z.literal("agent") }),
])
  .describe("The answer key or agent-evaluation marker for one item.")
  .meta({ id: "AssessmentScoringRule" });

const rubricCriterionSchema = z.strictObject({
  id: identifierSchema, label: shortTextSchema, description: bodyTextSchema,
  weight: z.number().positive().max(1).optional(),
});
export const assessmentRubricSchema = z.strictObject({
  id: identifierSchema, title: shortTextSchema,
  scale: z.strictObject({
    minimum: z.number().finite(), maximum: z.number().finite(), step: z.number().positive().finite(),
  }),
  criteria: z.array(rubricCriterionSchema).min(1).max(20),
  requireEvidence: z.boolean().default(true),
  allowAnnotations: z.boolean().default(true),
})
  .describe("The scale and criteria used to evaluate every agent-scored item in the package.")
  .meta({ id: "AssessmentRubric" });

export const assessmentItemSchema = z.strictObject({
  id: identifierSchema,
  domain: shortTextSchema.optional(),
  skill: shortTextSchema.optional(),
  stimulus: z.array(assessmentContentBlockSchema).max(20).default([]),
  prompt: z.array(assessmentContentBlockSchema).min(1).max(20),
  interaction: assessmentInteractionSchema,
  scoring: scoringRuleSchema,
  evaluationRubricId: identifierSchema.optional(),
  presentation: z.strictObject({
    layout: z.enum(["single", "split"]).optional(),
    stimulusLabel: shortTextSchema.optional(),
  }).optional(),
})
  .describe("One prompt, its optional stimulus, one response interaction, and one scoring rule.")
  .meta({ id: "AssessmentItem" });

const assessmentToolSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("mark_for_review") }),
  z.strictObject({ type: z.literal("option_eliminator") }),
  z.strictObject({ type: z.literal("calculator") }),
  z.strictObject({ type: z.literal("reference_document"), resourceId: identifierSchema }),
])
  .describe("A learner tool enabled only in the part that declares it.")
  .meta({ id: "AssessmentTool" });
const assessmentResourceSchema = z.strictObject({
  id: identifierSchema, type: z.literal("document"), title: shortTextSchema,
  description: bodyTextSchema.optional(),
  content: z.array(assessmentContentBlockSchema).min(1).max(100),
})
  .describe("A candidate-visible reference document opened by a declared reference_document tool.")
  .meta({ id: "AssessmentResource" });
const assessmentPartSchema = z.strictObject({
  id: identifierSchema,
  groupTitle: shortTextSchema.optional(),
  title: shortTextSchema,
  description: bodyTextSchema.optional(),
  durationSeconds: z.number().int().positive().max(14_400).optional(),
  navigation: z.enum(["free", "linear"]).default("free"),
  defaultLayout: z.enum(["single", "split"]).default("single"),
  tools: z.array(assessmentToolSchema).max(10).default([]),
  items: z.array(assessmentItemSchema).min(1).max(100),
})
  .describe("A timed navigation boundary. Finishing a part locks it and opens the next part.")
  .meta({ id: "AssessmentPart" });

const assessmentPackageFields = {
  schemaVersion: z.literal(3),
  packageId: identifierSchema.describe("A stable ID for this assessment. Change it when creating a different assessment."),
  revision: z.number().int().positive().max(10_000)
    .describe("Increase this integer when replacing the content of the same package ID."),
  title: shortTextSchema,
  description: bodyTextSchema.optional(),
  metadata: z.strictObject({
    subject: shortTextSchema.optional(),
    difficulty: z.enum(["foundation", "standard", "advanced", "mixed"]).optional(),
    locale: z.string().trim().min(2).max(20).optional(),
    shortLabel: compactLabelSchema.optional(),
    disclaimer: bodyTextSchema.optional(),
  }).default({}),
  presentation: z.strictObject({
    accent: z.enum(["red", "blue", "green", "violet"]).default("blue"),
    density: z.enum(["comfortable", "compact"]).default("comfortable"),
  }).default({ accent: "blue", density: "comfortable" }),
  resources: z.array(assessmentResourceSchema).max(20).default([]),
  parts: z.array(assessmentPartSchema).min(1).max(50),
  review: z.strictObject({ mode: z.enum(["answers", "responses", "none"]).default("answers") })
    .default({ mode: "answers" }),
  rubrics: z.array(assessmentRubricSchema).max(20).default([]),
};

const assessmentPackageContentSchema = z.strictObject(assessmentPackageFields)
  .describe("One complete universal assessment package. The application adds source after validation.");
export const assessmentAuthoringPackageSchema = assessmentPackageContentSchema
  .superRefine(validateAssessmentPackage);
export const assessmentPackageSchema = z.strictObject({
  ...assessmentPackageFields,
  source: z.enum(["built-in", "agent"]),
}).superRefine(validateAssessmentPackage);

function validateAssessmentPackage(
  assessment: z.infer<typeof assessmentPackageContentSchema>,
  context: z.RefinementCtx,
): void {
  const partIds = assessment.parts.map((part) => part.id);
  const resourceIds = assessment.resources.map((resource) => resource.id);
  const rubricIds = assessment.rubrics.map((rubric) => rubric.id);
  const resourceIdSet = new Set(resourceIds);
  const rubricIdSet = new Set(rubricIds);
  const itemIds: string[] = [];
  const agentRubricIds = new Set<string>();

  addDuplicateIssues(partIds, ["parts"], "Part IDs", context);
  addDuplicateIssues(resourceIds, ["resources"], "Resource IDs", context);
  addDuplicateIssues(rubricIds, ["rubrics"], "Rubric IDs", context);
  assessment.resources.forEach((resource, resourceIndex) => {
    resource.content.forEach((block, blockIndex) => {
      validateContentBlock(block, ["resources", resourceIndex, "content", blockIndex], context);
    });
  });

  assessment.rubrics.forEach((rubric, rubricIndex) => {
    addDuplicateIssues(
      rubric.criteria.map((criterion) => criterion.id),
      ["rubrics", rubricIndex, "criteria"],
      "Criterion IDs",
      context,
    );
    if (rubric.scale.maximum <= rubric.scale.minimum) {
      context.addIssue({
        code: "custom", path: ["rubrics", rubricIndex, "scale"],
        message: "The rubric maximum must be greater than its minimum.",
      });
    } else {
      const steps = (rubric.scale.maximum - rubric.scale.minimum) / rubric.scale.step;
      if (Math.abs(steps - Math.round(steps)) > 1e-8) {
        context.addIssue({
          code: "custom", path: ["rubrics", rubricIndex, "scale", "step"],
          message: "The rubric step must divide the scale range exactly.",
        });
      }
    }
    const weights = rubric.criteria.map((criterion) => criterion.weight);
    const supplied = weights.filter((weight): weight is number => weight !== undefined);
    if (supplied.length > 0 && supplied.length !== weights.length) {
      context.addIssue({
        code: "custom", path: ["rubrics", rubricIndex, "criteria"],
        message: "Rubric criterion weights must be supplied for every criterion or omitted for all.",
      });
    } else if (supplied.length > 0 && Math.abs(supplied.reduce((sum, value) => sum + value, 0) - 1) > 1e-8) {
      context.addIssue({
        code: "custom", path: ["rubrics", rubricIndex, "criteria"],
        message: "Rubric criterion weights must sum to 1.",
      });
    }
  });

  assessment.parts.forEach((part, partIndex) => {
    addDuplicateIssues(
      part.tools.map((tool) => tool.type === "reference_document" ? `${tool.type}:${tool.resourceId}` : tool.type),
      ["parts", partIndex, "tools"],
      "Tool declarations",
      context,
    );
    part.tools.forEach((tool, toolIndex) => {
      if (tool.type === "reference_document" && !resourceIdSet.has(tool.resourceId)) {
        context.addIssue({
          code: "custom", path: ["parts", partIndex, "tools", toolIndex, "resourceId"],
          message: `Reference tool must point to a declared resource; '${tool.resourceId}' was not found.`,
        });
      }
    });
    part.items.forEach((item, itemIndex) => {
      itemIds.push(item.id);
      if (item.scoring.type === "agent" && item.evaluationRubricId) {
        agentRubricIds.add(item.evaluationRubricId);
      }
      validateItemContract(
        item,
        part.defaultLayout,
        ["parts", partIndex, "items", itemIndex],
        rubricIdSet,
        context,
      );
    });
  });
  addDuplicateIssues(itemIds, ["parts"], "Item IDs", context);
  if (itemIds.length > 300) {
    context.addIssue({ code: "custom", path: ["parts"], message: "An assessment package cannot contain more than 300 items." });
  }
  if (agentRubricIds.size > 1) {
    context.addIssue({
      code: "custom", path: ["parts"],
      message: "All agent-evaluated items in one assessment must share one rubric.",
    });
  }
}

function addDuplicateIssues(
  values: string[], path: Array<string | number>, label: string, context: z.RefinementCtx,
): void {
  if (new Set(values).size !== values.length) {
    context.addIssue({ code: "custom", path, message: `${label} must be unique.` });
  }
}

function validateItemContract(
  item: z.infer<typeof assessmentItemSchema>,
  defaultLayout: "single" | "split",
  path: Array<string | number>,
  rubricIds: Set<string>,
  context: z.RefinementCtx,
): void {
  item.stimulus.forEach((block, index) => validateContentBlock(block, [...path, "stimulus", index], context));
  item.prompt.forEach((block, index) => validateContentBlock(block, [...path, "prompt", index], context));
  if ((item.presentation?.layout ?? defaultLayout) === "split" && item.stimulus.length === 0) {
    context.addIssue({
      code: "custom", path: [...path, "presentation"],
      message: "An item using split layout must contain stimulus content or explicitly select single layout.",
    });
  }
  if (item.presentation?.stimulusLabel && item.stimulus.length === 0) {
    context.addIssue({
      code: "custom", path: [...path, "presentation", "stimulusLabel"],
      message: "A stimulus label requires stimulus content.",
    });
  }
  if (
    item.interaction.type === "extended_text" &&
    item.interaction.minimumWords !== undefined && item.interaction.maximumWords !== undefined &&
    item.interaction.minimumWords > item.interaction.maximumWords
  ) {
    context.addIssue({ code: "custom", path: [...path, "interaction"], message: "Minimum words cannot exceed maximum words." });
  }

  const optionIds = item.interaction.type === "single_choice" || item.interaction.type === "multiple_choice"
    ? item.interaction.options.map((option) => option.id)
    : [];
  if (optionIds.length !== new Set(optionIds).size) {
    context.addIssue({
      code: "custom", path: [...path, "interaction", "options"],
      message: "Option IDs must be unique within an item.",
    });
  }

  if (item.interaction.type === "single_choice") {
    if (item.scoring.type !== "exact" || !optionIds.includes(item.scoring.answer)) {
      context.addIssue({
        code: "custom", path: [...path, "scoring"],
        message: "Single-choice scoring must reference one option ID.",
      });
    }
  } else if (item.interaction.type === "multiple_choice") {
    if (item.scoring.type !== "set" || item.scoring.answers.some((answer) => !optionIds.includes(answer))) {
      context.addIssue({
        code: "custom", path: [...path, "scoring"],
        message: "Multiple-choice scoring must reference valid option IDs.",
      });
    }
    const { minimumSelections: minimum, maximumSelections: maximum } = item.interaction;
    if (maximum && maximum > optionIds.length) {
      context.addIssue({
        code: "custom", path: [...path, "interaction", "maximumSelections"],
        message: "Maximum selections cannot exceed the number of options.",
      });
    }
    if (minimum && minimum > optionIds.length) {
      context.addIssue({
        code: "custom", path: [...path, "interaction", "minimumSelections"],
        message: "Minimum selections cannot exceed the number of options.",
      });
    }
    if (minimum && maximum && minimum > maximum) {
      context.addIssue({
        code: "custom", path: [...path, "interaction"],
        message: "Minimum selections cannot exceed maximum selections.",
      });
    }
    if (item.scoring.type === "set") {
      if (item.scoring.answers.length !== new Set(item.scoring.answers).size) {
        context.addIssue({
          code: "custom", path: [...path, "scoring", "answers"],
          message: "Multiple-choice answer IDs must be unique.",
        });
      }
      if ((minimum && item.scoring.answers.length < minimum) || (maximum && item.scoring.answers.length > maximum)) {
        context.addIssue({
          code: "custom", path: [...path, "scoring", "answers"],
          message: "The correct answer set must satisfy the selection limits.",
        });
      }
    }
  } else if (item.interaction.type === "numeric_entry" && item.scoring.type !== "numeric") {
    context.addIssue({ code: "custom", path: [...path, "scoring"], message: "Numeric-entry items require numeric scoring." });
  } else if (item.interaction.type === "text_entry" && !["exact", "aliases", "agent"].includes(item.scoring.type)) {
    context.addIssue({ code: "custom", path: [...path, "scoring"], message: "Text-entry items require exact, alias, or agent scoring." });
  } else if (item.interaction.type === "matching" && item.scoring.type !== "mapping") {
    context.addIssue({ code: "custom", path: [...path, "scoring"], message: "Matching items require mapping scoring." });
  } else if (item.interaction.type === "grouped_choice" && item.scoring.type !== "mapping") {
    context.addIssue({ code: "custom", path: [...path, "scoring"], message: "Grouped-choice items require mapping scoring." });
  } else if (item.interaction.type === "extended_text" && item.scoring.type !== "agent") {
    context.addIssue({ code: "custom", path: [...path, "scoring"], message: "Extended-text items require agent evaluation." });
  }

  if (item.scoring.type === "agent") {
    if (!item.evaluationRubricId || !rubricIds.has(item.evaluationRubricId)) {
      context.addIssue({
        code: "custom", path: [...path, "evaluationRubricId"],
        message: "Agent-evaluated items must reference a declared rubric.",
      });
    }
  } else if (item.evaluationRubricId) {
    context.addIssue({
      code: "custom", path: [...path, "evaluationRubricId"],
      message: "Only agent-evaluated items may reference a rubric.",
    });
  }

  if (item.interaction.type === "matching" && item.scoring.type === "mapping") {
    const promptIds = item.interaction.prompts.map((prompt) => prompt.id);
    const matchingOptionIds = item.interaction.options.map((option) => option.id);
    if (promptIds.length !== new Set(promptIds).size || matchingOptionIds.length !== new Set(matchingOptionIds).size) {
      context.addIssue({
        code: "custom", path: [...path, "interaction"],
        message: "Matching prompt and option IDs must be unique.",
      });
    }
    const answers = Object.entries(item.scoring.answers);
    if (
      answers.length !== promptIds.length ||
      answers.some(([promptId, optionId]) => !promptIds.includes(promptId) || !matchingOptionIds.includes(optionId))
    ) {
      context.addIssue({
        code: "custom", path: [...path, "scoring", "answers"],
        message: "Matching answers must cover every prompt and reference declared option IDs.",
      });
    }
  }

  if (item.interaction.type === "grouped_choice" && item.scoring.type === "mapping") {
    const groupIds = item.interaction.groups.map((group) => group.id);
    const optionIds = item.interaction.groups.flatMap((group) => group.options.map((option) => option.id));
    if (groupIds.length !== new Set(groupIds).size) {
      context.addIssue({
        code: "custom", path: [...path, "interaction", "groups"],
        message: "Grouped-choice group IDs must be unique within an item.",
      });
    }
    if (optionIds.length !== new Set(optionIds).size) {
      context.addIssue({
        code: "custom", path: [...path, "interaction", "groups"],
        message: "Grouped-choice option IDs must be unique across the item.",
      });
    }
    item.interaction.groups.forEach((group, groupIndex) => {
      const groupOptionIds = group.options.map((option) => option.id);
      const answer = item.scoring.type === "mapping" ? item.scoring.answers[group.id] : undefined;
      if (!answer || !groupOptionIds.includes(answer)) {
        context.addIssue({
          code: "custom", path: [...path, "scoring", "answers", group.id],
          message: `Grouped-choice answer for '${group.id}' must reference an option in that group.`,
        });
      }
      if (group.options.length !== new Set(groupOptionIds).size) {
        context.addIssue({
          code: "custom", path: [...path, "interaction", "groups", groupIndex, "options"],
          message: "Option IDs must be unique within a grouped-choice group.",
        });
      }
    });
    const answerGroupIds = Object.keys(item.scoring.answers);
    if (answerGroupIds.length !== groupIds.length || answerGroupIds.some((groupId) => !groupIds.includes(groupId))) {
      context.addIssue({
        code: "custom", path: [...path, "scoring", "answers"],
        message: "Grouped-choice answers must cover every group and no others.",
      });
    }
  }
}

function validateContentBlock(
  block: z.infer<typeof assessmentContentBlockSchema>,
  path: Array<string | number>, context: z.RefinementCtx,
): void {
  if (block.type === "table" && block.rows.some((row) => row.length !== block.columns.length)) {
    context.addIssue({ code: "custom", path, message: "Every table row must contain one cell for each column." });
  }
}

export type AssessmentPackage = z.infer<typeof assessmentPackageSchema>;
export type AssessmentAuthoringPackage = z.infer<typeof assessmentAuthoringPackageSchema>;
export type AssessmentPart = AssessmentPackage["parts"][number];
export type AssessmentItem = AssessmentPart["items"][number];
export type AssessmentTool = AssessmentPart["tools"][number];
export type AssessmentResource = AssessmentPackage["resources"][number];
export type CandidateAssessmentPackage = Omit<AssessmentPackage, "parts"> & {
  parts: Array<Omit<AssessmentPart, "items"> & { items: Array<Omit<AssessmentItem, "scoring">> }>;
};
export type AssessmentContentBlock = z.infer<typeof assessmentContentBlockSchema>;
export type AssessmentInteraction = z.infer<typeof assessmentInteractionSchema>;
export type AssessmentRubric = z.infer<typeof assessmentRubricSchema>;
export type AssessmentResponse = string | string[] | Record<string, string>;
export type AssessmentResponseMap = Record<string, AssessmentResponse>;

export const assessmentResponseSchema = z.union([
  z.string(), z.array(z.string()), z.record(z.string(), z.string()),
]);
export const assessmentResponseMapSchema: z.ZodType<AssessmentResponseMap> =
  z.record(z.string(), assessmentResponseSchema);

export type AssessmentItemResult = {
  itemId: string;
  partId: string;
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
  domains: Array<{ domain: string; correct: number; total: number }>;
};
export type AssessmentSubmission = {
  attemptId: string;
  packageId: string;
  package: AssessmentPackage;
  responses: AssessmentResponseMap;
  result: AssessmentResult;
  startedAt: string;
  submittedAt: string;
};
export type AssessmentEvaluationStatus =
  | "not_required"
  | "awaiting_evaluation"
  | "evaluated";
export type AssessmentHistoryEntry = {
  attemptId: string;
  packageId: string;
  title: string;
  rawScore: number;
  maximumScore: number;
  evaluationStatus: AssessmentEvaluationStatus;
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
    partId: identifierSchema,
    domain: z.string().optional(),
    answered: z.boolean(),
    correct: z.boolean().nullable(),
  })),
  domains: z.array(z.strictObject({
    domain: z.string().min(1), correct: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
  })),
});

const evaluationScoreSchema = z.strictObject({
  criterionId: identifierSchema, score: z.number().finite(), feedback: bodyTextSchema,
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
    itemId: identifierSchema, originalText: bodyTextSchema,
    suggestion: bodyTextSchema, explanation: bodyTextSchema,
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
export function parseAssessmentAuthoringPackage(input: unknown): AssessmentAuthoringPackage {
  return assessmentAuthoringPackageSchema.parse(input);
}

// The registered schema teaches the package shape. The Zod parser below remains
// the authority for detailed bounds and returns repairable validation paths.
const agentSchemaOmittedKeywords = new Set([
  "default",
  "exclusiveMinimum",
  "maxItems",
  "maxLength",
  "maximum",
  "minItems",
  "minLength",
  "minimum",
  "pattern",
]);

function compactAgentSchema(value: unknown, parentKey?: string): unknown {
  if (Array.isArray(value)) return value.map((entry) => compactAgentSchema(entry, parentKey));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) =>
        parentKey === "properties" || parentKey === "definitions" || !agentSchemaOmittedKeywords.has(key))
      .map(([key, entry]) => [key, compactAgentSchema(entry, key)]),
  );
}

export function getAssessmentPackageJsonSchema() {
  const schema = z.toJSONSchema(assessmentAuthoringPackageSchema, {
    target: "draft-07",
    io: "input",
  });
  return compactAgentSchema(schema) as typeof schema;
}
export function getAssessmentEvaluationJsonSchema() {
  return z.toJSONSchema(assessmentEvaluationInputSchema, { target: "draft-07" });
}
