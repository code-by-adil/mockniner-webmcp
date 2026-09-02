// @vitest-environment happy-dom
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Complete, Results } from '@/App'
import { initialSession, type IeltsSession } from '@/domain/session'

const submission = {
  attemptId: '11111111-1111-4111-8111-111111111111', contentKey: 'speaking-test', responses: [],
  startedAt: '2026-09-03T10:00:00.000Z', submittedAt: '2026-09-03T10:10:00.000Z',
}
const pending: IeltsSession = { ...initialSession, view: 'result', currentSection: 'speaking', completedSections: ['speaking'], speakingSubmission: submission }
const noop = () => undefined

describe('Speaking evaluation prompts on submission and results', () => {
  it('offers the copyable, attempt-specific prompt immediately after submission', () => {
    const html = renderToStaticMarkup(<Complete section="speaking" mode="section" speakingAttemptId={submission.attemptId} onContinue={noop} onHome={noop} />)
    expect(html).toContain('Copy evaluation prompt')
    expect(html).toContain(submission.attemptId)
    expect(html).toContain('View results')
  })
  it('keeps the prompt available after View results while evaluation is pending', () => {
    const html = renderToStaticMarkup(<Results session={pending} onHome={noop} onReview={noop} />)
    expect(html).toContain('Awaiting evaluation')
    expect(html).toContain('Copy evaluation prompt')
    expect(html).toContain(submission.attemptId)
    expect(html).not.toContain('Review answers')
  })
  it('does not ask the learner to re-evaluate an already evaluated attempt', () => {
    const html = renderToStaticMarkup(<Results session={{ ...pending, speakingEvaluation: {
      attemptId: submission.attemptId, overallBand: 6, fluencyCoherence: 6, lexicalResource: 6, grammaticalRangeAccuracy: 6,
      summary: 'Test', strengths: ['Test'], improvements: ['Test'], evaluatedAt: '2026-09-03T10:11:00.000Z',
    } }} onHome={noop} onReview={noop} />)
    expect(html).not.toContain('Copy evaluation prompt')
    expect(html).toContain('Review answers')
  })
})
