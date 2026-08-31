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
import type {
  ExamMode,
  ExamSession,
  ListeningPlaybackState,
  SessionAction,
} from '@/domain/session'
import type {
  ObjectiveSubmission,
  SectionKey,
  SpeakingSubmission,
  WritingEvaluation,
  WritingSubmission,
  WritingSubmittedTask,
} from '@/domain/types'
import type {
  AttemptWriter,
  CompleteSpeakingAttemptInput,
} from './attemptWriter'
import type { ContentStore } from './contentStore'

type CommandDependencies = {
  getState: () => ExamSession
  dispatch: (action: SessionAction) => void
  now?: () => Date
  getAttemptWriter: () => Promise<AttemptWriter>
  getContent: () => ActiveContentDocuments
  setContent: (documents: ActiveContentDocuments) => void
  getContentStore: () => Promise<ContentStore>
}

export type ExamApplicationCommands = {
  start: (mode: ExamMode, section: SectionKey) => void
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
  openReview: (section: SectionKey) => void
  closeReview: () => void
  reset: () => void
}

function requireActiveSection(state: ExamSession, section: SectionKey): void {
  if (state.view !== 'exam' || state.currentSection !== section) {
    throw new Error(`${section} is not the active exam section.`)
  }
}

function requireVisibleSection(state: ExamSession, section: SectionKey): void {
  if (
    (state.view !== 'exam' && state.view !== 'review') ||
    state.currentSection !== section
  ) {
    throw new Error(`${section} is not the visible exam section.`)
  }
}

export function createExamApplicationCommands({
  getState,
  dispatch,
  now = () => new Date(),
  getAttemptWriter,
  getContent,
  setContent,
  getContentStore,
}: CommandDependencies): ExamApplicationCommands {
  return {
    start(mode, requestedSection) {
      const section = mode === 'full' ? 'listening' : requestedSection
      dispatch({ type: 'START', mode, section, startedAt: now().toISOString() })
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
      requireActiveSection(getState(), 'speaking')
      const submission = await (await getAttemptWriter()).saveSpeakingAttempt({
        ...input,
        submittedAt: now().toISOString(),
      })
      dispatch({ type: 'COMPLETE_SPEAKING', submission })
      return submission
    },
    openReview(section) {
      dispatch({ type: 'OPEN_REVIEW', section })
    },
    closeReview() {
      dispatch({ type: 'CLOSE_REVIEW' })
    },
    reset() {
      dispatch({ type: 'RESET' })
    },
  }
}
