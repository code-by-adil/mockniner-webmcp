import { CheckboxGroup } from "@/shared/ui/exam/CheckboxGroup";
import type {
  ObjectiveBlockProps,
} from "@/modules/ielts/objective/types/ObjectiveRenderProps";

export function MultipleSelectionQuestionBlock({
  block,
  ctx,
}: ObjectiveBlockProps<"multiple_selection_question">) {
  const selectedValues = block.questionIds
    .map((id) => ctx.answers[id])
    .filter((value): value is string => Boolean(value));

  return (
    <div data-question-ids={block.questionIds.join(' ')}>
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
    </div>
  );
}
