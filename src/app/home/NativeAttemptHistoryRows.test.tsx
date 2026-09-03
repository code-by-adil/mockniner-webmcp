import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { LearningSummary } from '@/domain/learningSummary'
import { NativeAttemptHistoryRows } from './NativeAttemptHistoryRows'

const summary: LearningSummary = {
  totalAttempts: 3,
  sections: {
    listening: { attemptCount: 0, recentAverageBand: null, recent: [] },
    reading: {
      attemptCount: 2,
      recentAverageBand: 6.75,
      recent: [
        {
          attemptId: 'newer-reading-attempt',
          contentKey: 'reading-v2',
          band: 7,
          raw: 30,
          total: 40,
          answered: 40,
          submittedAt: '2026-09-02T11:00:00.000Z',
        },
        {
          attemptId: 'older-reading-attempt',
          contentKey: 'reading-v1',
          band: 6.5,
          raw: 27,
          total: 40,
          answered: 40,
          submittedAt: '2026-09-01T11:00:00.000Z',
        },
      ],
    },
    writing: {
      attemptCount: 1,
      evaluatedCount: 0,
      recentAverageOverallBand: null,
      recentAverageCriteria: null,
      recent: [{
        attemptId: 'pending-writing-attempt',
        contentKey: 'writing-v1',
        status: 'submitted',
        submittedAt: '2026-09-02T12:00:00.000Z',
      }],
    },
    speaking: { attemptCount: 0 },
  },
}

describe('native attempt history rows', () => {
  it('shows saved Speaking attempts and a review button for evaluated interviews', () => {
    const html = renderToStaticMarkup(<NativeAttemptHistoryRows summary={{ ...summary, sections: {
      ...summary.sections, speaking: { attemptCount: 2, recent: [
        { attemptId: 'speaking-qa', submittedAt: '2026-09-03T10:00:00.000Z', overallBand: 6 },
        { attemptId: 'speaking-pending', submittedAt: '2026-09-02T10:00:00.000Z' },
      ] },
    } }} onReview={async () => undefined} />)
    expect(html).toContain('data-attempt-id="speaking-qa" data-section="speaking"')
    expect(html).toContain('Speaking practice')
    expect(html.match(/>Review<\/button>/g)).toHaveLength(5)
    expect(html).toContain('speaking-pending')
  })
  it('renders distinct row identities for two attempts in the same section', () => {
    const html = renderToStaticMarkup(
      <NativeAttemptHistoryRows summary={summary} onReview={async () => undefined} />,
    )

    expect(html).toContain(
      'data-attempt-id="newer-reading-attempt" data-section="reading"',
    )
    expect(html).toContain(
      'data-attempt-id="older-reading-attempt" data-section="reading"',
    )
    expect(html.match(/>Review<\/button>/g)).toHaveLength(3)
    expect(html).toContain('Feedback pending')
  })
})
