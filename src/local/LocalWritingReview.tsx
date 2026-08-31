import { ExamUiBoundary } from '@/app/layouts/UiLayerBoundary'
import type {
  WritingEvaluation,
  WritingSubmission,
} from '@/domain/types'
import { WritingReviewView } from '@/modules/section-packs/writing/ui/WritingReviewView'

type Props = {
  submission: WritingSubmission
  evaluation: WritingEvaluation
  currentPart: 1 | 2
  onPartChange: (part: 1 | 2) => void
  onExit: () => void
}

export function LocalWritingReview({
  submission,
  evaluation,
  currentPart,
  onPartChange,
  onExit,
}: Props) {
  const submittedTask = submission.tasks[currentPart - 1]
  const taskEvaluation = currentPart === 1 ? evaluation.task1 : evaluation.task2

  return (
    <ExamUiBoundary>
      <WritingReviewView
        essay={submittedTask.response}
        scoreData={taskEvaluation}
        onClose={onExit}
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
