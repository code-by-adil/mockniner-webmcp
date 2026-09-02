import type {
  AnswerKey,
  AnswerMap,
  ObjectiveResult,
} from './types'
import {
  getObjectiveAnswerKey,
  type ObjectiveContentDocument,
} from './objectiveContent'

export function normalizeAnswer(value: string): string {
  return value.trim().toLowerCase().replace(/[.,]/g, '')
}

function calculateBandScore(raw: number, section: 'listening' | 'reading'): number {
  const thresholds = section === 'listening'
    ? [[39, 9], [37, 8.5], [35, 8], [32, 7.5], [30, 7], [26, 6.5], [23, 6], [18, 5.5], [16, 5], [13, 4.5], [10, 4]]
    : [[39, 9], [37, 8.5], [35, 8], [33, 7.5], [30, 7], [27, 6.5], [23, 6], [19, 5.5], [15, 5], [12, 4.5], [10, 4]]
  return thresholds.find(([minimum]) => raw >= minimum)?.[1] ?? 0
}

function answerMatches(userAnswer: string, correctAnswer: string | string[]): boolean {
  const normalized = normalizeAnswer(userAnswer)
  const candidates = Array.isArray(correctAnswer) ? correctAnswer : [correctAnswer]
  return candidates.some((candidate) => normalizeAnswer(candidate) === normalized)
}

function gradeObjectiveAnswers(
  section: 'listening' | 'reading',
  answerKey: AnswerKey,
  answers: AnswerMap,
): ObjectiveResult {
  const correctQuestionIds = Object.entries(answerKey)
    .filter(([questionId, correct]) => answerMatches(answers[Number(questionId)] ?? '', correct))
    .map(([questionId]) => Number(questionId))
  const raw = correctQuestionIds.length
  return {
    section,
    raw,
    total: 40,
    band: calculateBandScore(raw, section),
    answered: Object.values(answers).filter((answer) => answer.trim()).length,
    correctQuestionIds,
  }
}

export function gradeObjectiveDocument(
  document: ObjectiveContentDocument,
  answers: AnswerMap,
): ObjectiveResult {
  return gradeObjectiveAnswers(
    document.section,
    getObjectiveAnswerKey(document),
    answers,
  )
}
