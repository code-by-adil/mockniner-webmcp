import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { PendingAttemptReview } from './PendingAttemptReview'
import { writingDocument } from '@/content/writing'
import type { IeltsReview } from '@/domain/session'

describe('pending historical result', () => {
  it.each(['speaking', 'writing'] as const)('shows saved %s status and the exact attempt ID without inventing a score', kind => {
    const common = { attemptId: '11111111-1111-4111-8111-111111111111', contentKey: 'fixture', startedAt: '', submittedAt: '' }
    const review: Exclude<IeltsReview, { kind: 'objective' }> = kind === 'speaking'
      ? { kind, section: kind, part: 1, returnTo: 'home', evaluation: null, submission: { ...common, responses: [] } }
      : { kind, section: kind, part: 1, returnTo: 'home', evaluation: null, submission: { ...common, tasks: [
        { task: writingDocument.tasks[0], response: 'Private draft.', wordCount: 2 }, { task: writingDocument.tasks[1], response: '', wordCount: 0 },
      ] } }
    const html = renderToStaticMarkup(<PendingAttemptReview review={review} onExit={() => undefined} />)
    expect(html).toContain('Awaiting evaluation.')
    expect(html).toContain(common.attemptId)
    expect(html).toContain('Back to practice')
    expect(html).not.toContain('Band ')
    expect(html).not.toContain('Private draft.')
  })
})
