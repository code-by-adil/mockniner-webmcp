import { describe, expect, it, vi } from 'vitest'
import { listeningDocument, readingDocument } from '@/content/objective'
import { initialSession, sessionReducer, type IeltsSession } from '@/domain/session'
import { writingDocument } from '@/content/writing'
import type {
  ObjectiveSubmission,
  SpeakingSubmission,
  WritingSubmission,
  WritingEvaluation,
} from '@/domain/types'
import { createIeltsCommands } from './ieltsCommands'
import type { AttemptWriter } from './attemptWriter'
import type { AttemptReader } from './attemptReader'
import type { PracticeContentDocument } from '@/domain/contentDocument'

function createHarness({
  saveSpeakingAttempt,
  attemptReader,
  storedContent = [],
}: {
  saveSpeakingAttempt?: AttemptWriter['saveSpeakingAttempt']
  attemptReader?: AttemptReader
  storedContent?: PracticeContentDocument[]
} = {}) {
  let state: IeltsSession = initialSession
  let content = {
    listening: listeningDocument,
    reading: readingDocument,
    writing: writingDocument,
  }
  const persistEvaluation = vi.fn(async (evaluation: WritingEvaluation) => ({ ...evaluation, revision: 1 }))
  const persistSpeakingEvaluation = vi.fn(async () => undefined)
  const saveAndActivate = vi.fn(async () => undefined)
  const loadByKey = vi.fn(async (contentKey: string) =>
    storedContent.find((document) => document.contentKey === contentKey) ?? null,
  )
  const commands = createIeltsCommands({
    getState: () => state,
    publishSession: (next, documents) => { state = next; if (documents) content = documents },
    persistSession: () => {},
    getContent: () => content,
    setContent: (next) => {
      content = next
    },
    getContentStore: async () => ({
      loadLibrary: async () => [listeningDocument, readingDocument, writingDocument, ...storedContent],
      loadActive: async () => [],
      loadByKey,
      saveAndActivate,
    }),
    dispatch: (action) => {
      state = sessionReducer(state, action)
    },
    now: () => new Date('2026-08-31T10:00:00.000Z'),
    getRepository: async () => ({
      saveObjectiveAttempt: async (input): Promise<ObjectiveSubmission> => ({
        ...input,
      }),
      saveWritingAttempt: async (input): Promise<WritingSubmission> => ({
        ...input,
      }),
      saveObjectiveExplanation: vi.fn(),
      saveWritingEvaluation: persistEvaluation,
      saveSpeakingAttempt: saveSpeakingAttempt ?? (async (input): Promise<SpeakingSubmission> => ({
        attemptId: input.attemptId,
        contentKey: input.contentKey,
        responses: input.recordings.map((recording, index) => ({
          recordingId: `recording-${index}`,
          status: 'answered' as const, promptId: recording.promptId,
          partLabel: recording.partLabel,
          sequence: recording.sequence,
          promptText: recording.promptText,
          timeLimitSeconds: recording.timeLimitSeconds,
          durationMs: recording.durationMs,
          transcript: recording.transcript,
        })),
        startedAt: input.startedAt,
        submittedAt: input.submittedAt,
      })),
      saveSpeakingEvaluation: persistSpeakingEvaluation,
      ...(attemptReader ?? {
        readObjectiveExplanations: async () => [],
        readLearningSummary: async () => ({
        totalAttempts: 0,
        sections: {
          listening: { attemptCount: 0, recentAverageBand: null, recent: [] },
          reading: { attemptCount: 0, recentAverageBand: null, recent: [] },
          writing: {
            attemptCount: 0,
            evaluatedCount: 0,
            recentAverageOverallBand: null,
            recentAverageCriteria: null,
            recent: [],
          },
          speaking: { attemptCount: 0 },
        },
      }),
      readObjectiveAttempt: async () => null,
      readWritingAttempt: async () => state.writingSubmission ? { submission: state.writingSubmission, evaluation: state.writingEvaluation ?? null } : null,
      readSpeakingAttempt: async () => state.speakingSubmission ? { submission: state.speakingSubmission, evaluation: state.speakingEvaluation ?? null } : null,
      }),
    }),
  })
  return {
    commands,
    getState: () => state,
    getContent: () => content,
    persistEvaluation,
    persistSpeakingEvaluation,
    saveAndActivate,
    loadByKey,
  }
}

describe('exam application commands', () => {
  it('allows installing a set while preserving an unfinished full exam', async () => {
    const harness = createHarness()
    harness.commands.start('full', 'listening')
    await harness.commands.submitObjective('listening')
    harness.commands.goHome()
    await expect(harness.commands.installContent(readingDocument)).resolves.toEqual(readingDocument)
    expect(harness.getState().mode).toBe('full')
    expect(harness.getState().contentKeys?.reading).toBe(readingDocument.contentKey)
  })

  it('uses the same answer state to grade, persist, and complete an objective section', async () => {
    const harness = createHarness()
    harness.commands.start('section', 'listening')
    harness.commands.setObjectiveAnswer('listening', 1, 'carter')
    harness.commands.setObjectiveAnswer('listening', 3, '9.30')

    const submission = await harness.commands.submitObjective('listening')

    expect(submission).toMatchObject({
      section: 'listening',
      contentKey: 'local-listening-v1',
      result: { raw: 2, answered: 2, band: 0 },
      answers: { 1: 'carter', 3: '9.30' },
    })
    expect(harness.getState().objectiveSubmissions.listening).toEqual(submission)
    expect(harness.getState().completedSections).toEqual(['listening'])
    expect(harness.getState().view).toBe('transition')
  })

  it('creates immutable Writing submissions from the canonical drafts and tasks', async () => {
    const harness = createHarness()
    harness.commands.start('section', 'writing')
    harness.commands.setWritingDraft(1, 'Task one response')
    harness.commands.setWritingDraft(2, 'Task two response')

    const submission = await harness.commands.submitWriting()

    expect(submission).toMatchObject({
      attemptId: harness.getState().attemptId,
      contentKey: 'local-writing-v1',
      tasks: [
        { response: 'Task one response', wordCount: 3 },
        { response: 'Task two response', wordCount: 3 },
      ],
      submittedAt: '2026-08-31T10:00:00.000Z',
    })
    expect(harness.getState().writingSubmission).toEqual(submission)
  })

  it('validates, persists, and activates one content document through one command', async () => {
    const harness = createHarness()
    const replacement = {
      ...writingDocument,
      contentKey: 'agent-writing-v1',
      name: 'Agent-created Writing practice',
    }

    await expect(harness.commands.installContent(replacement)).resolves.toEqual(replacement)
    expect(harness.saveAndActivate).toHaveBeenCalledWith(replacement)
    expect(harness.getContent().writing).toEqual(replacement)
    expect(harness.getState()).toEqual(initialSession)
  })

  it('preserves the original draft when installing new practice', async () => {
    const harness = createHarness()
    harness.commands.start('section', 'writing')
    harness.commands.setWritingDraft(1, 'Unsaved learner response')

    await expect(
      harness.commands.installContent({
        ...writingDocument,
        contentKey: 'agent-writing-v1',
      }),
    ).resolves.toMatchObject({ contentKey: 'agent-writing-v1' })
    expect(harness.saveAndActivate).toHaveBeenCalledOnce()
    expect(harness.getState().writingDrafts[1]).toBe('Unsaved learner response')
  })

  it('resumes the same unfinished attempt through the command layer', () => {
    const harness = createHarness()
    harness.commands.start('section', 'reading')
    harness.commands.setObjectiveAnswer('reading', 12, 'trunks')
    harness.commands.goHome()

    harness.commands.resume()

    expect(harness.getState()).toMatchObject({
      view: 'exam',
      currentSection: 'reading',
      answers: { reading: { 12: 'trunks' } },
    })
  })

  it('opens the exact selected objective attempt and its matching content', async () => {
    const oldDocument = {
      ...readingDocument,
      contentKey: 'agent-reading-old',
      name: 'Older Reading practice',
    }
    const newerAttempt: ObjectiveSubmission = {
      attemptId: '44444444-4444-4444-8444-444444444444',
      contentKey: readingDocument.contentKey,
      section: 'reading',
      answers: { 1: 'FALSE' },
      result: {
        section: 'reading', raw: 0, total: 40, band: 0, answered: 1,
        correctQuestionIds: [],
      },
      startedAt: '2026-09-01T10:00:00.000Z',
      submittedAt: '2026-09-01T11:00:00.000Z',
    }
    const olderAttempt: ObjectiveSubmission = {
      ...newerAttempt,
      attemptId: '55555555-5555-4555-8555-555555555555',
      contentKey: oldDocument.contentKey,
      answers: { 1: 'TRUE' },
      submittedAt: '2026-08-31T11:00:00.000Z',
    }
    const attempts = new Map([
      [newerAttempt.attemptId, newerAttempt],
      [olderAttempt.attemptId, olderAttempt],
    ])
    const readObjectiveAttempt = vi.fn(async (attemptId?: string) =>
      attemptId ? attempts.get(attemptId) ?? null : null,
    )
    const harness = createHarness({
      storedContent: [oldDocument],
      attemptReader: {
        readSpeakingAttempt: vi.fn(),
        readObjectiveExplanations: async () => [],
        readLearningSummary: vi.fn(),
        readObjectiveAttempt,
        readWritingAttempt: vi.fn(),
      },
    })

    await harness.commands.openAttempt(newerAttempt.attemptId, 'reading')
    expect(harness.getState().review).toMatchObject({
      kind: 'objective',
      submission: { attemptId: newerAttempt.attemptId },
      document: { contentKey: readingDocument.contentKey },
      part: 1,
      returnTo: 'home',
    })

    harness.commands.closeReview()
    await harness.commands.openAttempt(olderAttempt.attemptId, 'reading')

    expect(readObjectiveAttempt).toHaveBeenNthCalledWith(1, newerAttempt.attemptId)
    expect(readObjectiveAttempt).toHaveBeenNthCalledWith(2, olderAttempt.attemptId)
    expect(harness.loadByKey).toHaveBeenCalledWith(oldDocument.contentKey)
    expect(harness.getState()).toMatchObject({
      view: 'review',
      currentSection: null,
      review: {
        kind: 'objective',
        submission: { attemptId: olderAttempt.attemptId, answers: { 1: 'TRUE' } },
        document: { contentKey: oldDocument.contentKey },
        part: 1,
        returnTo: 'home',
      },
    })
    expect(harness.getContent().reading).toEqual(readingDocument)
  })

  it('loads the selected evaluated Writing attempt before opening review', async () => {
    const submission: WritingSubmission = {
      attemptId: '66666666-6666-4666-8666-666666666666',
      contentKey: writingDocument.contentKey,
      tasks: [
        { task: writingDocument.tasks[0], response: 'First response.', wordCount: 2 },
        { task: writingDocument.tasks[1], response: 'Second response.', wordCount: 2 },
      ],
      startedAt: '2026-09-01T10:00:00.000Z',
      submittedAt: '2026-09-01T11:00:00.000Z',
    }
    const taskEvaluation = {
      band: 7,
      taskAchievement: 7,
      coherenceCohesion: 7,
      lexicalResource: 7,
      grammaticalRange: 7,
      feedback: 'Clear.',
      annotations: [],
    }
    const evaluation = {
      attemptId: submission.attemptId,
      overallBand: 7,
      summary: 'Clear responses.',
      task1: taskEvaluation,
      task2: taskEvaluation,
      evaluatedAt: '2026-09-01T11:05:00.000Z',
    }
    const readWritingAttempt = vi.fn(async () => ({ submission, evaluation }))
    const harness = createHarness({
      attemptReader: {
        readSpeakingAttempt: vi.fn(),
        readObjectiveExplanations: async () => [],
        readLearningSummary: vi.fn(),
        readObjectiveAttempt: vi.fn(),
        readWritingAttempt,
      },
    })

    await harness.commands.openAttempt(submission.attemptId, 'writing')

    expect(readWritingAttempt).toHaveBeenCalledWith(submission.attemptId)
    expect(harness.getState()).toMatchObject({
      view: 'review',
      currentSection: null,
      review: { kind: 'writing', submission, evaluation, part: 1, returnTo: 'home' },
    })
  })

  it('starts any standalone section instead of globally locking practice', () => {
    const harness = createHarness()
    harness.commands.start('section', 'listening')
    harness.commands.setObjectiveAnswer('listening', 1, 'Carter')
    harness.commands.goHome()

    harness.commands.start('section', 'speaking')

    expect(harness.getState()).toMatchObject({
      view: 'exam',
      mode: 'section',
      currentSection: 'speaking',
      answers: { listening: {}, reading: {} },
    })
  })

  it('rejects invalid content before persistence or activation', async () => {
    const harness = createHarness()
    await expect(
      harness.commands.installContent({ section: 'writing', tasks: [] }),
    ).rejects.toThrow()
    expect(harness.saveAndActivate).not.toHaveBeenCalled()
    expect(harness.getContent().writing).toEqual(writingDocument)
  })

  it('persists Speaking evidence through the command layer before completing', async () => {
    const harness = createHarness()
    harness.commands.start('section', 'speaking')

    const submission = await harness.commands.submitSpeaking({
      contentKey: 'local-speaking-v1',
      startedAt: '2026-08-31T09:58:00.000Z',
      recordings: [{
        status: 'answered' as const, promptId: 1,
        partLabel: 'Part 1',
        sequence: 0,
        promptText: 'Where do you live?',
        timeLimitSeconds: 30,
        durationMs: 12_000,
        transcript: 'I live in Dhaka.',
        audio: new Blob([new Uint8Array([1])], { type: 'audio/webm' }),
      }],
    })

    expect(submission.submittedAt).toBe('2026-08-31T10:00:00.000Z')
    expect(harness.getState().speakingSubmission).toEqual(submission)
    expect(harness.getState().view).toBe('transition')
  })

  it('does not reopen a Speaking result when persistence finishes after exit', async () => {
    let finishSave!: (submission: SpeakingSubmission) => void
    const saveSpeakingAttempt = vi.fn(() => new Promise<SpeakingSubmission>((resolve) => {
      finishSave = resolve
    }))
    const harness = createHarness({ saveSpeakingAttempt })
    harness.commands.start('section', 'speaking')
    const saving = harness.commands.submitSpeaking({
      contentKey: 'local-speaking-v1',
      startedAt: '2026-08-31T09:58:00.000Z',
      recordings: [{
        status: 'answered' as const, promptId: 1,
        partLabel: 'Part 1',
        sequence: 0,
        promptText: 'Where do you live?',
        timeLimitSeconds: 30,
        durationMs: 12_000,
        transcript: 'I live in Dhaka.',
        audio: new Blob([new Uint8Array([1])], { type: 'audio/webm' }),
      }],
    })
    await vi.waitFor(() => expect(saveSpeakingAttempt).toHaveBeenCalledOnce())
    harness.commands.goHome()
    finishSave({
      attemptId: '33333333-3333-4333-8333-333333333333',
      contentKey: 'local-speaking-v1',
      responses: [{
        recordingId: 'recording-0',
        status: 'answered' as const, promptId: 1,
        partLabel: 'Part 1',
        sequence: 0,
        promptText: 'Where do you live?',
        timeLimitSeconds: 30,
        durationMs: 12_000,
        transcript: 'I live in Dhaka.',
      }],
      startedAt: '2026-08-31T09:58:00.000Z',
      submittedAt: '2026-08-31T10:00:00.000Z',
    })

    await saving

    expect(harness.getState().view).toBe('home')
    expect(harness.getState().speakingSubmission).toBeUndefined()
  })

  it('rejects commands for a section that is not active', () => {
    const harness = createHarness()
    harness.commands.start('section', 'reading')
    expect(() =>
      harness.commands.setObjectiveAnswer('listening', 1, 'answer'),
    ).toThrow('listening is not the active exam section.')
  })

  it('persists an agent evaluation before opening Writing review', async () => {
    const harness = createHarness()
    harness.commands.start('section', 'writing')
    await harness.commands.submitWriting()
    const task = {
      band: 7,
      taskAchievement: 7,
      coherenceCohesion: 7,
      lexicalResource: 7,
      grammaticalRange: 6.5,
      feedback: 'Clear and relevant.',
      annotations: [],
    }

    const evaluation = await harness.commands.attachWritingEvaluation({
      attemptId: harness.getState().writingSubmission!.attemptId,
      overallBand: 7,
      summary: 'A competent response.',
      task1: task,
      task2: task,
    })

    const { revision: _revision, ...savedFeedback } = evaluation
    expect(harness.persistEvaluation).toHaveBeenCalledWith(savedFeedback, undefined)
    expect(harness.getState().writingEvaluation).toEqual(evaluation)
    expect(harness.getState().view).toBe('review')
  })

  it('persists a transcript-based Speaking evaluation before opening review', async () => {
    const harness = createHarness()
    harness.commands.start('section', 'speaking')
    const submission = await harness.commands.submitSpeaking({
      contentKey: 'agent-speaking-interview-v1',
      startedAt: '2026-08-31T09:58:00.000Z',
      recordings: [{
        status: 'answered' as const, promptId: 1,
        partLabel: 'Part 1',
        sequence: 0,
        promptText: 'Where do you live?',
        timeLimitSeconds: 30,
        durationMs: 12_000,
        transcript: 'I live in Dhaka.',
        audio: new Blob([new Uint8Array([1])], { type: 'audio/webm' }),
      }],
    })
    const evaluation = await harness.commands.attachSpeakingEvaluation({
      attemptId: submission.attemptId,
      overallBand: 6.5,
      fluencyCoherence: 6.5,
      lexicalResource: 6,
      grammaticalRangeAccuracy: 6.5,
      summary: 'A clear short response.',
      strengths: ['The answer is direct.'],
      improvements: ['Add a specific detail.'],
    })

    expect(harness.persistSpeakingEvaluation).toHaveBeenCalledWith(evaluation)
    expect(harness.getState().speakingEvaluation).toEqual(evaluation)
    expect(harness.getState().view).toBe('review')
  })
})
