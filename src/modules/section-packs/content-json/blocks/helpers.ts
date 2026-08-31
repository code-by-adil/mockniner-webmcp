import type { AnswerKey } from "@ielts/shared";

export function getCorrectAnswer(answerKey: AnswerKey | undefined, id: number) {
  return answerKey?.[id];
}
