import { RadioGroup } from "@/shared/ui/exam/RadioGroup";
import type {
  ObjectiveWebBlockRendererProps,
} from "@/modules/section-packs/objective/types/ObjectiveWebRenderContext";

export function MCQQuestionsBlock({
  block,
  ctx,
}: ObjectiveWebBlockRendererProps<"mcq_questions">) {
  return (
    <>
      {block.questions.map((question) => (
        <RadioGroup
          key={question.questionId}
          id={question.questionId}
          questionNumber={question.questionId}
          questionText={question.questionText}
          options={question.options}
          value={ctx.answers[question.questionId]}
          onChange={(value) => ctx.onAnswerChange(question.questionId, value)}
          isReviewMode={ctx.isReviewMode}
          correctAnswer={ctx.isReviewMode ? question.answer : undefined}
        />
      ))}
    </>
  );
}

export function TrueFalseNotGivenQuestionsBlock({
  block,
  ctx,
}: ObjectiveWebBlockRendererProps<"true_false_not_given_questions">) {
  return (
    <>
      {block.questions.map((question) => (
        <RadioGroup
          key={question.questionId}
          id={question.questionId}
          questionNumber={question.questionId}
          questionText={question.questionText}
          options={["TRUE", "FALSE", "NOT GIVEN"].map((option) => ({
            value: option,
            label: option,
          }))}
          value={ctx.answers[question.questionId]}
          onChange={(value) => ctx.onAnswerChange(question.questionId, value)}
          isReviewMode={ctx.isReviewMode}
          correctAnswer={ctx.isReviewMode ? question.answer : undefined}
        />
      ))}
    </>
  );
}

export function YesNoNotGivenQuestionsBlock({
  block,
  ctx,
}: ObjectiveWebBlockRendererProps<"yes_no_not_given_questions">) {
  return (
    <>
      {block.questions.map((question) => (
        <RadioGroup
          key={question.questionId}
          id={question.questionId}
          questionNumber={question.questionId}
          questionText={question.questionText}
          options={["YES", "NO", "NOT GIVEN"].map((option) => ({
            value: option,
            label: option,
          }))}
          value={ctx.answers[question.questionId]}
          onChange={(value) => ctx.onAnswerChange(question.questionId, value)}
          isReviewMode={ctx.isReviewMode}
          correctAnswer={ctx.isReviewMode ? question.answer : undefined}
        />
      ))}
    </>
  );
}
