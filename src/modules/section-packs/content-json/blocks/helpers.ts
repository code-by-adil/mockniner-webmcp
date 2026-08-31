export function findCorrectAnswer(
  questions: ReadonlyArray<{
    questionId: number;
    answer: string | string[];
  }>,
  questionId: number,
) {
  return questions.find((question) => question.questionId === questionId)?.answer;
}
