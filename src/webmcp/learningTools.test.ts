import { describe, expect, it, vi } from 'vitest'
import type { LearningSummary } from '@/domain/learningSummary'
import { createLearningToolDefinitions } from './learningTools'

const emptySummary: LearningSummary = {
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
}

function toolOptions() {
  return { signal: new AbortController().signal }
}

describe('learning-summary WebMCP tool', () => {
  it('uses a bounded default and returns compact local performance', async () => {
    const readLearningSummary = vi.fn(async () => emptySummary)
    const [tool] = createLearningToolDefinitions({
      readLearningSummary,
      now: () => new Date('2026-09-01T10:00:00.000Z'),
    })

    const result = await tool!.execute({}, toolOptions())

    expect(readLearningSummary).toHaveBeenCalledWith(5)
    expect(result).toMatchObject({
      ok: true,
      data: {
        generatedAt: '2026-09-01T10:00:00.000Z',
        recentLimit: 5,
        totalAttempts: 0,
      },
    })
    expect(tool!.annotations).toMatchObject({
      readOnlyHint: true,
      untrustedContentHint: true,
    })
  })

  it('returns a repairable error for an excessive history request', async () => {
    const [tool] = createLearningToolDefinitions({
      readLearningSummary: async () => emptySummary,
    })

    await expect(
      tool!.execute({ recentLimit: 11 }, toolOptions()),
    ).resolves.toMatchObject({
      ok: false,
      error: {
        code: 'INVALID_INPUT',
        retryable: true,
        issues: [{ path: 'recentLimit' }],
      },
    })
  })
})
