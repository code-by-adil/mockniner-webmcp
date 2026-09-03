import { useEffect, useRef } from 'react'
import { ArrowLeft } from 'lucide-react'
import { PracticeHeader } from '@/app/layouts/PracticeHeader'
import { CopyButton } from '@/shared/ui/CopyButton'
import type { WritingSubmission } from '@/domain/types'
import { WritingTaskDisclosure } from './WritingTaskDisclosure'

const evaluationRequest = 'Grade my IELTS Writing and add feedback to the submission open on this page.'

function EvaluationRequest() {
  return (
    <section aria-label="Writing feedback" className="rounded-lg border border-neutral-200 bg-white p-5 sm:p-6">
      <h2 className="font-semibold text-neutral-950">Ready for feedback</h2>
      <p className="mt-2 text-sm leading-6 text-neutral-600">Your writing is saved. Copy this request to your agent and keep this page open to receive feedback.</p>
      <div className="mt-4 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <blockquote className="select-text text-sm leading-6 text-neutral-900">{evaluationRequest}</blockquote>
        <CopyButton
          text={evaluationRequest}
          label="Copy request"
          className="inline-flex shrink-0 items-center gap-2 rounded border border-[var(--exam-accent-border)] bg-[var(--exam-accent)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--exam-accent-hover)] disabled:opacity-60"
        />
      </div>
    </section>
  )
}

export function PendingWritingReview({ submission, onExit, backLabel = 'Back to practice', selectedTask, focusRequest }: {
  submission: WritingSubmission
  onExit: () => void
  selectedTask?: number
  focusRequest?: object
  backLabel?: string
}) {
  const tasks = useRef<Record<number, HTMLElement | null>>({})
  useEffect(() => {
    if (!selectedTask) return
    const target = tasks.current[selectedTask]
    target?.focus({ preventScroll: true })
    target?.scrollIntoView({ block: 'start' })
  }, [selectedTask, focusRequest])
  return (
    <div className="min-h-screen bg-[var(--exam-surface-muted)] text-[var(--exam-text)]">
      <PracticeHeader />
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
        <button type="button" onClick={onExit} className="mb-6 inline-flex items-center gap-2 rounded py-2 text-sm font-semibold text-neutral-700 hover:text-neutral-950">
          <ArrowLeft size={16} aria-hidden="true" /> {backLabel}
        </button>
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Writing submission</h1>
          <p className="mt-2 text-sm leading-6 text-neutral-600">
            Submitted <time dateTime={submission.submittedAt}>{new Date(submission.submittedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</time>. Your submitted writing is saved below.
          </p>
        </div>
        <EvaluationRequest key={submission.attemptId} />
        <div className="mt-6 space-y-6">
          {submission.tasks.map(({ task, response, wordCount }) => (
            <section ref={node => { tasks.current[task.id] = node }} tabIndex={-1} key={`${submission.attemptId}-${task.id}`} aria-labelledby={`submitted-writing-task-${task.id}`} className="min-w-0 rounded-lg border border-neutral-200 bg-white">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-200 px-5 py-4 sm:px-6">
                <h2 id={`submitted-writing-task-${task.id}`} className="text-lg font-semibold">Task {task.id}</h2>
                <p className="text-sm text-neutral-600">{wordCount} {wordCount === 1 ? 'word' : 'words'} <span className="text-neutral-500">/ {task.minimumWords} word minimum</span></p>
              </div>
              <WritingTaskDisclosure task={task} />
              <div className="px-5 py-5 sm:px-6 sm:py-6">
                <h3 className="mb-3 text-sm font-semibold text-neutral-700">Your response</h3>
                {response.trim()
                  ? <div className="select-text whitespace-pre-wrap font-serif text-base leading-8 text-neutral-900 [overflow-wrap:anywhere] sm:text-lg">{response}</div>
                  : <p className="text-sm text-neutral-500">No response submitted.</p>}
              </div>
            </section>
          ))}
        </div>
      </main>
    </div>
  )
}
