// @vitest-environment happy-dom
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Complete, Results } from '@/App'
import { initialSession, type IeltsSession } from '@/domain/session'

const submission = {
  attemptId: '11111111-1111-4111-8111-111111111111', contentKey: 'speaking-test', responses: [],
  startedAt: '2026-09-03T10:00:00.000Z', submittedAt: '2026-09-03T10:10:00.000Z',
}
const pending: IeltsSession = { ...initialSession, mode: 'section', view: 'result', currentSection: 'speaking', completedSections: ['speaking'], speakingSubmission: submission }
const noop = () => undefined

describe('Speaking evaluation prompts on submission and results', () => {
  it('offers a request for the visible attempt immediately after submission', () => {
    const html = renderToStaticMarkup(<Complete section="speaking" mode="section" speakingAttemptId={submission.attemptId} onContinue={noop} onHome={noop} />)
    expect(html).toContain('Copy request')
    expect(html).toContain(submission.attemptId)
    expect(html).toContain('that same attempt')
    expect(html).toContain('View submission')
    expect(html).not.toContain('If you haven’t already asked for feedback')
  })
  it('keeps the prompt available after View results while evaluation is pending', () => {
    const html = renderToStaticMarkup(<Results session={pending} onHome={noop} onReview={noop} />)
    expect(html).toContain('Not yet evaluated')
    expect(html).toContain('Copy request')
    expect(html).toContain(submission.attemptId)
    expect(html).toContain('Speaking submission')
    expect(html).toContain('If you haven’t already asked for feedback')
    expect(html).not.toContain('Writing and Speaking')
    expect(html).not.toContain('Review answers')
  })
  it('does not ask the learner to re-evaluate an already evaluated attempt', () => {
    const html = renderToStaticMarkup(<Results session={{ ...pending, speakingEvaluation: {
      attemptId: submission.attemptId, overallBand: 6, fluencyCoherence: 6, lexicalResource: 6, grammaticalRangeAccuracy: 6,
      summary: 'Test', strengths: ['Test'], improvements: ['Test'], evaluatedAt: '2026-09-03T10:11:00.000Z',
    } }} onHome={noop} onReview={noop} />)
    expect(html).not.toContain('Copy request')
    expect(html).not.toContain('Ask your agent')
    expect(html).toContain('Review answers')
  })
})
