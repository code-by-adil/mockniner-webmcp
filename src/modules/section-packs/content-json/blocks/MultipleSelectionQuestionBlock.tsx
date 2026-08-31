import React from "react";
import { CheckboxGroup } from "@/shared/ui/exam/CheckboxGroup";
import type {
  ObjectiveWebBlockRendererProps,
} from "@/modules/section-packs/content-json/types";

export function MultipleSelectionQuestionBlock({
  block,
  ctx,
}: ObjectiveWebBlockRendererProps<"multiple_selection_question">) {
  const selectedValues = block.questionIds
    .map((id) => ctx.answers[id])
    .filter((value): value is string => Boolean(value));

  return (
    <CheckboxGroup
      id={block.questionNumber ?? block.questionIds.join("-")}
      questionNumber={block.questionNumber ?? block.questionIds.join("-")}
      questionText={block.questionText}
      options={block.options}
      selectedValues={selectedValues}
      maxSelections={block.maxSelections}
      isReviewMode={ctx.isReviewMode}
      correctAnswers={ctx.isReviewMode ? block.answers : undefined}
      onChange={(values) => {
        block.questionIds.forEach((id, index) => {
          ctx.onAnswerChange(id, values[index] ?? "");
        });
      }}
    />
  );
}
