import { countWords, gradeObjectiveDocument } from '@/domain/exam'
import {
  parsePracticeContentDocument,
  replaceActiveContent,
  requireActiveObjectiveContent,
  type ActiveContentDocuments,
  type PracticeContentDocument,
} from '@/domain/contentDocument'
import {
  finalizeWritingEvaluation,
  type WritingEvaluationInput,
} from '@/domain/writingEvaluation'
import {
  finalizeSpeakingEvaluation,
  type SpeakingEvaluationInput,
} from '@/domain/speakingEvaluation'
import type {
  ExamMode,
  ExamReview,
  ExamSession,
  ListeningPlaybackState,
  SessionAction,
} from '@/domain/session'
import type {
  ObjectiveSubmission,
  SectionKey,
  SpeakingSubmission,
  SpeakingEvaluation,
  WritingEvaluation,
  WritingSubmission,
  WritingSubmittedTask,
} from '@/domain/types'
import type {
  AttemptWriter,
  CompleteSpeakingAttemptInput,
} from './attemptWriter'
import type { ContentStore } from './contentStore'
import type { AttemptReader } from './attemptReader'

type CommandDependencies = {
  getState: () => ExamSession
  dispatch: (action: SessionAction) => void
  now?: () => Date
  getAttemptWriter: () => Promise<AttemptWriter>
  getAttemptReader: () => Promise<AttemptReader>
  getContent: () => ActiveContentDocuments
  setContent: (documents: ActiveContentDocuments) => void
  getContentStore: () => Promise<ContentStore>
}

export type ExamApplicationCommands = {
  start: (mode: ExamMode, section: SectionKey) => void
  resume: () => void
  goHome: () => void
  continueExam: () => void
  setPart: (section: SectionKey, part: number) => void
  setObjectiveAnswer: (
    section: 'listening' | 'reading',
    questionId: number,
    value: string,
  ) => void
  setWritingDraft: (task: 1 | 2, value: string) => void
  setListeningPlayback: (playback: ListeningPlaybackState) => void
  tick: (section: SectionKey) => void
  installContent: (input: unknown) => Promise<PracticeContentDocument>
  submitObjective: (
    section: 'listening' | 'reading',
  ) => Promise<ObjectiveSubmission>
  submitWriting: () => Promise<WritingSubmission>
  attachWritingEvaluation: (
    input: WritingEvaluationInput,
  ) => Promise<WritingEvaluation>
  submitSpeaking: (
    input: CompleteSpeakingAttemptInput,
  ) => Promise<SpeakingSubmission>
  attachSpeakingEvaluation: (
    input: SpeakingEvaluationInput,
  ) => Promise<SpeakingEvaluation>
  openReview: (section: SectionKey) => Promise<void>
  openAttempt: (
    attemptId: string,
    section: 'listening' | 'reading' | 'writing',
  ) => Promise<void>
  closeReview: () => void
  reset: () => void
}

export class ActiveAttemptError extends Error {
  readonly code = 'ACTIVE_ATTEMPT'

  constructor() {
    super('Finish or leave the current attempt before installing a new practice set.')
    this.name = 'ActiveAttemptError'
  }
}

function requireActiveSection(state: ExamSession, section: SectionKey): void {
  if (state.view !== 'exam' || state.currentSection !== section) {
    throw new Error(`${section} is not the active exam section.`)
  }
}

function requireVisibleSection(state: ExamSession, section: SectionKey): void {
  const visibleSection = state.view === 'review'
    ? state.review?.section
    : state.currentSection
  if (
    (state.view !== 'exam' && state.view !== 'review') ||
    visibleSection !== section
  ) {
    throw new Error(`${section} is not the visible exam section.`)
  }
}

function hasActiveAttempt(state: ExamSession): boolean {
  if (state.view === 'exam' || state.view === 'transition') return true
  return Boolean(
    state.view === 'home' &&
    state.currentSection &&
    !state.completedSections.includes(state.currentSection),
  )
}

export function createExamApplicationCommands({
  getState,
  dispatch,
  now = () => new Date(),
  getAttemptWriter,
  getAttemptReader,
  getContent,
  setContent,
  getContentStore,
}: CommandDependencies): ExamApplicationCommands {
  const openReview = (review: ExamReview) => {
    dispatch({ type: 'OPEN_REVIEW', review })
  }

  const openStoredAttempt = async (
    attemptId: string,
    section: 'listening' | 'reading' | 'writing',
    returnTo: 'home' | 'result',
  ): Promise<void> => {
    const reader = await getAttemptReader()
    if (section === 'writing') {
      const stored = await reader.readWritingAttempt(attemptId)
      if (!stored) {
        throw new Error(`Writing attempt ${attemptId} was not found.`)
      }
      if (!stored.evaluation) {
        throw new Error(`Writing attempt ${attemptId} has not been evaluated.`)
      }
      openReview({
        kind: 'writing',
        section,
        submission: stored.submission,
        evaluation: stored.evaluation,
        part: 1,
        returnTo,
      })
      return
    }

    const submission = await reader.readObjectiveAttempt(attemptId)
    if (!submission) {
      throw new Error(`${section} attempt ${attemptId} was not found.`)
    }
    if (submission.section !== section) {
      throw new Error(
        `Attempt ${attemptId} belongs to ${submission.section}, not ${section}.`,
      )
    }
    const activeDocument = getContent()[section]
    const document = activeDocument.contentKey === submission.contentKey
      ? activeDocument
      : await (await getContentStore()).loadByKey(submission.contentKey)
    if (!document) {
      throw new Error(
        `Content ${submission.contentKey} for attempt ${attemptId} was not found.`,
      )
    }
    if (document.section !== section) {
      throw new Error(
        `Content ${submission.contentKey} belongs to ${document.section}, not ${section}.`,
      )
    }
    openReview({
      kind: 'objective',
      section,
      submission,
      document,
      part: 1,
      returnTo,
    })
  }

  return {
    start(mode, requestedSection) {
      const section = mode === 'full' ? 'listening' : requestedSection
      dispatch({ type: 'START', mode, section, startedAt: now().toISOString() })
    },
    resume() {
      dispatch({ type: 'RESUME', startedAt: now().toISOString() })
    },
    goHome() {
      dispatch({ type: 'GO_HOME' })
    },
    continueExam() {
      dispatch({ type: 'CONTINUE', startedAt: now().toISOString() })
    },
    setPart(section, part) {
      requireVisibleSection(getState(), section)
      dispatch({ type: 'SET_PART', section, part: Math.max(1, Math.trunc(part)) })
    },
    setObjectiveAnswer(section, questionId, value) {
      requireActiveSection(getState(), section)
      dispatch({ type: 'SET_ANSWER', section, questionId, value })
    },
    setWritingDraft(task, value) {
      requireActiveSection(getState(), 'writing')
      dispatch({ type: 'SET_WRITING', task, value })
    },
    setListeningPlayback(playback) {
      requireActiveSection(getState(), 'listening')
      dispatch({
        type: 'SET_LISTENING_PLAYBACK',
        playback: {
          currentTimeSec: Math.max(0, playback.currentTimeSec),
          volume: Math.min(1, Math.max(0, playback.volume)),
        },
      })
    },
    tick(section) {
      dispatch({ type: 'TICK', section })
    },
    async installContent(input) {
      if (hasActiveAttempt(getState())) throw new ActiveAttemptError()
      const document = parsePracticeContentDocument(input)
      await (await getContentStore()).saveAndActivate(document)
      setContent(replaceActiveContent(getContent(), document))
      dispatch({ type: 'RESET' })
      return document
    },
    async submitObjective(section) {
      const state = getState()
      requireActiveSection(state, section)
      const document = requireActiveObjectiveContent(getContent(), section)
      const { contentKey } = document
      const result = gradeObjectiveDocument(document, state.answers[section])
      const submittedAt = now().toISOString()
      const submission = await (await getAttemptWriter()).saveObjectiveAttempt({
        section,
        contentKey,
        answers: state.answers[section],
        result,
        startedAt:
          state.startedAtBySection[section] ?? state.startedAt ?? submittedAt,
        submittedAt,
      })
      dispatch({ type: 'COMPLETE_OBJECTIVE', submission })
      return submission
    },
    async submitWriting() {
      const state = getState()
      requireActiveSection(state, 'writing')
      const document = getContent().writing
      const submittedAt = now().toISOString()
      const submittedTasks = document.tasks.map((task) => {
        const response = state.writingDrafts[task.id]
        return { task, response, wordCount: countWords(response) }
      }) as [WritingSubmittedTask, WritingSubmittedTask]
      const submission = await (await getAttemptWriter()).saveWritingAttempt({
        contentKey: document.contentKey,
        tasks: submittedTasks,
        startedAt:
          state.startedAtBySection.writing ?? state.startedAt ?? submittedAt,
        submittedAt,
      })
      dispatch({ type: 'COMPLETE_WRITING', submission })
      return submission
    },
    async attachWritingEvaluation(input) {
      const state = getState()
      if (state.writingSubmission?.attemptId !== input.attemptId) {
        throw new Error(
          `Writing attempt ${input.attemptId} is not the current submitted attempt.`,
        )
      }
      const evaluation = finalizeWritingEvaluation(input, now().toISOString())
      await (await getAttemptWriter()).saveWritingEvaluation(evaluation)
      dispatch({ type: 'ATTACH_WRITING_EVALUATION', evaluation })
      return evaluation
    },
    async submitSpeaking(input) {
      const activeState = getState()
      requireActiveSection(activeState, 'speaking')
      const activeAttemptStartedAt = activeState.startedAtBySection.speaking
      const submission = await (await getAttemptWriter()).saveSpeakingAttempt({
        ...input,
        submittedAt: now().toISOString(),
      })
      const currentState = getState()
      const isSameVisibleAttempt =
        currentState.view === 'exam' &&
        currentState.currentSection === 'speaking' &&
        currentState.startedAtBySection.speaking === activeAttemptStartedAt
      if (isSameVisibleAttempt) {
        dispatch({ type: 'COMPLETE_SPEAKING', submission })
      }
      return submission
    },
    async attachSpeakingEvaluation(input) {
      const state = getState()
      if (state.speakingSubmission?.attemptId !== input.attemptId) {
        throw new Error(
          `Speaking attempt ${input.attemptId} is not the current submitted attempt.`,
        )
      }
      const evaluation = finalizeSpeakingEvaluation(input, now().toISOString())
      await (await getAttemptWriter()).saveSpeakingEvaluation(evaluation)
      dispatch({ type: 'ATTACH_SPEAKING_EVALUATION', evaluation })
      return evaluation
    },
    async openReview(section) {
      const state = getState()
      if (section === 'listening' || section === 'reading') {
        const submission = state.objectiveSubmissions[section]
        if (!submission) return
        await openStoredAttempt(submission.attemptId, section, 'result')
        return
      }
      if (section === 'writing') {
        if (!state.writingSubmission || !state.writingEvaluation) return
        await openStoredAttempt(state.writingSubmission.attemptId, section, 'result')
        return
      }
      if (!state.speakingSubmission || !state.speakingEvaluation) return
      openReview({
        kind: 'speaking',
        section,
        submission: state.speakingSubmission,
        evaluation: state.speakingEvaluation,
        part: 1,
        returnTo: 'result',
      })
    },
    async openAttempt(attemptId, section) {
      await openStoredAttempt(attemptId, section, 'home')
    },
    closeReview() {
      dispatch({ type: 'CLOSE_REVIEW' })
    },
    reset() {
      dispatch({ type: 'RESET' })
    },
  }
}
