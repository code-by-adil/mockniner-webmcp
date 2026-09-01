import { describe, expect, it, vi } from 'vitest'
import type { SpeakingEvaluation, SpeakingSubmission } from '@/domain/types'
import { registerAgentSpeakingTurnHandler } from '@/modules/section-packs/speaking/agentSpeakingCoordinator'
import { createSpeakingToolDefinitions } from './speakingTools'

const attemptId = '33333333-3333-4333-8333-333333333333'
const submission: SpeakingSubmission = {
  attemptId,
  contentKey: 'agent-speaking-interview-v1',
  responses: [{
    recordingId: 'recording-1',
    promptId: 1,
    partLabel: 'Part 1',
    sequence: 0,
    promptText: 'Tell me about your hometown.',
    timeLimitSeconds: 45,
    durationMs: 21_000,
    transcript: 'My hometown is a busy coastal city.',
  }],
  startedAt: '2026-08-31T10:00:00.000Z',
  submittedAt: '2026-08-31T10:05:00.000Z',
}

const evaluationInput = {
  attemptId,
  overallBand: 6.5,
  fluencyCoherence: 6.5,
  lexicalResource: 6.5,
  grammaticalRangeAccuracy: 6,
  summary: 'The answer is direct, clear, and generally well controlled.',
  strengths: ['The response answers the question directly.'],
  improvements: ['Develop ideas with a more specific example.'],
} as const

function toolOptions() {
  return { signal: new AbortController().signal }
}

function createTools(
  evaluation: SpeakingEvaluation | null = null,
  attachSpeakingEvaluation = vi.fn(),
) {
  return createSpeakingToolDefinitions({
    readSpeakingAttempt: async () => ({ submission, evaluation }),
    attachSpeakingEvaluation,
    getCurrentSpeakingAttemptId: () => attemptId,
  })
}

describe('Speaking WebMCP tools', () => {
  it('conducts one question and returns the learner-approved transcript', async () => {
    const unregister = registerAgentSpeakingTurnHandler(async (input) => {
      if (input.finishInterview) return { status: 'interview_completed', submission }
      return {
        status: 'answer_received',
        turnNumber: 1,
        part: input.part,
        transcript: 'My hometown is a busy coastal city.',
        durationMs: 21_000,
      }
    })
    const tool = createTools().find((item) => item.name === 'conduct_speaking_turn')!

    await expect(tool.execute({
      examinerText: 'Tell me about your hometown.',
      part: 1,
      responseTimeSeconds: 45,
      finishInterview: false,
    }, toolOptions())).resolves.toMatchObject({
      ok: true,
      data: {
        status: 'answer_received',
        transcript: 'My hometown is a busy coastal city.',
      },
      sideEffect: { visibleView: 'agent_speaking_interview' },
    })
    unregister()
  })

  it('explains how to prepare the page when Agent interview is not open', async () => {
    const tool = createTools().find((item) => item.name === 'conduct_speaking_turn')!

    await expect(tool.execute({
      examinerText: 'Where do you live?',
      part: 1,
      responseTimeSeconds: 30,
      finishInterview: false,
    }, toolOptions())).resolves.toMatchObject({
      ok: false,
      error: { code: 'SPEAKING_MODE_NOT_READY', retryable: true },
    })
  })

  it('returns transcript evidence without exposing local audio', async () => {
    const tool = createTools().find((item) => item.name === 'get_speaking_submission')!
    const result = await tool.execute({}, toolOptions()) as {
      ok: true
      data: { submission: SpeakingSubmission; scoringScope: { excluded: string[] } }
    }

    expect(result.data.submission.responses[0]?.transcript).toContain('coastal city')
    expect(result.data.scoringScope.excluded).toContain(
      'pronunciation: audio is not exposed to the agent',
    )
    expect(result.data.submission.responses[0]).not.toHaveProperty('audio')
  })

  it('attaches a valid transcript evaluation without accepting pronunciation scoring', async () => {
    const attached: SpeakingEvaluation = {
      ...evaluationInput,
      strengths: [...evaluationInput.strengths],
      improvements: [...evaluationInput.improvements],
      evaluatedAt: '2026-08-31T10:06:00.000Z',
    }
    const attach = vi.fn(async () => attached)
    const tool = createTools(null, attach).find(
      (item) => item.name === 'attach_speaking_evaluation',
    )!

    await expect(tool.execute(evaluationInput, toolOptions())).resolves.toMatchObject({
      ok: true,
      data: { attemptId, overallBand: 6.5 },
      sideEffect: { visibleView: 'speaking_review' },
    })
    expect(attach).toHaveBeenCalledWith(evaluationInput)

    await expect(tool.execute({ ...evaluationInput, pronunciation: 6.5 }, toolOptions()))
      .resolves.toMatchObject({
        ok: false,
        error: { code: 'INVALID_EVALUATION', issues: [{ path: 'input' }] },
      })
  })

  it('does not replace an existing Speaking evaluation', async () => {
    const existing: SpeakingEvaluation = {
      ...evaluationInput,
      strengths: [...evaluationInput.strengths],
      improvements: [...evaluationInput.improvements],
      evaluatedAt: '2026-08-31T10:06:00.000Z',
    }
    const attach = vi.fn()
    const tool = createTools(existing, attach).find(
      (item) => item.name === 'attach_speaking_evaluation',
    )!

    await expect(tool.execute(evaluationInput, toolOptions())).resolves.toMatchObject({
      ok: false,
      error: { code: 'EVALUATION_EXISTS', retryable: false },
    })
    expect(attach).not.toHaveBeenCalled()
  })
})
