// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { SpeakingAttemptReview } from './SpeakingAttemptReview'
import type { SpeakingSubmission } from '@/domain/types'

describe('unscored Speaking feedback', () => {
  it('shows feedback and transcript without a band or empty strengths panel', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    const container = document.createElement('div'); document.body.append(container)
    const root = createRoot(container)
    const submission: SpeakingSubmission = { attemptId: crypto.randomUUID(), contentKey: 'test', responses: [], startedAt: '2026-09-03T10:00:00Z', submittedAt: '2026-09-03T10:10:00Z' }
    try {
      await act(async () => root.render(<SpeakingAttemptReview submission={submission} onExit={() => {}} evaluation={{
        attemptId: submission.attemptId, status: 'insufficient_evidence', reason: 'No usable transcript was submitted.',
        summary: 'Feedback can still guide your next attempt.', strengths: [], improvements: ['Record a complete interview.'], evaluatedAt: '2026-09-03T10:15:00Z',
      }} />))
      expect(container.textContent).toContain('Feedback without a band score')
      expect(container.textContent).toContain('No band assigned.')
      expect(container.textContent).toContain('Record a complete interview.')
      expect(container.textContent).toContain('Interview transcript')
      expect(container.textContent).not.toContain('Overall band')
      expect(container.textContent).not.toContain('Strengths')
    } finally { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals() }
  })
})
