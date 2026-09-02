import { formatTime } from "@/shared/time";
import { countWords } from "@/shared/text";
import type {
  WritingContentDocument,
  WritingTask1,
  WritingTask2,
} from "@/domain/writingContent";
import { ExamUiBoundary } from "@/app/layouts/ExamUiBoundary";
import { useTimedSubmission } from "@/modules/exam-engine/useTimedSubmission";
import { Header } from "@/modules/exam-engine/ui/Header";
import { WritingExamFooter } from "@/modules/exam-engine/ui/Footer";
import { WritingBarChart } from "@/modules/section-packs/writing/ui/WritingBarChart";
import { QuestionGroupHeader } from "@/shared/ui/exam/QuestionGroupHeader";
import { ResizableSplitPane } from "@/shared/ui/exam/ResizableSplitPane";

const MAX_WRITING_ESSAY_LENGTH = 20_000;

type ResponsePaneProps = {
  taskId: 1 | 2;
  value: string;
  onChange: (value: string) => void;
  isLocked: boolean;
};

function ResponsePane({ taskId, value, onChange, isLocked }: ResponsePaneProps) {
  const wordCount = countWords(value);
  return (
    <div className="flex h-[360px] flex-col md:h-full">
      <div className="mt-4 flex-1 p-4 pt-0 sm:mt-8 sm:p-8 sm:pt-0">
        <textarea
          id={`writing-task-${taskId}-answer`}
          name={`writing_task_${taskId}`}
          aria-label={`Writing Task ${taskId} response`}
          className={`h-full w-full resize-none border border-gray-400 p-3 font-serif text-base leading-relaxed text-gray-800 shadow-inner sm:p-4 sm:text-lg ${isLocked ? "cursor-not-allowed bg-gray-50" : "focus:border-black focus:outline-none"}`}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          maxLength={MAX_WRITING_ESSAY_LENGTH}
          spellCheck={false}
          disabled={isLocked}
        />
      </div>
      <div className="px-4 pb-3 text-right text-sm font-bold text-gray-700 sm:px-8 sm:pb-4">
        Words: {wordCount}
      </div>
    </div>
  );
}

function taskInstruction(task: WritingTask1 | WritingTask2) {
  return `${task.instruction} Write at least ${task.minimumWords} words.`;
}

function WritingPart1({
  task,
  value,
  onChange,
  isLocked,
}: Omit<ResponsePaneProps, "taskId"> & { task: WritingTask1 }) {
  const prompt = (
    <div className="p-4 font-sans text-gray-900 sm:p-8">
      <QuestionGroupHeader title={task.title} instruction={taskInstruction(task)} />
      <div className="mb-4 text-sm font-bold leading-relaxed">{task.lead}</div>
      <div className="mb-8 text-sm font-bold leading-relaxed">{task.prompt}</div>
      <WritingBarChart chart={task.chart} />
    </div>
  );
  return (
    <ResizableSplitPane
      left={prompt}
      right={<ResponsePane taskId={1} value={value} onChange={onChange} isLocked={isLocked} />}
      isRightScrollable={false}
      initialLeftPercent={50}
      minLeftPercent={30}
      maxLeftPercent={70}
      mobileTopPercent={45}
      mobileResizable={false}
    />
  );
}

function WritingPart2({
  task,
  value,
  onChange,
  isLocked,
}: Omit<ResponsePaneProps, "taskId"> & { task: WritingTask2 }) {
  const prompt = (
    <div className="p-4 font-sans text-gray-900 sm:p-8">
      <QuestionGroupHeader title={task.title} instruction={taskInstruction(task)} />
      <div className="mb-6 text-sm text-black">{task.lead}</div>
      <div className="mb-8 text-sm font-bold leading-relaxed text-black">{task.prompt}</div>
      <div className="text-sm leading-relaxed text-black">{task.guidance}</div>
    </div>
  );
  return (
    <ResizableSplitPane
      left={prompt}
      right={<ResponsePane taskId={2} value={value} onChange={onChange} isLocked={isLocked} />}
      isRightScrollable={false}
      initialLeftPercent={50}
      minLeftPercent={30}
      maxLeftPercent={70}
      mobileTopPercent={40}
      mobileResizable={false}
    />
  );
}

type WritingExamRunnerProps = {
  document: WritingContentDocument;
  answers: Record<1 | 2, string>;
  currentPart: 1 | 2;
  secondsRemaining: number;
  onExit: () => void;
  onAnswerChange: (part: 1 | 2, value: string) => void;
  onPartChange: (part: 1 | 2) => void;
  onTick: () => void;
  onSubmit: () => unknown | Promise<unknown>;
};

export function WritingExamRunner({
  document,
  answers,
  currentPart,
  secondsRemaining,
  onExit,
  onAnswerChange,
  onPartChange,
  onTick,
  onSubmit,
}: WritingExamRunnerProps) {
  const { isSubmitting, submissionError, submit } = useTimedSubmission({
    secondsRemaining,
    onTick,
    onSubmit,
    fallbackError: "Unable to submit this Writing test.",
  });
  const task = document.tasks[currentPart - 1];

  return (
    <ExamUiBoundary>
      <div className="flex h-screen flex-col overflow-hidden bg-white font-sans text-gray-900">
        <Header
          testType="writing"
          onExit={onExit}
          writingTaskNumber={currentPart}
          timeLeft={formatTime(secondsRemaining)}
          isTimerWarning={secondsRemaining <= 300}
        />

        <div className="mb-[64px] mt-[60px] flex min-h-0 flex-1 flex-col sm:mb-[72px]">
          {submissionError ? (
            <div className="shrink-0 border-b border-red-200 bg-red-50 px-6 py-2 text-xs font-bold text-red-700">
              {submissionError}
            </div>
          ) : null}
          <div className="relative min-h-0 flex-1">
            {task.type === "academic_task_1_bar_chart" ? (
              <WritingPart1
                task={task}
                value={answers[1]}
                onChange={(value) => onAnswerChange(1, value)}
                isLocked={isSubmitting}
              />
            ) : (
              <WritingPart2
                task={task}
                value={answers[2]}
                onChange={(value) => onAnswerChange(2, value)}
                isLocked={isSubmitting}
              />
            )}
          </div>
        </div>

        <WritingExamFooter
          currentPart={currentPart}
          answers={answers}
          parts={[1, 2]}
          onPartChange={(part) => {
            if (part === 1 || part === 2) onPartChange(part);
          }}
          onSubmit={() => void submit()}
          isSubmitting={isSubmitting}
        />
      </div>
    </ExamUiBoundary>
  );
}
