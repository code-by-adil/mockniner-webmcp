import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { writingDocument } from '@/content/writing'
import type {
  WritingEvaluation,
  WritingSubmission,
  WritingTaskEvaluation,
} from '@/domain/types'
import { WritingAttemptReview } from './WritingAttemptReview'

const attemptId = '22222222-2222-4222-8222-222222222222'
const submission: WritingSubmission = {
  attemptId,
  contentKey: 'local-writing-v1',
  tasks: [
    {
      task: writingDocument.tasks[0],
      response: 'The chart shows a clear rise in participation.',
      wordCount: 9,
    },
    {
      task: writingDocument.tasks[1],
      response: 'Living alone has both social and economic causes.',
      wordCount: 9,
    },
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
  feedback: 'The response is focused and logically organised.',
  annotations: [{
    id: 'task-2-clarity-1',
    taskNumber: 2,
    originalText: 'social and economic causes',
    suggestion: 'social, demographic, and economic causes',
    explanation: 'This version states the categories more precisely.',
    type: 'vocabulary',
  }],
} satisfies WritingTaskEvaluation

const evaluation: WritingEvaluation = {
  attemptId,
  overallBand: 7,
  summary: 'Both tasks address the prompt clearly.',
  task1: taskEvaluation,
  task2: taskEvaluation,
  evaluatedAt: '2026-08-31T11:05:00.000Z',
}

describe('Writing review surface', () => {
  it('renders the writing review for the selected task', () => {
    const markup = renderToStaticMarkup(
      <WritingAttemptReview
        submission={submission}
        evaluation={evaluation}
        currentPart={2}
        onPartChange={() => undefined}
        onExit={() => undefined}
      />,
    )

    expect(markup).toContain('Writing Review')
    expect(markup).toContain('Assessment ')
    expect(markup).toContain('>Lab</span>')
    expect(markup).toContain('Agent evaluation')
    expect(markup).toContain('Both tasks address the prompt clearly.')
    expect(markup).toContain('Task response')
    expect(markup).toContain('Grammatical range &amp; accuracy')
    expect(markup).toContain('Task 1')
    expect(markup).toContain('Task 2')
    expect(markup).toContain('Task score')
    expect(markup).toContain('7.0')
    expect(markup).toContain('1 correction')
    expect(markup).toContain('This version states the categories more precisely')
    expect(markup).toContain('The response is focused and logically organised.')
    expect(markup).toContain('Back to Results')
    expect(markup).toContain('aria-label="Open agent evaluation and examiner feedback"')
    expect(markup).toContain('aria-label="Back to results"')
    expect(markup).not.toContain('<textarea')
  })
})
