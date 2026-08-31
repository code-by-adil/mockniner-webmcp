import { describe, expect, it, vi } from 'vitest'
import { writingTasks } from '@/content/writing'
import type { WritingEvaluation, WritingSubmission } from '@/domain/types'
import { createWritingToolDefinitions } from './useWritingTools'

const attemptId = '22222222-2222-4222-8222-222222222222'
const submission: WritingSubmission = {
  attemptId,
  contentKey: 'local-writing-v1',
  tasks: [
    { task: writingTasks[0], response: 'Task one answer.', wordCount: 3 },
    { task: writingTasks[1], response: 'Task two answer.', wordCount: 3 },
  ],
  startedAt: '2026-08-31T10:00:00.000Z',
  submittedAt: '2026-08-31T11:00:00.000Z',
}

const taskEvaluation = {
  band: 7,
  taskAchievement: 7,
  coherenceCohesion: 7,
  lexicalResource: 7,
  grammaticalRange: 6.5,
  feedback: 'Clear and relevant.',
  annotations: [],
}

const evaluationInput = {
  attemptId,
  overallBand: 7,
  summary: 'A competent response.',
  task1: taskEvaluation,
  task2: taskEvaluation,
}

function toolOptions() {
  return { signal: new AbortController().signal }
}

describe('Writing WebMCP tools', () => {
  it('returns the immutable submission and evaluation status', async () => {
    const tools = createWritingToolDefinitions({
      readWritingAttempt: async () => ({ submission, evaluation: null }),
      attachWritingEvaluation: vi.fn(),
    })
    const tool = tools.find((item) => item.name === 'get_writing_submission')!

    const result = await tool.execute({}, toolOptions())

    const parsed = JSON.parse(result as string)
    expect(parsed.submission.attemptId).toBe(attemptId)
    expect(parsed.submission.tasks[0].response).toBe('Task one answer.')
    expect(parsed.evaluationStatus).toBe('awaiting_evaluation')
    expect(tool.annotations).toMatchObject({ readOnlyHint: true, untrustedContentHint: true })
  })

  it('validates and attaches a structured evaluation', async () => {
    const attached: WritingEvaluation = {
      ...evaluationInput,
      evaluatedAt: '2026-08-31T11:05:00.000Z',
    }
    const attachWritingEvaluation = vi.fn(async () => attached)
    const tools = createWritingToolDefinitions({
      readWritingAttempt: async () => ({ submission, evaluation: null }),
      attachWritingEvaluation,
    })
    const tool = tools.find((item) => item.name === 'attach_writing_evaluation')!

    const result = await tool.execute(evaluationInput, toolOptions())

    expect(attachWritingEvaluation).toHaveBeenCalledWith(evaluationInput)
    expect(JSON.parse(result as string)).toMatchObject({
      status: 'attached',
      attemptId,
      visibleView: 'writing_review',
    })
  })

  it('rejects non-IELTS band increments with an actionable path', async () => {
    const tools = createWritingToolDefinitions({
      readWritingAttempt: async () => ({ submission, evaluation: null }),
      attachWritingEvaluation: vi.fn(),
    })
    const tool = tools.find((item) => item.name === 'attach_writing_evaluation')!

    await expect(
      tool.execute({ ...evaluationInput, overallBand: 7.3 }, toolOptions()),
    ).rejects.toThrow('overallBand: Band scores must use whole or half-band increments.')
  })
})
