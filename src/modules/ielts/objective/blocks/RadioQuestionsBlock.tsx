import { RadioGroup } from "@/shared/ui/exam/RadioGroup";
import type {
  ObjectiveBlockProps,
} from "@/modules/ielts/objective/types/ObjectiveRenderProps";

export function MCQQuestionsBlock({
  block,
  ctx,
}: ObjectiveBlockProps<"mcq_questions">) {
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
}: ObjectiveBlockProps<"true_false_not_given_questions">) {
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
}: ObjectiveBlockProps<"yes_no_not_given_questions">) {
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
