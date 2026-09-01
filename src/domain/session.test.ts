import { afterEach, describe, expect, it, vi } from 'vitest'
import { initialSession, loadSession, saveSession, sessionReducer } from './session'
import { writingDocument } from '@/content/writing'
import type {
  ObjectiveResult,
  ObjectiveSubmission,
  WritingEvaluation,
  WritingSubmission,
} from './types'

const listeningResult: ObjectiveResult = { section: 'listening', raw: 30, total: 40, band: 7, answered: 40, correctQuestionIds: [] }
const listeningSubmission: ObjectiveSubmission = {
  attemptId: '11111111-1111-4111-8111-111111111111',
  contentKey: 'local-listening-v1',
  section: 'listening',
  answers: { 1: 'Carter' },
  result: listeningResult,
  startedAt: '2026-08-31T10:00:00.000Z',
  submittedAt: '2026-08-31T10:30:00.000Z',
}

const writingSubmission: WritingSubmission = {
  attemptId: '22222222-2222-4222-8222-222222222222',
  contentKey: 'local-writing-v1',
  tasks: [
    { task: writingDocument.tasks[0], response: 'Task one response', wordCount: 3 },
    { task: writingDocument.tasks[1], response: 'Task two response', wordCount: 3 },
  ],
  startedAt: '2026-08-31T10:00:00.000Z',
  submittedAt: '2026-08-31T11:00:00.000Z',
}

const writingTaskEvaluation = {
  band: 7,
  taskAchievement: 7,
  coherenceCohesion: 7,
  lexicalResource: 7,
  grammaticalRange: 6.5,
  feedback: 'Clear and relevant.',
  annotations: [],
}

const writingEvaluation: WritingEvaluation = {
  attemptId: writingSubmission.attemptId,
  overallBand: 7,
  summary: 'A competent response.',
  task1: writingTaskEvaluation,
  task2: writingTaskEvaluation,
  evaluatedAt: '2026-08-31T11:05:00.000Z',
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('full exam state transitions', () => {
  it('locks a submitted section behind a transition and advances in official order', () => {
    const started = sessionReducer(initialSession, {
      type: 'START',
      mode: 'full',
      section: 'listening',
      startedAt: '2026-08-31T10:00:00.000Z',
    })
    expect(started.currentSection).toBe('listening')
    const submitted = sessionReducer(started, { type: 'COMPLETE_OBJECTIVE', submission: listeningSubmission })
    expect(submitted.view).toBe('transition')
    expect(submitted.completedSections).toEqual(['listening'])
    const continued = sessionReducer(submitted, {
      type: 'CONTINUE',
      startedAt: '2026-08-31T10:31:00.000Z',
    })
    expect(continued.view).toBe('exam')
    expect(continued.currentSection).toBe('reading')
  })

  it('keeps objective answers in the same shared state used by the UI', () => {
    const started = sessionReducer(initialSession, {
      type: 'START',
      mode: 'section',
      section: 'reading',
      startedAt: '2026-08-31T10:00:00.000Z',
    })
    const answered = sessionReducer(started, { type: 'SET_ANSWER', section: 'reading', questionId: 12, value: 'trunks' })
    expect(answered.answers.reading[12]).toBe('trunks')
  })

  it('resumes an unfinished attempt without resetting answers or playback', () => {
    const started = sessionReducer(initialSession, {
      type: 'START',
      mode: 'section',
      section: 'listening',
      startedAt: '2026-08-31T10:00:00.000Z',
    })
    const progressed = sessionReducer(
      sessionReducer(started, {
        type: 'SET_ANSWER', section: 'listening', questionId: 1, value: 'Carter',
      }),
      { type: 'SET_LISTENING_PLAYBACK', playback: { currentTimeSec: 18.5, volume: 0.7 } },
    )
    const home = sessionReducer(progressed, { type: 'GO_HOME' })
    const resumed = sessionReducer(home, { type: 'RESUME' })

    expect(resumed.view).toBe('exam')
    expect(resumed.answers.listening[1]).toBe('Carter')
    expect(resumed.listeningPlayback).toEqual({ currentTimeSec: 18.5, volume: 0.7 })
  })

  it('opens a submitted objective section in read-only review state', () => {
    const started = sessionReducer(initialSession, {
      type: 'START',
      mode: 'section',
      section: 'listening',
      startedAt: '2026-08-31T10:00:00.000Z',
    })
    const completed = sessionReducer(started, {
      type: 'COMPLETE_OBJECTIVE',
      submission: listeningSubmission,
    })
    const results = sessionReducer(completed, {
      type: 'CONTINUE',
      startedAt: '2026-08-31T10:31:00.000Z',
    })
    const review = sessionReducer(results, { type: 'OPEN_REVIEW', section: 'listening' })
    const attemptedEdit = sessionReducer(review, {
      type: 'SET_ANSWER',
      section: 'listening',
      questionId: 1,
      value: 'changed',
    })

    expect(review.view).toBe('review')
    expect(review.partBySection.listening).toBe(1)
    expect(attemptedEdit).toBe(review)
    expect(review.objectiveSubmissions.listening?.answers[1]).toBe('Carter')
    expect(sessionReducer(review, { type: 'CLOSE_REVIEW' }).view).toBe('result')
  })

  it('opens Writing review only after evaluation, matching MockNiner route behavior', () => {
    const submitted = sessionReducer(
      { ...initialSession, view: 'result' },
      { type: 'COMPLETE_WRITING', submission: writingSubmission },
    )
    const beforeEvaluation = sessionReducer(submitted, {
      type: 'OPEN_REVIEW',
      section: 'writing',
    })
    const evaluated = sessionReducer(submitted, {
      type: 'ATTACH_WRITING_EVALUATION',
      evaluation: writingEvaluation,
    })

    expect(beforeEvaluation).toBe(submitted)
    expect(evaluated.view).toBe('review')
    expect(evaluated.currentSection).toBe('writing')
    expect(sessionReducer(evaluated, { type: 'CLOSE_REVIEW' }).view).toBe('result')
  })

  it('ticks only the active section timer', () => {
    const started = sessionReducer(initialSession, {
      type: 'START',
      mode: 'section',
      section: 'reading',
      startedAt: '2026-08-31T10:00:00.000Z',
    })
    const ignored = sessionReducer(started, { type: 'TICK', section: 'listening' })
    expect(ignored).toBe(started)
    const ticked = sessionReducer(started, { type: 'TICK', section: 'reading' })
    expect(ticked.secondsRemaining.reading).toBe(3599)
  })

  it('persists and reloads the canonical session as one record', () => {
    const values = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    })
    const answered = sessionReducer(
      sessionReducer(initialSession, {
        type: 'START',
        mode: 'section',
        section: 'reading',
        startedAt: '2026-08-31T10:00:00.000Z',
      }),
      { type: 'SET_ANSWER', section: 'reading', questionId: 12, value: 'trunks' },
    )

    saveSession(answered)

    expect(loadSession()).toEqual(answered)
    expect(values.size).toBe(1)
  })

  it('rejects malformed current-session data instead of trusting browser storage', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => JSON.stringify({ ...initialSession, view: 'unexpected' }),
      setItem: vi.fn(),
    })

    expect(loadSession()).toEqual(initialSession)
  })

})
