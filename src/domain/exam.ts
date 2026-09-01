import type {
  AnswerKey,
  AnswerMap,
  ObjectiveResult,
  SectionKey,
} from './types'
import {
  getObjectiveAnswerKey,
  getObjectiveBlockQuestionIds,
  type ObjectiveContentDocument,
} from './objectiveContent'

export const SECTION_ORDER: SectionKey[] = ['listening', 'reading', 'writing', 'speaking']

export const SECTION_META: Record<SectionKey, {
  label: string
  durationSeconds: number
  structure: string
}> = {
  listening: { label: 'Listening', durationSeconds: 30 * 60, structure: '4 parts · 40 questions' },
  reading: { label: 'Reading', durationSeconds: 60 * 60, structure: '3 passages · 40 questions' },
  writing: { label: 'Writing', durationSeconds: 60 * 60, structure: '2 tasks · 150/250 words' },
  speaking: { label: 'Speaking', durationSeconds: 14 * 60, structure: '3 parts · 11–14 minutes' },
}

export function normalizeAnswer(value: string): string {
  return value.trim().toLowerCase().replace(/[.,]/g, '')
}

export function calculateBandScore(raw: number, section: 'listening' | 'reading'): number {
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

export function getPartQuestionIds(
  document: ObjectiveContentDocument,
  partId: number,
): number[] {
  const part = document.parts.find((candidate) => candidate.id === partId)
  if (!part) return []
  return part.blocks.flatMap(getObjectiveBlockQuestionIds)
}

export function countWords(value: string): number {
  const trimmed = value.trim()
  return trimmed ? trimmed.split(/\s+/).length : 0
}

export function formatTime(seconds: number): string {
  const wholeSeconds = Math.floor(Math.max(0, seconds))
  const minutes = Math.floor(wholeSeconds / 60)
  const remainder = wholeSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
}

export function calculateOverallBand(values: number[]): number | null {
  if (values.length !== 4) return null
  return Math.round((values.reduce((sum, value) => sum + value, 0) / 4) * 2) / 2
}
