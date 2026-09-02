import type { ReactElement } from 'react'
import { BookOpen, FileText, Headphones, Mic } from 'lucide-react'
import type { LearningSummary } from '@/domain/learningSummary'

type NativeHistorySection = 'listening' | 'reading' | 'writing' | 'speaking'

type NativeHistoryRow = {
  attemptId: string
  section: NativeHistorySection
  submittedAt: string
  result: string
}

const sectionPresentation = {
  listening: { title: 'Listening Practice', icon: Headphones },
  reading: { title: 'Reading Practice', icon: BookOpen },
  writing: { title: 'Writing Practice', icon: FileText },
  speaking: { title: 'Speaking Practice', icon: Mic },
} as const

function getNativeHistoryRows(
  summary: LearningSummary,
): NativeHistoryRow[] {
  return [
    ...summary.sections.listening.recent.slice(0, 2).map((attempt) => ({
      attemptId: attempt.attemptId,
      section: 'listening' as const,
      submittedAt: attempt.submittedAt,
      result: `Band ${attempt.band} (${attempt.raw}/${attempt.total})`,
    })),
    ...summary.sections.reading.recent.slice(0, 2).map((attempt) => ({
      attemptId: attempt.attemptId,
      section: 'reading' as const,
      submittedAt: attempt.submittedAt,
      result: `Band ${attempt.band} (${attempt.raw}/${attempt.total})`,
    })),
    ...summary.sections.writing.recent.slice(0, 2).map((attempt) => ({
      attemptId: attempt.attemptId,
      section: 'writing' as const,
      submittedAt: attempt.submittedAt,
      result: attempt.overallBand === undefined
        ? 'Awaiting Evaluation'
        : `Band ${attempt.overallBand}`,
    })),
    ...(summary.sections.speaking.recent ?? []).slice(0, 2).map((attempt) => ({
      attemptId: attempt.attemptId,
      section: 'speaking' as const,
      submittedAt: attempt.submittedAt,
      result: attempt.overallBand === undefined ? 'Awaiting Evaluation' : `Band ${attempt.overallBand}`,
    })),
  ].sort((left, right) => right.submittedAt.localeCompare(left.submittedAt))
}

export function NativeAttemptHistoryRows({
  summary,
  onReview,
}: {
  summary: LearningSummary
  onReview: (attemptId: string, section: NativeHistorySection) => Promise<void>
}): ReactElement {
  return (
    <>
      {getNativeHistoryRows(summary).map((attempt) => {
        const presentation = sectionPresentation[attempt.section]
        const Icon = presentation.icon
        return (
          <div
            key={attempt.attemptId}
            data-attempt-id={attempt.attemptId}
            data-section={attempt.section}
            className="flex items-center justify-between p-4"
          >
            <div className="flex items-center gap-3">
              <Icon size={16} className="text-neutral-400" />
              <div>
                <span className="font-semibold text-neutral-800">
                  {presentation.title}
                </span>
                <span className="ml-2 text-[11px] text-neutral-400">
                  {new Date(attempt.submittedAt).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                  })}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2.5">
              <span className="font-bold text-neutral-900">{attempt.result}</span>
                <button
                  type="button"
                  onClick={() => void onReview(attempt.attemptId, attempt.section)}
                  className="rounded border border-neutral-200 px-2.5 py-1 text-[11px] font-medium text-neutral-700 hover:bg-neutral-50"
                >
                  Review
                </button>
            </div>
          </div>
        )
      })}
    </>
  )
}
