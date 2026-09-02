import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getResumableSection,
  initialSession,
  loadSession,
  saveSession,
  sessionReducer,
} from './session'
import { writingDocument } from '@/content/writing'
import { listeningDocument } from '@/content/objective'
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

const readingSubmission: ObjectiveSubmission = {
  ...listeningSubmission,
  attemptId: '44444444-4444-4444-8444-444444444444',
  contentKey: 'local-reading-v1',
  section: 'reading',
  result: { ...listeningResult, section: 'reading' },
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

  it('runs all four sections in order before showing the full-exam result', () => {
    const listening = sessionReducer(initialSession, {
      type: 'START',
      mode: 'full',
      section: 'listening',
      startedAt: '2026-08-31T10:00:00.000Z',
    })
    const reading = sessionReducer(
      sessionReducer(listening, {
        type: 'COMPLETE_OBJECTIVE',
        submission: listeningSubmission,
      }),
      { type: 'CONTINUE', startedAt: '2026-08-31T10:31:00.000Z' },
    )
    const writing = sessionReducer(
      sessionReducer(reading, {
        type: 'COMPLETE_OBJECTIVE',
        submission: readingSubmission,
      }),
      { type: 'CONTINUE', startedAt: '2026-08-31T11:32:00.000Z' },
    )
    const speaking = sessionReducer(
      sessionReducer(writing, {
        type: 'COMPLETE_WRITING',
        submission: writingSubmission,
      }),
      { type: 'CONTINUE', startedAt: '2026-08-31T12:33:00.000Z' },
    )
    const complete = sessionReducer(
      sessionReducer(speaking, {
        type: 'COMPLETE_SPEAKING',
        submission: {
          attemptId: '55555555-5555-4555-8555-555555555555',
          contentKey: 'local-speaking-v1',
          responses: [],
          startedAt: '2026-08-31T12:33:00.000Z',
          submittedAt: '2026-08-31T12:47:00.000Z',
        },
      }),
      { type: 'CONTINUE', startedAt: '2026-08-31T12:48:00.000Z' },
    )

    expect([
      listening.currentSection,
      reading.currentSection,
      writing.currentSection,
      speaking.currentSection,
    ]).toEqual(['listening', 'reading', 'writing', 'speaking'])
    expect(complete.completedSections).toEqual([
      'listening',
      'reading',
      'writing',
      'speaking',
    ])
    expect(complete.view).toBe('result')
    expect(getResumableSection(complete)).toBeNull()
  })

  it('resumes the next incomplete full-exam section after leaving a transition', () => {
    const transition = sessionReducer(
      sessionReducer(initialSession, {
        type: 'START',
        mode: 'full',
        section: 'listening',
        startedAt: '2026-08-31T10:00:00.000Z',
      }),
      { type: 'COMPLETE_OBJECTIVE', submission: listeningSubmission },
    )
    const home = sessionReducer(transition, { type: 'GO_HOME' })
    const resumed = sessionReducer(home, {
      type: 'RESUME',
      startedAt: '2026-08-31T10:35:00.000Z',
    })

    expect(getResumableSection(home)).toBe('reading')
    expect(resumed).toMatchObject({
      view: 'exam',
      mode: 'full',
      currentSection: 'reading',
      startedAtBySection: { reading: '2026-08-31T10:35:00.000Z' },
    })
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
    const resumed = sessionReducer(home, {
      type: 'RESUME',
      startedAt: '2026-08-31T10:05:00.000Z',
    })

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
    const review = sessionReducer(results, {
      type: 'OPEN_REVIEW',
      review: {
        kind: 'objective',
        section: 'listening',
        submission: listeningSubmission,
        document: listeningDocument,
        part: 1,
        returnTo: 'result',
      },
    })
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

  it('keeps an unfinished attempt unchanged while a history review is open', () => {
    const unfinished = sessionReducer(
      sessionReducer(
        sessionReducer(initialSession, {
          type: 'START',
          mode: 'section',
          section: 'reading',
          startedAt: '2026-08-31T10:00:00.000Z',
        }),
        { type: 'SET_PART', section: 'reading', part: 2 },
      ),
      { type: 'GO_HOME' },
    )
    const review = sessionReducer(unfinished, {
      type: 'OPEN_REVIEW',
      review: {
        kind: 'objective',
        section: 'listening',
        submission: listeningSubmission,
        document: listeningDocument,
        part: 1,
        returnTo: 'home',
      },
    })
    const movedReview = sessionReducer(review, {
      type: 'SET_PART',
      section: 'listening',
      part: 3,
    })
    const closed = sessionReducer(movedReview, { type: 'CLOSE_REVIEW' })

    expect(movedReview.review?.part).toBe(3)
    expect(movedReview.partBySection.listening).toBe(1)
    expect(closed).toMatchObject({
      view: 'home',
      currentSection: 'reading',
      partBySection: { reading: 2 },
    })
    expect(getResumableSection(closed)).toBe('reading')
  })

  it('opens Writing review with the matching evaluation snapshot', () => {
    const submitted = sessionReducer(
      { ...initialSession, view: 'result' },
      { type: 'COMPLETE_WRITING', submission: writingSubmission },
    )
    const evaluated = sessionReducer(submitted, {
      type: 'ATTACH_WRITING_EVALUATION',
      evaluation: writingEvaluation,
    })

    expect(evaluated.view).toBe('review')
    expect(evaluated.currentSection).toBe('writing')
    expect(evaluated.review).toEqual({
      kind: 'writing',
      section: 'writing',
      submission: writingSubmission,
      evaluation: writingEvaluation,
      part: 1,
      returnTo: 'result',
    })
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
