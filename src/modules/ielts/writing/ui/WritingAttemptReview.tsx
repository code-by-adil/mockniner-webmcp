import { ExamUiBoundary } from '@/app/layouts/ExamUiBoundary'
import type {
  WritingEvaluation,
  WritingSubmission,
} from '@/domain/types'
import { WritingReviewView } from '@/modules/ielts/writing/ui/WritingReviewView'

type Props = {
  submission: WritingSubmission
  evaluation: WritingEvaluation
  currentPart: 1 | 2
  onPartChange: (part: 1 | 2) => void
  onExit: () => void
  backLabel?: string
  selectedCorrectionId?: string
  onCorrectionSelect?: (correctionId: string) => void
  focusRequest?: object
}

export function WritingAttemptReview({
  submission,
  evaluation,
  currentPart,
  onPartChange,
  onExit,
  backLabel,
  selectedCorrectionId,
  onCorrectionSelect,
  focusRequest,
}: Props) {
  const submittedTask = submission.tasks[currentPart - 1]
  const taskEvaluation = currentPart === 1 ? evaluation.task1 : evaluation.task2

  return (
    <ExamUiBoundary>
      <WritingReviewView
        submittedTask={submittedTask}
        scoreData={taskEvaluation}
        evaluationSummary={evaluation.summary}
        overallBand={evaluation.overallBand}
        evaluatedAt={evaluation.evaluatedAt}
        evaluationRevision={evaluation.revision ?? 1}
        selectedCorrectionId={selectedCorrectionId}
        onCorrectionSelect={onCorrectionSelect}
        focusRequest={focusRequest}
        onClose={onExit}
        backLabel={backLabel}
        taskOptions={[
          { id: 1, label: 'Task 1' },
          { id: 2, label: 'Task 2' },
        ]}
        activeTaskId={currentPart}
        onTaskChange={onPartChange}
      />
    </ExamUiBoundary>
  )
}
