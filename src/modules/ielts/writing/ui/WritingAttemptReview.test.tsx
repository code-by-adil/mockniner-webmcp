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
        onCorrectionSelect={() => undefined}
        onPartChange={() => undefined}
        onExit={() => undefined}
      />,
    )

    expect(markup).toContain('Writing review')
    expect(markup).toContain('Assessment ')
    expect(markup).toContain('>Lab</span>')
    expect(markup).toContain('Agent evaluation')
    expect(markup).toContain('Both tasks address the prompt clearly.')
    expect(markup).toContain('Revision 1')
    expect(markup).toContain('Task response')
    expect(markup).toContain('Grammatical range &amp; accuracy')
    expect(markup).toContain('Task 1')
    expect(markup).toContain('Task 2')
    expect(markup).toContain('Task score')
    expect(markup).toContain('7.0')
    expect(markup).toContain('1 correction')
    expect(markup).toContain('This version states the categories more precisely')
    expect(markup).toContain('The response is focused and logically organised.')
    expect(markup).toContain('Back to results')
    expect(markup).toContain('aria-label="Open agent feedback"')
    expect(markup).toContain('Agent feedback')
    expect(markup).not.toMatch(/examiner feedback/i)
    expect(markup).toContain(submission.tasks[1].task.prompt)
    expect(markup).toContain('View task')
    expect(markup).not.toContain('Task 1 chart')
    expect(markup).toContain('aria-label="Back to results"')
    expect(markup).not.toContain('<textarea')
  })
  it('includes the original Task 1 prompt and chart from the saved submission', () => {
    const saved = structuredClone(submission)
    saved.tasks[0].task.title = 'Original saved task'
    saved.tasks[0].task.prompt = 'Summarise this saved chart, not a replacement task.'
    const markup = renderToStaticMarkup(<WritingAttemptReview submission={saved} evaluation={{ ...evaluation, revision: 2, summary: 'Revised feedback.' }} currentPart={1} onCorrectionSelect={() => undefined} onPartChange={() => undefined} onExit={() => undefined} />)
    expect(markup).toContain('Revision 2')
    expect(markup).toContain('Revised feedback.')
    expect(markup).toContain('View task and chart')
    expect(markup).toContain('Original saved task')
    expect(markup).toContain(saved.tasks[0].task.prompt)
    expect(markup).toContain('aria-label="Task 1 chart"')
    if (saved.tasks[0].task.type === 'academic_task_1_bar_chart') {
      expect(markup).toContain(saved.tasks[0].task.chart.title)
    }
    expect(markup).toContain(saved.tasks[0].response)
  })
  it('keeps the history return label after evaluation', () => {
    const markup = renderToStaticMarkup(<WritingAttemptReview submission={submission} evaluation={evaluation} currentPart={1} onCorrectionSelect={() => undefined} onPartChange={() => undefined} onExit={() => undefined} backLabel="Back to practice" />)
    expect(markup).toContain('aria-label="Back to practice"')
    expect(markup).not.toContain('Back to results')
  })
})
