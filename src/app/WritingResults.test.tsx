// @vitest-environment happy-dom
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Results } from '@/App'
import { PendingAttemptReview } from './PendingAttemptReview'
import { writingDocument } from '@/content/writing'
import { initialSession, type IeltsSession } from '@/domain/session'
import type { WritingSubmission } from '@/domain/types'

const submission: WritingSubmission = {
  attemptId: '11111111-1111-4111-8111-111111111111', contentKey: writingDocument.contentKey,
  startedAt: '2026-09-03T10:00:00Z', submittedAt: '2026-09-03T11:00:00Z',
  tasks: [
    { task: writingDocument.tasks[0], response: 'My saved report.', wordCount: 3 },
    { task: writingDocument.tasks[1], response: 'My saved essay.\n\nAnother paragraph.', wordCount: 5 },
  ],
}
const pending: IeltsSession = { ...initialSession, mode: 'section', view: 'result', currentSection: 'writing', completedSections: ['writing'], writingSubmission: submission }
const noop = () => undefined

describe('pending Writing results', () => {
  it('opens the same submitted tasks from standalone results and history', () => {
    const results = renderToStaticMarkup(<Results session={pending} onHome={noop} onReview={noop} />)
    const history = renderToStaticMarkup(<PendingAttemptReview review={{ kind: 'writing', section: 'writing', part: 1, returnTo: 'home', evaluation: null, submission }} onExit={noop} />)
    expect(results).toBe(history)
    expect(results).toContain('My saved report.')
    expect(results).toContain('My saved essay.\n\nAnother paragraph.')
    expect(results).toContain('Awaiting evaluation')
    expect(results).not.toContain('Objective answers')
  })
  it('offers a pending submission action from a full-exam results overview', () => {
    const html = renderToStaticMarkup(<Results session={{ ...pending, mode: 'full' }} onHome={noop} onReview={noop} />)
    expect(html).toContain('View submission')
    expect(html).toContain('Task 1: 3 words')
    expect(html).toContain('Awaiting evaluation')
  })
  it('uses the results return label when reviewing a full-exam submission', () => {
    const html = renderToStaticMarkup(<PendingAttemptReview review={{ kind: 'writing', section: 'writing', part: 1, returnTo: 'result', evaluation: null, submission }} onExit={noop} />)
    expect(html).toContain('Back to results')
  })
})
