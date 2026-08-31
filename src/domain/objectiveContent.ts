import { z } from "zod";
import type { AnswerKey } from "./types";

const shortText = z.string().trim().min(1).max(500);
const bodyText = z.string().trim().min(1).max(20_000);
const answerText = z.string().trim().min(1).max(500);
const objectiveAnswerSchema = z.union([
  answerText,
  z.array(answerText).min(1).max(20),
]);
const questionId = z.number().int().min(1).max(40);

const radioOptionSchema = z.strictObject({
  value: shortText,
  label: bodyText,
});

const mapPointSchema = z.tuple([z.number(), z.number()]);
const mapElementBase = {
  id: z.string().trim().min(1).max(100).optional(),
  opacity: z.number().min(0).max(1).optional(),
  rotate: z.number().optional(),
};
const mapPaint = {
  fill: z.string().trim().min(1).max(100).optional(),
  stroke: z.string().trim().min(1).max(100).optional(),
  strokeWidth: z.number().nonnegative().optional(),
  dashed: z.boolean().optional(),
};

const mapElementSchema = z.discriminatedUnion("type", [
  z.strictObject({
    ...mapElementBase,
    ...mapPaint,
    type: z.literal("rect"),
    x: z.number(),
    y: z.number(),
    w: z.number().positive(),
    h: z.number().positive(),
    rx: z.number().nonnegative().optional(),
  }),
  z.strictObject({
    ...mapElementBase,
    ...mapPaint,
    type: z.literal("ellipse"),
    cx: z.number(),
    cy: z.number(),
    rx: z.number().positive(),
    ry: z.number().positive(),
  }),
  z.strictObject({
    ...mapElementBase,
    ...mapPaint,
    type: z.literal("polygon"),
    points: z.array(mapPointSchema).min(3).max(200),
    lineJoin: z.enum(["miter", "round", "bevel"]).optional(),
  }),
  z.strictObject({
    ...mapElementBase,
    type: z.literal("polyline"),
    points: z.array(mapPointSchema).min(2).max(200),
    stroke: z.string().trim().min(1).max(100).optional(),
    strokeWidth: z.number().nonnegative().optional(),
    dashed: z.boolean().optional(),
    lineCap: z.enum(["butt", "round", "square"]).optional(),
    lineJoin: z.enum(["miter", "round", "bevel"]).optional(),
  }),
  z.strictObject({
    ...mapElementBase,
    type: z.literal("label"),
    x: z.number(),
    y: z.number(),
    text: bodyText.optional(),
    lines: z.array(bodyText).min(1).max(20).optional(),
    fill: z.string().trim().min(1).max(100).optional(),
    fontSize: z.number().positive().optional(),
    fontWeight: z.enum(["400", "500", "600", "700", "800"]).optional(),
    align: z.enum(["start", "middle", "end"]).optional(),
  }),
  z.strictObject({
    ...mapElementBase,
    type: z.literal("symbol"),
    x: z.number(),
    y: z.number(),
    name: z.enum([
      "bench",
      "bridge",
      "cafe",
      "door",
      "entrance",
      "info",
      "north",
      "office",
      "parking",
      "stairs",
      "toilet",
      "tree",
      "water",
    ]),
    size: z.number().positive().optional(),
    fill: z.string().trim().min(1).max(100).optional(),
    background: z.string().trim().min(1).max(100).optional(),
    label: shortText.optional(),
  }),
  z.strictObject({
    ...mapElementBase,
    type: z.literal("answerSlot"),
    questionId,
    x: z.number(),
    y: z.number(),
    w: z.number().positive().optional(),
    h: z.number().positive().optional(),
    label: shortText.optional(),
  }),
  z.strictObject({
    ...mapElementBase,
    type: z.literal("choiceMarker"),
    choiceId: shortText,
    x: z.number(),
    y: z.number(),
    r: z.number().positive().optional(),
    label: shortText.optional(),
  }),
]);

const mapSceneSchema = z.strictObject({
  viewBox: z.strictObject({
    width: z.number().positive(),
    height: z.number().positive(),
  }),
  palette: z.record(z.string(), z.string()).optional(),
  background: z.string().trim().min(1).max(100).optional(),
  border: z.string().trim().min(1).max(100).optional(),
  borderWidth: z.number().nonnegative().optional(),
  borderRadius: z.number().nonnegative().optional(),
  grid: z.strictObject({
    xStep: z.number().positive(),
    yStep: z.number().positive(),
    stroke: z.string().trim().min(1).max(100).optional(),
    strokeWidth: z.number().nonnegative().optional(),
  }).optional(),
  elements: z.array(mapElementSchema).min(1).max(500),
});

const groupHeaderBlockSchema = z.strictObject({
  type: z.literal("group_header"),
  title: shortText,
  instruction: bodyText,
});

const textBlockSchema = z.strictObject({
  type: z.literal("text"),
  text: bodyText,
  variant: z.enum(["title", "subtitle", "body", "muted"]).optional(),
});

const passageBlockSchema = z.strictObject({
  type: z.literal("passage"),
  title: shortText,
  paragraphs: z.array(bodyText).min(1).max(100),
});

const completionBlockSchema = z.strictObject({
  type: z.literal("completion_questions"),
  completionType: z.enum([
    "form_completion",
    "note_completion",
    "flow_chart_completion",
    "summary_completion",
    "sentence_completion",
    "table_completion",
  ]),
  title: shortText.optional(),
  presentation: z.strictObject({
    layout: z.enum(["list", "table", "flowchart"]).optional(),
    columns: z.array(shortText).min(1).max(10).optional(),
    density: z.enum(["comfortable", "compact"]).optional(),
  }).optional(),
  items: z.array(z.strictObject({
    questionId,
    prefix: z.string().max(2_000),
    suffix: z.string().max(2_000).optional(),
    width: z.number().positive().optional(),
    answer: objectiveAnswerSchema,
  })).min(1).max(40),
});

const mcqBlockSchema = z.strictObject({
  type: z.literal("mcq_questions"),
  questions: z.array(z.strictObject({
    questionId,
    questionText: bodyText,
    options: z.array(radioOptionSchema).min(2).max(20),
    answer: answerText,
  })).min(1).max(40),
});

const trueFalseNotGivenBlockSchema = z.strictObject({
  type: z.literal("true_false_not_given_questions"),
  questions: z.array(z.strictObject({
    questionId,
    questionText: bodyText,
    answer: z.enum(["TRUE", "FALSE", "NOT GIVEN"]),
  })).min(1).max(40),
});

const yesNoNotGivenBlockSchema = z.strictObject({
  type: z.literal("yes_no_not_given_questions"),
  questions: z.array(z.strictObject({
    questionId,
    questionText: bodyText,
    answer: z.enum(["YES", "NO", "NOT GIVEN"]),
  })).min(1).max(40),
});

const matchingQuestionSchema = z.strictObject({
  questionId,
  label: bodyText,
  answer: answerText,
});

const featureMatchingBlockSchema = z.strictObject({
  type: z.literal("feature_matching_questions"),
  title: shortText.optional(),
  options: z.array(bodyText).min(2).max(30),
  placeholder: shortText.optional(),
  questions: z.array(matchingQuestionSchema).min(1).max(40),
});

const headingMatchingBlockSchema = z.strictObject({
  type: z.literal("heading_matching_questions"),
  title: shortText.optional(),
  options: z.array(bodyText).min(2).max(30),
  placeholder: shortText.optional(),
  questions: z.array(matchingQuestionSchema.extend({
    paragraphIndex: z.number().int().nonnegative().max(99),
  })).min(1).max(40),
});

const multipleSelectionBlockSchema = z.strictObject({
  type: z.literal("multiple_selection_question"),
  questionNumber: shortText.optional(),
  questionText: bodyText,
  questionIds: z.array(questionId).min(2).max(10),
  maxSelections: z.number().int().min(2).max(10),
  options: z.array(radioOptionSchema).min(3).max(20),
  answers: z.array(answerText).min(2).max(10),
});

const mapLabelingBlockSchema = z.strictObject({
  type: z.literal("map_labeling_questions"),
  title: shortText.optional(),
  response: z.discriminatedUnion("type", [
    z.strictObject({
      type: z.literal("choice"),
      choices: z.array(z.strictObject({
        id: shortText,
        label: bodyText,
      })).min(2).max(30),
      presentation: z.enum(["slots_on_map", "choices_on_map"]).optional(),
    }),
    z.strictObject({
      type: z.literal("text"),
      placeholder: shortText.optional(),
      wordLimit: shortText.optional(),
    }),
  ]),
  questions: z.array(z.strictObject({
    questionId,
    prompt: bodyText.optional(),
    answer: objectiveAnswerSchema,
  })).min(1).max(40),
  map: mapSceneSchema,
});

const spacerBlockSchema = z.strictObject({
  type: z.literal("spacer"),
  size: z.number().nonnegative().max(500).optional(),
});

export const objectiveContentBlockSchema = z.discriminatedUnion("type", [
  groupHeaderBlockSchema,
  textBlockSchema,
  passageBlockSchema,
  completionBlockSchema,
  mcqBlockSchema,
  trueFalseNotGivenBlockSchema,
  yesNoNotGivenBlockSchema,
  featureMatchingBlockSchema,
  headingMatchingBlockSchema,
  multipleSelectionBlockSchema,
  mapLabelingBlockSchema,
  spacerBlockSchema,
]);

const objectiveContentPartSchema = z.strictObject({
  id: z.number().int().positive().max(4),
  label: shortText,
  instructionRange: shortText,
  instructionText: bodyText,
  blocks: z.array(objectiveContentBlockSchema).min(1).max(100),
});

export const objectiveContentDocumentSchema = z.strictObject({
  schemaVersion: z.literal(1),
  contentKey: z.string().trim().min(1).max(100).regex(/^[a-z0-9][a-z0-9._-]*$/),
  id: z.number().int().positive(),
  section: z.enum(["listening", "reading"]),
  name: shortText,
  listeningAudio: z.strictObject({ key: shortText }).optional(),
  parts: z.array(objectiveContentPartSchema).min(3).max(4),
}).superRefine((document, context) => {
  const partIds = document.parts.map((part) => part.id);
  const expectedPartIds = Array.from(
    { length: document.parts.length },
    (_, index) => index + 1,
  );
  if (partIds.some((id, index) => id !== expectedPartIds[index])) {
    context.addIssue({
      code: "custom",
      path: ["parts"],
      message: "Part IDs must be contiguous and ordered from 1.",
    });
  }

  const expectedPartCount = document.section === "listening" ? 4 : 3;
  if (document.parts.length !== expectedPartCount) {
    context.addIssue({
      code: "custom",
      path: ["parts"],
      message: `${document.section} must contain ${expectedPartCount} parts.`,
    });
  }
  if (document.section === "listening" && !document.listeningAudio) {
    context.addIssue({
      code: "custom",
      path: ["listeningAudio"],
      message: "Listening content must declare one continuous audio source.",
    });
  }
  if (document.section === "reading" && document.listeningAudio) {
    context.addIssue({
      code: "custom",
      path: ["listeningAudio"],
      message: "Reading content cannot declare Listening audio.",
    });
  }

  const allQuestionIds: number[] = [];
  document.parts.forEach((part, partIndex) => {
    const partQuestionIds = part.blocks.flatMap(getObjectiveBlockQuestionIds);
    allQuestionIds.push(...partQuestionIds);
    if (document.section === "listening" && partQuestionIds.length !== 10) {
      context.addIssue({
        code: "custom",
        path: ["parts", partIndex, "blocks"],
        message: `Listening part ${part.id} must contain 10 answer slots.`,
      });
    }

    part.blocks.forEach((block, blockIndex) => {
      const path: Array<string | number> = [
        "parts",
        partIndex,
        "blocks",
        blockIndex,
      ];
      if (block.type === "mcq_questions") {
        block.questions.forEach((question, questionIndex) => {
          if (!question.options.some((option) => option.value === question.answer)) {
            context.addIssue({
              code: "custom",
              path: [...path, "questions", questionIndex, "answer"],
              message: "The correct answer must reference an MCQ option value.",
            });
          }
        });
      }
      if (
        block.type === "feature_matching_questions" ||
        block.type === "heading_matching_questions"
      ) {
        block.questions.forEach((question, questionIndex) => {
          if (!block.options.includes(question.answer)) {
            context.addIssue({
              code: "custom",
              path: [...path, "questions", questionIndex, "answer"],
              message: "The correct answer must reference a matching option.",
            });
          }
        });
      }
      if (block.type === "heading_matching_questions") {
        const paragraphIndexes = block.questions.map(
          (question) => question.paragraphIndex,
        );
        if (new Set(paragraphIndexes).size !== paragraphIndexes.length) {
          context.addIssue({
            code: "custom",
            path: [...path, "questions"],
            message: "Heading-matching paragraph indexes must be unique.",
          });
        }
      }
      if (block.type === "multiple_selection_question") {
        const optionValues = new Set(block.options.map((option) => option.value));
        if (
          block.questionIds.length !== block.answers.length ||
          block.maxSelections !== block.answers.length
        ) {
          context.addIssue({
            code: "custom",
            path,
            message: "Selection answer slots, answers, and maxSelections must match.",
          });
        }
        if (
          new Set(block.answers).size !== block.answers.length ||
          block.answers.some((answer) => !optionValues.has(answer))
        ) {
          context.addIssue({
            code: "custom",
            path: [...path, "answers"],
            message: "Selection answers must be unique option values.",
          });
        }
      }
      if (block.type === "map_labeling_questions") {
        const mapQuestionIds = new Set(
          block.map.elements.flatMap((element) =>
            element.type === "answerSlot" ? [element.questionId] : [],
          ),
        );
        block.questions.forEach((question, questionIndex) => {
          if (!mapQuestionIds.has(question.questionId)) {
            context.addIssue({
              code: "custom",
              path: [...path, "questions", questionIndex, "questionId"],
              message: "Every map question must have an answerSlot element.",
            });
          }
          if (block.response.type === "choice") {
            const choices = new Set(block.response.choices.map((choice) => choice.id));
            const answers = Array.isArray(question.answer)
              ? question.answer
              : [question.answer];
            if (answers.some((answer) => !choices.has(answer))) {
              context.addIssue({
                code: "custom",
                path: [...path, "questions", questionIndex, "answer"],
                message: "The correct answer must reference a map choice.",
              });
            }
          }
        });
      }
    });
  });

  const sortedQuestionIds = [...allQuestionIds].sort((a, b) => a - b);
  const expectedQuestionIds = Array.from({ length: 40 }, (_, index) => index + 1);
  if (
    sortedQuestionIds.length !== 40 ||
    sortedQuestionIds.some((id, index) => id !== expectedQuestionIds[index])
  ) {
    context.addIssue({
      code: "custom",
      path: ["parts"],
      message: "Objective question IDs must be unique and contiguous from 1 to 40.",
    });
  }
});

export type ObjectiveContentBlock = z.infer<typeof objectiveContentBlockSchema>;
export type ObjectiveContentDocument = z.infer<typeof objectiveContentDocumentSchema>;
export type ObjectiveContentPart = ObjectiveContentDocument["parts"][number];
export type ObjectiveBlockType = ObjectiveContentBlock["type"];
export type ObjectiveAnswerValue = z.infer<typeof objectiveAnswerSchema>;
export type ObjectiveAnswerKey = Record<string, ObjectiveAnswerValue>;
export type ObjectiveTextVariant = Extract<
  ObjectiveContentBlock,
  { type: "text" }
>["variant"];
export type ObjectiveCompletionType = Extract<
  ObjectiveContentBlock,
  { type: "completion_questions" }
>["completionType"];
export type ObjectiveCompletionPresentation = Extract<
  ObjectiveContentBlock,
  { type: "completion_questions" }
>["presentation"];
export type ObjectiveRadioOption = Extract<
  ObjectiveContentBlock,
  { type: "mcq_questions" }
>["questions"][number]["options"][number];
export type ObjectiveInputLine = Extract<
  ObjectiveContentBlock,
  { type: "completion_questions" }
>["items"][number];
export type ObjectiveMatchingQuestion = Extract<
  ObjectiveContentBlock,
  { type: "feature_matching_questions" }
>["questions"][number];
export type ObjectiveMapScene = Extract<
  ObjectiveContentBlock,
  { type: "map_labeling_questions" }
>["map"];
export type ObjectiveMapElement = ObjectiveMapScene["elements"][number];
export type ObjectiveMapPoint = [number, number];
export type ObjectiveMapSymbolElement = Extract<
  ObjectiveMapElement,
  { type: "symbol" }
>;
export type ObjectiveMapAnswerSlotElement = Extract<
  ObjectiveMapElement,
  { type: "answerSlot" }
>;
export type ObjectiveMapChoice = Extract<
  Extract<ObjectiveContentBlock, { type: "map_labeling_questions" }>["response"],
  { type: "choice" }
>["choices"][number];
export type ObjectiveMapResponse = Extract<
  ObjectiveContentBlock,
  { type: "map_labeling_questions" }
>["response"];
export type ObjectiveMapQuestion = Extract<
  ObjectiveContentBlock,
  { type: "map_labeling_questions" }
>["questions"][number];
export type ObjectiveCollectionPackMetadata = {
  id: number;
  key: string;
  collectionId: "official" | "cambridge" | "curated";
  label: string;
  selectionVisible: boolean;
  isDemo?: boolean;
};

export function parseObjectiveContentDocument(input: unknown): ObjectiveContentDocument {
  return objectiveContentDocumentSchema.parse(input);
}

export function getObjectiveContentJsonSchema() {
  return z.toJSONSchema(objectiveContentDocumentSchema, {
    target: "draft-07",
  });
}

export function getObjectiveBlockQuestionIds(
  block: ObjectiveContentBlock,
): number[] {
  switch (block.type) {
    case "completion_questions":
      return block.items.map((item) => item.questionId);
    case "mcq_questions":
    case "true_false_not_given_questions":
    case "yes_no_not_given_questions":
    case "feature_matching_questions":
    case "heading_matching_questions":
    case "map_labeling_questions":
      return block.questions.map((question) => question.questionId);
    case "multiple_selection_question":
      return [...block.questionIds];
    case "group_header":
    case "text":
    case "passage":
    case "spacer":
      return [];
  }
}

export function getObjectiveAnswerKey(
  document: ObjectiveContentDocument,
): AnswerKey {
  const answerKey: AnswerKey = {};
  document.parts.forEach((part) => {
    part.blocks.forEach((block) => {
      switch (block.type) {
        case "completion_questions":
          block.items.forEach((item) => {
            answerKey[item.questionId] = item.answer;
          });
          break;
        case "mcq_questions":
        case "true_false_not_given_questions":
        case "yes_no_not_given_questions":
        case "feature_matching_questions":
        case "heading_matching_questions":
        case "map_labeling_questions":
          block.questions.forEach((question) => {
            answerKey[question.questionId] = question.answer;
          });
          break;
        case "multiple_selection_question":
          block.questionIds.forEach((id, index) => {
            const answer = block.answers[index];
            if (answer === undefined) {
              throw new Error(
                `Missing embedded answer for multiple-selection question ${id}.`,
              );
            }
            answerKey[id] = answer;
          });
          break;
        case "group_header":
        case "text":
        case "passage":
        case "spacer":
          break;
      }
    });
  });
  return answerKey;
}
