import type {
  AnswerMap,
  ObjectiveSubmission,
  SectionKey,
  SpeakingSubmission,
  SpeakingEvaluation,
  WritingEvaluation,
  WritingSubmission,
} from './types'
import { SECTION_ORDER } from './exam'
import { z } from 'zod'
import {
  answerMapSchema,
  objectiveSubmissionSchema,
  speakingSubmissionSchema,
  speakingEvaluationSchema,
  writingEvaluationSchema,
  writingSubmissionSchema,
} from './attemptValidation'
import {
  objectiveContentDocumentSchema,
  type ObjectiveContentDocument,
} from './objectiveContent'

export type ExamMode = 'full' | 'section'
export type SessionView = 'home' | 'exam' | 'transition' | 'result' | 'review'

export type ListeningPlaybackState = {
  currentTimeSec: number
  volume: number
}

type ReviewReturnView = 'home' | 'result'

export type ExamReview =
  | {
      kind: 'objective'
      section: 'listening' | 'reading'
      submission: ObjectiveSubmission
      document: ObjectiveContentDocument
      part: number
      returnTo: ReviewReturnView
    }
  | {
      kind: 'writing'
      section: 'writing'
      submission: WritingSubmission
      evaluation: WritingEvaluation
      part: number
      returnTo: ReviewReturnView
    }
  | {
      kind: 'speaking'
      section: 'speaking'
      submission: SpeakingSubmission
      evaluation: SpeakingEvaluation
      part: number
      returnTo: ReviewReturnView
    }

export type ExamSession = {
  view: SessionView
  mode: ExamMode | null
  currentSection: SectionKey | null
  partBySection: Record<SectionKey, number>
  secondsRemaining: Record<SectionKey, number>
  answers: { listening: AnswerMap; reading: AnswerMap }
  writingDrafts: { 1: string; 2: string }
  listeningPlayback: ListeningPlaybackState
  objectiveSubmissions: Partial<
    Record<'listening' | 'reading', ObjectiveSubmission>
  >
  writingSubmission?: WritingSubmission
  writingEvaluation?: WritingEvaluation
  speakingSubmission?: SpeakingSubmission
  speakingEvaluation?: SpeakingEvaluation
  review?: ExamReview
  completedSections: SectionKey[]
  startedAt?: string
  startedAtBySection: Partial<Record<SectionKey, string>>
}

export type SessionAction =
  | { type: 'START'; mode: ExamMode; section: SectionKey; startedAt: string }
  | { type: 'RESUME'; startedAt: string }
  | { type: 'SET_PART'; section: SectionKey; part: number }
  | { type: 'SET_ANSWER'; section: 'listening' | 'reading'; questionId: number; value: string }
  | { type: 'SET_WRITING'; task: 1 | 2; value: string }
  | { type: 'SET_LISTENING_PLAYBACK'; playback: ListeningPlaybackState }
  | { type: 'TICK'; section: SectionKey }
  | { type: 'COMPLETE_OBJECTIVE'; submission: ObjectiveSubmission }
  | { type: 'COMPLETE_WRITING'; submission: WritingSubmission }
  | { type: 'ATTACH_WRITING_EVALUATION'; evaluation: WritingEvaluation }
  | { type: 'COMPLETE_SPEAKING'; submission: SpeakingSubmission }
  | { type: 'ATTACH_SPEAKING_EVALUATION'; evaluation: SpeakingEvaluation }
  | { type: 'CONTINUE'; startedAt: string }
  | { type: 'OPEN_REVIEW'; review: ExamReview }
  | { type: 'CLOSE_REVIEW' }
  | { type: 'GO_HOME' }
  | { type: 'RESET' }

export const SESSION_STORAGE_KEY = 'ielts-practice-session-v4'

export const initialSession: ExamSession = {
  view: 'home',
  mode: null,
  currentSection: null,
  partBySection: { listening: 1, reading: 1, writing: 1, speaking: 1 },
  secondsRemaining: {
    listening: 30 * 60,
    reading: 60 * 60,
    writing: 60 * 60,
    speaking: 14 * 60,
  },
  answers: { listening: {}, reading: {} },
  writingDrafts: { 1: '', 2: '' },
  listeningPlayback: { currentTimeSec: 0, volume: 0.85 },
  objectiveSubmissions: {},
  completedSections: [],
  startedAtBySection: {},
}

const sectionSchema = z.enum(['listening', 'reading', 'writing', 'speaking'])
const timestampSchema = z.iso.datetime({ offset: true })
const reviewReturnViewSchema = z.enum(['home', 'result'])
const examReviewSchema: z.ZodType<ExamReview> = z.discriminatedUnion('kind', [
  z
    .strictObject({
      kind: z.literal('objective'),
      section: z.enum(['listening', 'reading']),
      submission: objectiveSubmissionSchema,
      document: objectiveContentDocumentSchema,
      part: z.number().int().positive(),
      returnTo: reviewReturnViewSchema,
    })
    .refine(
      (review) =>
        review.submission.section === review.section &&
        review.document.section === review.section &&
        review.document.contentKey === review.submission.contentKey,
      { message: 'The objective review content does not match its submission.' },
    ),
  z
    .strictObject({
      kind: z.literal('writing'),
      section: z.literal('writing'),
      submission: writingSubmissionSchema,
      evaluation: writingEvaluationSchema,
      part: z.number().int().positive(),
      returnTo: reviewReturnViewSchema,
    })
    .refine(
      (review) => review.evaluation.attemptId === review.submission.attemptId,
      { message: 'The Writing review evaluation does not match its submission.' },
    ),
  z
    .strictObject({
      kind: z.literal('speaking'),
      section: z.literal('speaking'),
      submission: speakingSubmissionSchema,
      evaluation: speakingEvaluationSchema,
      part: z.number().int().positive(),
      returnTo: reviewReturnViewSchema,
    })
    .refine(
      (review) => review.evaluation.attemptId === review.submission.attemptId,
      { message: 'The Speaking review evaluation does not match its submission.' },
    ),
])

const examSessionSchema: z.ZodType<ExamSession> = z
  .strictObject({
    view: z.enum(['home', 'exam', 'transition', 'result', 'review']),
    mode: z.enum(['full', 'section']).nullable(),
    currentSection: sectionSchema.nullable(),
    partBySection: z.strictObject({
      listening: z.number().int().positive(),
      reading: z.number().int().positive(),
      writing: z.number().int().positive(),
      speaking: z.number().int().positive(),
    }),
    secondsRemaining: z.strictObject({
      listening: z.number().int().nonnegative(),
      reading: z.number().int().nonnegative(),
      writing: z.number().int().nonnegative(),
      speaking: z.number().int().nonnegative(),
    }),
    answers: z.strictObject({
      listening: answerMapSchema,
      reading: answerMapSchema,
    }),
    writingDrafts: z.strictObject({ 1: z.string(), 2: z.string() }),
    listeningPlayback: z.strictObject({
      currentTimeSec: z.number().nonnegative(),
      volume: z.number().min(0).max(1),
    }),
    objectiveSubmissions: z.strictObject({
      listening: objectiveSubmissionSchema.optional(),
      reading: objectiveSubmissionSchema.optional(),
    }),
    writingSubmission: writingSubmissionSchema.optional(),
    writingEvaluation: writingEvaluationSchema.optional(),
    speakingSubmission: speakingSubmissionSchema.optional(),
    speakingEvaluation: speakingEvaluationSchema.optional(),
    review: examReviewSchema.optional(),
    completedSections: z.array(sectionSchema),
    startedAt: timestampSchema.optional(),
    startedAtBySection: z.strictObject({
      listening: timestampSchema.optional(),
      reading: timestampSchema.optional(),
      writing: timestampSchema.optional(),
      speaking: timestampSchema.optional(),
    }),
  })
  .refine(
    (session) =>
      !session.writingEvaluation ||
      session.writingEvaluation.attemptId === session.writingSubmission?.attemptId,
    { message: 'The Writing evaluation does not match the stored submission.' },
  )
  .refine(
    (session) =>
      !session.speakingEvaluation ||
      session.speakingEvaluation.attemptId === session.speakingSubmission?.attemptId,
    { message: 'The Speaking evaluation does not match the stored submission.' },
  )

function markComplete(state: ExamSession, section: SectionKey): ExamSession {
  const completedSections = state.completedSections.includes(section)
    ? state.completedSections
    : [...state.completedSections, section]
  return {
    ...state,
    currentSection: section,
    completedSections,
    view: 'transition',
  }
}

export function getResumableSection(state: ExamSession): SectionKey | null {
  if (state.mode === 'full') {
    return SECTION_ORDER.find(
      (section) => !state.completedSections.includes(section),
    ) ?? null
  }
  if (
    state.mode === 'section' &&
    state.currentSection &&
    !state.completedSections.includes(state.currentSection)
  ) {
    return state.currentSection
  }
  return null
}

export function sessionReducer(state: ExamSession, action: SessionAction): ExamSession {
  switch (action.type) {
    case 'START':
      return {
        ...initialSession,
        view: 'exam',
        mode: action.mode,
        currentSection: action.section,
        startedAt: action.startedAt,
        startedAtBySection: { [action.section]: action.startedAt },
      }
    case 'RESUME':
      if (state.view !== 'home') return state
      const resumedSection = getResumableSection(state)
      if (!resumedSection) return state
      return {
        ...state,
        currentSection: resumedSection,
        startedAtBySection: {
          ...state.startedAtBySection,
          [resumedSection]:
            state.startedAtBySection[resumedSection] ?? action.startedAt,
        },
        view: 'exam',
      }
    case 'SET_PART':
      if (state.view === 'review') {
        if (state.review?.section !== action.section) return state
        return {
          ...state,
          review: { ...state.review, part: action.part },
        }
      }
      return {
        ...state,
        partBySection: { ...state.partBySection, [action.section]: action.part },
      }
    case 'SET_ANSWER':
      if (state.view !== 'exam' || state.currentSection !== action.section) return state
      return {
        ...state,
        answers: {
          ...state.answers,
          [action.section]: {
            ...state.answers[action.section],
            [action.questionId]: action.value,
          },
        },
      }
    case 'SET_WRITING':
      if (state.view !== 'exam' || state.currentSection !== 'writing') return state
      return {
        ...state,
        writingDrafts: { ...state.writingDrafts, [action.task]: action.value },
      }
    case 'SET_LISTENING_PLAYBACK':
      if (state.view !== 'exam' || state.currentSection !== 'listening') return state
      return { ...state, listeningPlayback: action.playback }
    case 'TICK': {
      if (state.view !== 'exam' || state.currentSection !== action.section) return state
      const remaining = state.secondsRemaining[action.section]
      if (remaining <= 0) return state
      return {
        ...state,
        secondsRemaining: {
          ...state.secondsRemaining,
          [action.section]: remaining - 1,
        },
      }
    }
    case 'COMPLETE_OBJECTIVE':
      return markComplete(
        {
          ...state,
          objectiveSubmissions: {
            ...state.objectiveSubmissions,
            [action.submission.section]: action.submission,
          },
        },
        action.submission.section,
      )
    case 'COMPLETE_WRITING':
      return markComplete({ ...state, writingSubmission: action.submission }, 'writing')
    case 'ATTACH_WRITING_EVALUATION':
      if (state.writingSubmission?.attemptId !== action.evaluation.attemptId) return state
      return {
        ...state,
        currentSection: 'writing',
        writingEvaluation: action.evaluation,
        review: {
          kind: 'writing',
          section: 'writing',
          submission: state.writingSubmission,
          evaluation: action.evaluation,
          part: 1,
          returnTo: 'result',
        },
        view: 'review',
      }
    case 'COMPLETE_SPEAKING':
      return markComplete({ ...state, speakingSubmission: action.submission }, 'speaking')
    case 'ATTACH_SPEAKING_EVALUATION':
      if (state.speakingSubmission?.attemptId !== action.evaluation.attemptId) return state
      return {
        ...state,
        currentSection: 'speaking',
        speakingEvaluation: action.evaluation,
        review: {
          kind: 'speaking',
          section: 'speaking',
          submission: state.speakingSubmission,
          evaluation: action.evaluation,
          part: 1,
          returnTo: 'result',
        },
        view: 'review',
      }
    case 'CONTINUE': {
      if (!state.currentSection || state.mode !== 'full') {
        return { ...state, view: 'result' }
      }
      const next = getResumableSection(state)
      return next
        ? {
            ...state,
            currentSection: next,
            startedAtBySection: {
              ...state.startedAtBySection,
              [next]: action.startedAt,
            },
            view: 'exam',
          }
        : { ...state, view: 'result' }
    }
    case 'OPEN_REVIEW': {
      return {
        ...state,
        review: action.review,
        view: 'review',
      }
    }
    case 'CLOSE_REVIEW': {
      const view = state.review?.returnTo ?? 'result'
      return { ...state, review: undefined, view }
    }
    case 'GO_HOME':
      return { ...state, review: undefined, view: 'home' }
    case 'RESET':
      return initialSession
  }
}

function parseStoredSession(value: string | null): ExamSession | null {
  if (!value) return null
  try {
    const result = examSessionSchema.safeParse(JSON.parse(value))
    if (!result.success) return null
    return result.data.view === 'review' && !result.data.review
      ? { ...result.data, view: 'result' }
      : result.data
  } catch {
    return null
  }
}

export function loadSession(): ExamSession {
  if (typeof localStorage === 'undefined') return initialSession
  return parseStoredSession(localStorage.getItem(SESSION_STORAGE_KEY)) ?? initialSession
}

export function saveSession(session: ExamSession): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session))
}
