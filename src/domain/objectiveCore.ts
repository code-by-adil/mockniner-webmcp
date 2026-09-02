import { z } from "zod";
import { listeningAudioSchema } from "./objectiveListeningAudio";
import { objectiveMapSceneSchema } from "./objectiveMap";

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
  map: objectiveMapSceneSchema,
});

const spacerBlockSchema = z.strictObject({
  type: z.literal("spacer"),
  size: z.number().nonnegative().max(500).optional(),
});

const objectiveContentBlockSchema = z.discriminatedUnion("type", [
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
  instructionText: bodyText,
  blocks: z.array(objectiveContentBlockSchema).min(1).max(100),
});

const objectiveContentDocumentBase = {
  schemaVersion: z.literal(1),
  contentKey: z.string().trim().min(1).max(100).regex(/^[a-z0-9][a-z0-9._-]*$/),
  name: shortText,
  source: z.literal("agent").optional(),
};

export const listeningContentDocumentSchema = z.strictObject({
  ...objectiveContentDocumentBase,
  section: z.literal("listening"),
  audio: listeningAudioSchema,
  parts: z.array(objectiveContentPartSchema).length(4),
});

export const readingContentDocumentSchema = z.strictObject({
  ...objectiveContentDocumentBase,
  section: z.literal("reading"),
  parts: z.array(objectiveContentPartSchema).length(3),
});

export const objectiveContentDocumentShapeSchema = z.discriminatedUnion("section", [
  listeningContentDocumentSchema,
  readingContentDocumentSchema,
]);

export type ObjectiveContentBlock = z.infer<typeof objectiveContentBlockSchema>;
export type ObjectiveContentDocument = z.infer<typeof objectiveContentDocumentShapeSchema>;
export type ListeningContentDocument = Extract<
  ObjectiveContentDocument,
  { section: "listening" }
>;
export type ReadingContentDocument = Extract<
  ObjectiveContentDocument,
  { section: "reading" }
>;
export type ObjectiveBlockType = ObjectiveContentBlock["type"];
export type ObjectiveCompletionType = Extract<
  ObjectiveContentBlock,
  { type: "completion_questions" }
>["completionType"];
export type ObjectiveInputLine = Extract<
  ObjectiveContentBlock,
  { type: "completion_questions" }
>["items"][number];
