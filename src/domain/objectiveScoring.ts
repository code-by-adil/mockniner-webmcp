import type { AnswerMap, ObjectiveResult } from "./types";
import { type ObjectiveContentDocument } from "./objectiveContent";

export function normalizeAnswer(value: string): string {
  return value.trim().toLowerCase().replace(/[.,]/g, "");
}

function calculateBandScore(
  raw: number,
  section: "listening" | "reading",
): number {
  const thresholds =
    section === "listening"
      ? [
          [39, 9],
          [37, 8.5],
          [35, 8],
          [32, 7.5],
          [30, 7],
          [26, 6.5],
          [23, 6],
          [18, 5.5],
          [16, 5],
          [13, 4.5],
          [10, 4],
        ]
      : [
          [39, 9],
          [37, 8.5],
          [35, 8],
          [33, 7.5],
          [30, 7],
          [27, 6.5],
          [23, 6],
          [19, 5.5],
          [15, 5],
          [12, 4.5],
          [10, 4],
        ];
  return thresholds.find(([minimum]) => raw >= minimum)?.[1] ?? 0;
}

export function objectiveAnswerMatches(
  userAnswer: string,
  correctAnswer: string | string[],
): boolean {
  const normalized = normalizeAnswer(userAnswer);
  const candidates = Array.isArray(correctAnswer)
    ? correctAnswer
    : [correctAnswer];
  return candidates.some(
    (candidate) => normalizeAnswer(candidate) === normalized,
  );
}

export function gradeObjectiveDocument(
  document: ObjectiveContentDocument,
  answers: AnswerMap,
): ObjectiveResult {
  const correctQuestionIds: number[] = [];
  let answered = 0;
  const check = (questionId: number, correct: string | string[]) => {
    const answer = answers[questionId] ?? "";
    if (answer.trim()) answered += 1;
    if (answer.trim() && objectiveAnswerMatches(answer, correct))
      correctQuestionIds.push(questionId);
  };
  for (const part of document.parts) {
    for (const block of part.blocks) {
      switch (block.type) {
        case "multiple_selection_question": {
          const remaining = new Set(block.answers.map(normalizeAnswer));
          for (const id of block.questionIds) {
            const answer = normalizeAnswer(answers[id] ?? "");
            if (answer) answered += 1;
            if (answer && remaining.delete(answer)) correctQuestionIds.push(id);
          }
          break;
        }
        case "completion_questions":
          block.items.forEach((question) =>
            check(question.questionId, question.answer),
          );
          break;
        case "mcq_questions":
        case "true_false_not_given_questions":
        case "yes_no_not_given_questions":
        case "feature_matching_questions":
        case "heading_matching_questions":
        case "map_labeling_questions":
          block.questions.forEach((question) =>
            check(question.questionId, question.answer),
          );
          break;
      }
    }
  }
  correctQuestionIds.sort((a, b) => a - b);
  const raw = correctQuestionIds.length;
  return {
    section: document.section,
    raw,
    total: 40,
    band: calculateBandScore(raw, document.section),
    answered,
    correctQuestionIds,
  };
}
