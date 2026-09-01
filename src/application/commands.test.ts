import { describe, expect, it, vi } from 'vitest'
import { listeningDocument, readingDocument } from '@/content/objective'
import { initialSession, sessionReducer, type ExamSession } from '@/domain/session'
import { writingDocument } from '@/content/writing'
import type {
  ObjectiveSubmission,
  SpeakingSubmission,
  WritingSubmission,
} from '@/domain/types'
import { createExamApplicationCommands } from './commands'

function createHarness() {
  let state: ExamSession = initialSession
  let content = {
    listening: listeningDocument,
    reading: readingDocument,
    writing: writingDocument,
  }
  const persistEvaluation = vi.fn(async () => undefined)
  const saveAndActivate = vi.fn(async () => undefined)
  const commands = createExamApplicationCommands({
    getState: () => state,
    getContent: () => content,
    setContent: (next) => {
      content = next
    },
    getContentStore: async () => ({ loadActive: async () => [], saveAndActivate }),
    dispatch: (action) => {
      state = sessionReducer(state, action)
    },
    now: () => new Date('2026-08-31T10:00:00.000Z'),
    getAttemptWriter: async () => ({
      saveObjectiveAttempt: async (input): Promise<ObjectiveSubmission> => ({
        attemptId: '11111111-1111-4111-8111-111111111111',
        ...input,
      }),
      saveWritingAttempt: async (input): Promise<WritingSubmission> => ({
        attemptId: '22222222-2222-4222-8222-222222222222',
        ...input,
      }),
      saveWritingEvaluation: persistEvaluation,
      saveSpeakingAttempt: async (input): Promise<SpeakingSubmission> => ({
        attemptId: '33333333-3333-4333-8333-333333333333',
        promptCount: input.recordings.length,
        recordedCount: input.recordings.length,
        recordingIds: input.recordings.map((_, index) => `recording-${index}`),
        submittedAt: input.submittedAt,
      }),
    }),
  })
  return {
    commands,
    getState: () => state,
    getContent: () => content,
    persistEvaluation,
    saveAndActivate,
  }
}

describe('exam application commands', () => {
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
      attemptId: '22222222-2222-4222-8222-222222222222',
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

  it('protects an active attempt from practice-set replacement', async () => {
    const harness = createHarness()
    harness.commands.start('section', 'writing')
    harness.commands.setWritingDraft(1, 'Unsaved learner response')

    await expect(
      harness.commands.installContent({
        ...writingDocument,
        contentKey: 'agent-writing-v1',
      }),
    ).rejects.toMatchObject({ code: 'ACTIVE_ATTEMPT' })
    expect(harness.saveAndActivate).not.toHaveBeenCalled()
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
        promptId: 1,
        partLabel: 'Part 1',
        sequence: 0,
        promptText: 'Where do you live?',
        timeLimitSeconds: 30,
        durationMs: 12_000,
        audio: new Blob([new Uint8Array([1])], { type: 'audio/webm' }),
      }],
    })

    expect(submission.submittedAt).toBe('2026-08-31T10:00:00.000Z')
    expect(harness.getState().speakingSubmission).toEqual(submission)
    expect(harness.getState().view).toBe('transition')
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
      attemptId: '22222222-2222-4222-8222-222222222222',
      overallBand: 7,
      summary: 'A competent response.',
      task1: task,
      task2: task,
    })

    expect(harness.persistEvaluation).toHaveBeenCalledWith(evaluation)
    expect(harness.getState().writingEvaluation).toEqual(evaluation)
    expect(harness.getState().view).toBe('review')
  })
})
