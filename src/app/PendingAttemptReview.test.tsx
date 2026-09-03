import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { PendingAttemptReview } from './PendingAttemptReview'
import { writingDocument } from '@/content/writing'
import type { IeltsReview } from '@/domain/session'

describe('pending historical result', () => {
  it.each(['speaking', 'writing'] as const)('shows the saved %s submission without inventing a score', kind => {
    const common = { attemptId: '11111111-1111-4111-8111-111111111111', contentKey: 'fixture', startedAt: '2026-09-03T10:00:00Z', submittedAt: '2026-09-03T11:00:00Z' }
    const review: Exclude<IeltsReview, { kind: 'objective' }> = kind === 'speaking'
      ? { kind, section: kind, part: 1, returnTo: 'home', evaluation: null, submission: { ...common, responses: [] } }
      : { kind, section: kind, part: 1, returnTo: 'home', evaluation: null, submission: { ...common, tasks: [
        { task: writingDocument.tasks[0], response: 'Private draft.', wordCount: 2 }, { task: writingDocument.tasks[1], response: '', wordCount: 0 },
      ] } }
    const html = renderToStaticMarkup(<PendingAttemptReview review={review} onExit={() => undefined} />)
    expect(html).toContain('Awaiting evaluation')
    expect(html).toContain('Back to practice')
    expect(html).not.toContain('Band ')
    if (kind === 'writing') {
      expect(html).toContain('Private draft.')
      expect(html).toContain('No response submitted.')
      expect(html).toContain('Copy request')
      expect(html).toContain('View task and chart')
      expect(html).toContain(writingDocument.tasks[0].chart.title)
      expect(html).toContain(writingDocument.tasks[1].prompt)
      expect(html).toContain('2 words')
      expect(html).toContain('150 word minimum')
      expect(html).toContain('<header')
      expect(html).not.toContain(common.attemptId)
      expect(html).not.toContain('WebMCP')
      expect(html).not.toContain('<textarea')
    } else {
      expect(html).toContain(common.attemptId)
    }
  })
})
