import type {
  AnswerMap,
  ObjectiveSubmission,
  SectionKey,
  SpeakingSubmission,
  SpeakingEvaluation,
  WritingEvaluation,
  WritingSubmission,
} from './types'
import { SECTION_META, SECTION_ORDER } from './sections'
import type { ObjectiveContentDocument } from './objectiveContent'

export type IeltsMode = 'full' | 'section'
type SessionView = 'home' | 'exam' | 'transition' | 'result' | 'review'

export type ListeningPlaybackState = {
  currentTimeSec: number
  volume: number
}

type ReviewReturnView = 'home' | 'result'

export type IeltsReview =
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
      evaluation: WritingEvaluation | null
      part: number
      returnTo: ReviewReturnView
    }
  | {
      kind: 'speaking'
      section: 'speaking'
      submission: SpeakingSubmission
      evaluation: SpeakingEvaluation | null
      part: number
      returnTo: ReviewReturnView
    }

export type IeltsSession = {
  attemptId: string | null
  view: SessionView
  mode: IeltsMode | null
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
  review?: IeltsReview
  completedSections: SectionKey[]
  startedAt?: string
  startedAtBySection: Partial<Record<SectionKey, string>>
}

export type SessionAction =
  | { type: 'RESTORE'; session: IeltsSession }
  | { type: 'START'; mode: IeltsMode; section: SectionKey; startedAt: string; attemptId: string }
  | { type: 'RESUME'; startedAt: string; attemptId: string }
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
  | { type: 'CONTINUE'; startedAt: string; attemptId: string }
  | { type: 'OPEN_REVIEW'; review: IeltsReview }
  | { type: 'CLOSE_REVIEW' }
  | { type: 'GO_HOME' }
  | { type: 'RESET' }

export const initialSession: IeltsSession = {
  attemptId: null,
  view: 'home',
  mode: null,
  currentSection: null,
  partBySection: { listening: 1, reading: 1, writing: 1, speaking: 1 },
  secondsRemaining: {
    listening: SECTION_META.listening.durationSeconds,
    reading: SECTION_META.reading.durationSeconds,
    writing: SECTION_META.writing.durationSeconds,
    speaking: SECTION_META.speaking.durationSeconds,
  },
  answers: { listening: {}, reading: {} },
  writingDrafts: { 1: '', 2: '' },
  listeningPlayback: { currentTimeSec: 0, volume: 0.85 },
  objectiveSubmissions: {},
  completedSections: [],
  startedAtBySection: {},
}

function markComplete(state: IeltsSession, section: SectionKey): IeltsSession {
  const completedSections = state.completedSections.includes(section)
    ? state.completedSections
    : [...state.completedSections, section]
  return {
    ...state,
    currentSection: section,
    completedSections,
    view: state.view === 'exam' ? 'transition' : state.view,
  }
}

export function getResumableSection(state: IeltsSession): SectionKey | null {
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

export function sessionReducer(state: IeltsSession, action: SessionAction): IeltsSession {
  switch (action.type) {
    case 'RESTORE':
      return state.mode === null ? action.session : state
    case 'START':
      return {
        ...initialSession,
        attemptId: action.attemptId,
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
        attemptId: resumedSection === state.currentSection && state.attemptId
          ? state.attemptId : action.attemptId,
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
      if (state.attemptId !== action.submission.attemptId || state.currentSection !== action.submission.section || state.completedSections.includes(action.submission.section)) return state
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
      if (state.attemptId !== action.submission.attemptId || state.currentSection !== 'writing' || state.completedSections.includes('writing')) return state
      return markComplete({ ...state, writingSubmission: action.submission }, 'writing')
    case 'ATTACH_WRITING_EVALUATION':
      if (state.view === 'review' && state.review?.kind === 'writing' && state.review.submission.attemptId === action.evaluation.attemptId) return {
        ...state, review: { ...state.review, evaluation: action.evaluation },
        ...(state.writingSubmission?.attemptId === action.evaluation.attemptId ? { writingEvaluation: action.evaluation } : {}),
      }
      if (state.writingSubmission?.attemptId !== action.evaluation.attemptId) return state
      if (state.view !== 'transition' && state.view !== 'result') return { ...state, writingEvaluation: action.evaluation }
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
      if (state.attemptId !== action.submission.attemptId || state.currentSection !== 'speaking' || state.completedSections.includes('speaking')) return state
      return markComplete({ ...state, speakingSubmission: action.submission }, 'speaking')
    case 'ATTACH_SPEAKING_EVALUATION':
      if (state.view === 'review' && state.review?.kind === 'speaking' && state.review.submission.attemptId === action.evaluation.attemptId) return {
        ...state, review: { ...state.review, evaluation: action.evaluation },
        ...(state.speakingSubmission?.attemptId === action.evaluation.attemptId ? { speakingEvaluation: action.evaluation } : {}),
      }
      if (state.speakingSubmission?.attemptId !== action.evaluation.attemptId) return state
      if (state.view !== 'transition' && state.view !== 'result') return { ...state, speakingEvaluation: action.evaluation }
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
            attemptId: action.attemptId,
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
