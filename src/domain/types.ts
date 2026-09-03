import type { WritingTask } from './writingContent'

export type SectionKey = 'listening' | 'reading' | 'writing' | 'speaking'

type AnswerValue = string
export type AnswerMap = Record<number, AnswerValue>

export type SpeakingPrompt = {
  id: number
  part: 1 | 2 | 3
  label: string
  text: string
  preparationSeconds: number
  responseSeconds: number
  cuePoints?: string[]
}

export type ObjectiveResult = {
  section: 'listening' | 'reading'
  raw: number
  total: 40
  band: number
  answered: number
  correctQuestionIds: number[]
}

export type ObjectiveSubmission = {
  attemptId: string
  contentKey: string
  section: 'listening' | 'reading'
  answers: AnswerMap
  result: ObjectiveResult
  startedAt: string
  submittedAt: string
}

export type WritingSubmittedTask = {
  task: WritingTask
  response: string
  wordCount: number
}

export type WritingSubmission = {
  attemptId: string
  contentKey: string
  tasks: [WritingSubmittedTask, WritingSubmittedTask]
  startedAt: string
  submittedAt: string
}

export type WritingAnnotation = {
  id: string
  taskNumber: 1 | 2
  originalText: string
  suggestion: string
  explanation: string
  type: 'grammar' | 'vocabulary' | 'coherence' | 'other'
  shortTitle?: string
  startOffset?: number
  endOffset?: number
  contextBefore?: string
  contextAfter?: string
  issueTitle?: string
  severity?: 'critical' | 'major' | 'minor'
  ruleId?: string
  incorrectExample?: string
  correctExample?: string
}

export type WritingTaskEvaluation = {
  band: number
  taskAchievement: number
  coherenceCohesion: number
  lexicalResource: number
  grammaticalRange: number
  feedback: string
  annotations: WritingAnnotation[]
}

export type WritingEvaluation = {
  revision?: number
  attemptId: string
  overallBand: number
  summary: string
  task1: WritingTaskEvaluation
  task2: WritingTaskEvaluation
  evaluatedAt: string
}

export type SpeakingSubmission = {
  attemptId: string
  contentKey: string
  responses: SpeakingSubmittedResponse[]
  startedAt: string
  submittedAt: string
}

type SpeakingSubmittedResponse = {
  status: 'answered' | 'skipped'
  recordingId: string
  promptId: number
  partLabel: string
  sequence: number
  promptText: string
  timeLimitSeconds: number
  durationMs: number
  transcript: string
}

export type SpeakingEvaluation = import('./speakingEvaluation').SpeakingEvaluationInput & {
  evaluatedAt: string
}
