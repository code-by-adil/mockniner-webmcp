import type { z } from "zod";
import {
  objectiveContentDocumentShapeSchema,
  type ObjectiveContentBlock,
  type ObjectiveContentDocument,
} from "./objectiveCore";

function validateObjectiveContentDocument(
  document: ObjectiveContentDocument,
  context: z.RefinementCtx,
): void {
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

  if (document.section === "listening" && document.audio.type === "kokoro") {
    const speakerIds = document.audio.speakers.map((speaker) => speaker.id);
    if (new Set(speakerIds).size !== speakerIds.length) {
      context.addIssue({
        code: "custom",
        path: ["audio", "speakers"],
        message: "Kokoro speaker IDs must be unique.",
      });
    }

    const knownSpeakers = new Set(speakerIds);
    const voiceBySpeaker = new Map(
      document.audio.speakers.map((speaker) => [speaker.id, speaker.voice] as const),
    );
    const speakerLimits = [
      { minimum: 2, maximum: 2 },
      { minimum: 1, maximum: 1 },
      { minimum: 2, maximum: 4 },
      { minimum: 1, maximum: 1 },
    ] as const;
    let speechCharacters = 0;
    let silenceDurationMs = 0;
    document.audio.parts.forEach((audioPart, partIndex) => {
      if (audioPart.partId !== partIndex + 1) {
        context.addIssue({
          code: "custom",
          path: ["audio", "parts", partIndex, "partId"],
          message: "Kokoro audio part IDs must be contiguous and ordered from 1.",
        });
      }

      if (!audioPart.segments.some((segment) => segment.type === "speech")) {
        context.addIssue({
          code: "custom",
          path: ["audio", "parts", partIndex, "segments"],
          message: `Kokoro audio part ${audioPart.partId} must contain speech.`,
        });
      }

      const partSpeakerIds = [...new Set(
        audioPart.segments.flatMap((segment) =>
          segment.type === "speech" ? [segment.speakerId] : []),
      )];
      const limit = speakerLimits[partIndex];
      if (
        limit &&
        (partSpeakerIds.length < limit.minimum || partSpeakerIds.length > limit.maximum)
      ) {
        context.addIssue({
          code: "custom",
          path: ["audio", "parts", partIndex, "segments"],
          message: limit.minimum === limit.maximum
            ? `Kokoro audio part ${audioPart.partId} must use exactly ${limit.minimum} speaker${limit.minimum === 1 ? "" : "s"}.`
            : `Kokoro audio part ${audioPart.partId} must use between ${limit.minimum} and ${limit.maximum} speakers.`,
        });
      }

      const partVoices = partSpeakerIds.flatMap((speakerId) => {
        const voice = voiceBySpeaker.get(speakerId);
        return voice ? [voice] : [];
      });
      if (new Set(partVoices).size !== partVoices.length) {
        context.addIssue({
          code: "custom",
          path: ["audio", "parts", partIndex, "segments"],
          message: `Speakers sharing Kokoro audio part ${audioPart.partId} must use distinct voices.`,
        });
      }

      audioPart.segments.forEach((segment, segmentIndex) => {
        if (segment.type === "speech") {
          speechCharacters += segment.text.length;
          if (!knownSpeakers.has(segment.speakerId)) {
            context.addIssue({
              code: "custom",
              path: ["audio", "parts", partIndex, "segments", segmentIndex, "speakerId"],
              message: `Kokoro speaker ${segment.speakerId} is not declared.`,
            });
          }
        } else {
          silenceDurationMs += segment.durationMs;
        }
      });
    });
    if (speechCharacters > 60_000) {
      context.addIssue({
        code: "custom",
        path: ["audio", "parts"],
        message: "A Kokoro listening script cannot exceed 60,000 characters.",
      });
    }
    if (silenceDurationMs > 1_800_000) {
      context.addIssue({
        code: "custom",
        path: ["audio", "parts"],
        message: "A Kokoro listening script cannot exceed 30 minutes of silence.",
      });
    }
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
}

export const objectiveContentDocumentSchema =
  objectiveContentDocumentShapeSchema.superRefine(validateObjectiveContentDocument);

export function parseObjectiveContentDocument(input: unknown): ObjectiveContentDocument {
  return objectiveContentDocumentSchema.parse(input);
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
