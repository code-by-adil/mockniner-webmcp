import React, { useCallback, useEffect, useRef, useState } from "react";
import { formatTime } from "@ielts/shared";
import { ExamUiBoundary } from "@/app/layouts/UiLayerBoundary";
import { Header } from "@/modules/exam-engine/ui/Header";
import { WritingExamFooter } from "@/modules/exam-engine/ui/Footer";
import { QuestionGroupHeader } from "@/shared/ui/exam/QuestionGroupHeader";
import { ResizableSplitPane } from "@/shared/ui/exam/ResizableSplitPane";
import { writingTasks } from "@/content/writing";

const MAX_WRITING_ESSAY_LENGTH = 20_000;
const WritingPart1: React.FC<{
  value: string;
  onChange: (val: string) => void;
  leadText: string;
  promptText: string;
  isLocked?: boolean;
}> = ({ value, onChange, leadText, promptText, isLocked }) => {
  const wordCount = value.trim() === "" ? 0 : value.trim().split(/\s+/).length;

  const leftContent = (
    <div className="text-gray-900 font-sans p-4 sm:p-8">
      <QuestionGroupHeader
        title="Part 1"
        instruction="You should spend about 20 minutes on this task. Write at least 150 words."
      />

      <div className="text-sm font-bold mb-4 leading-relaxed">{leadText}</div>

      <div className="text-sm font-bold mb-8 leading-relaxed">{promptText}</div>

      {/* Chart Visualization */}
      <div className="mb-8 pt-4 select-none">
        <h4 className="text-center font-bold mb-10 text-sm">
          Number of adults participating in major sports,
          <br />
          1997 and 2017
        </h4>

        {/* Chart Container */}
        <div className="relative ml-8 sm:ml-12 mb-24 border-l border-b border-black max-w-[500px] mr-auto h-[220px] sm:h-[320px]">
          {/* Y Axis Label */}
          <div className="absolute -left-8 sm:-left-12 top-1/2 -rotate-90 text-[10px] sm:text-xs font-bold whitespace-nowrap -translate-y-1/2 origin-center text-center">
            Number of adults in thousands
          </div>

          {/* Y Axis Ticks & Grid */}
          <div className="absolute inset-0 pointer-events-none">
            {[0, 10, 20, 30, 40, 50, 60].map((val) => (
              <div
                key={val}
                className="absolute left-0 w-full flex items-center"
                style={{ bottom: `${(val / 60) * 100}%` }}
              >
                {/* Tick Label */}
                <span className="absolute right-full mr-1 sm:mr-2 text-[10px] sm:text-xs translate-y-[50%] font-medium">
                  {val}
                </span>
                {/* Tick Mark */}
                <div className="w-1.5 border-t border-black absolute -left-1.5"></div>
                {/* Grid Line */}
                {val > 0 && (
                  <div className="w-full border-t border-gray-400 z-0"></div>
                )}
              </div>
            ))}
          </div>

          {/* Bars Container */}
          <div className="absolute inset-0 flex items-end px-2 sm:px-4 gap-2 sm:gap-6 z-10">
            {[
              { label: "Tennis", v1: 50, v2: 54 },
              { label: "Basketball", v1: 10, v2: 22 },
              { label: "Cricket", v1: 25, v2: 8 },
              { label: "Golf", v1: 32, v2: 34 },
              { label: "Swimming", v1: 35, v2: 35 },
              { label: "Football", v1: 32, v2: 48 },
              { label: "Rugby", v1: 33, v2: 49 },
            ].map((item, idx) => (
              <div
                key={idx}
                className="flex-1 flex items-end justify-center h-full relative group"
              >
                {/* Bar 1 (1997) */}
                <div
                  className="w-full bg-[#333] hover:bg-[#222] transition-colors relative"
                  style={{ height: `${(item.v1 / 60) * 100}%` }}
                >
                  <div className="opacity-0 group-hover:opacity-100 absolute bottom-full left-1/2 -translate-x-1/2 mb-1 bg-black text-white text-[10px] px-1 rounded pointer-events-none whitespace-nowrap z-30 shadow-sm">
                    1997: {item.v1}
                  </div>
                </div>
                {/* Bar 2 (2017) */}
                <div
                  className="w-full bg-[#999] hover:bg-[#888] transition-colors relative"
                  style={{ height: `${(item.v2 / 60) * 100}%` }}
                >
                  <div className="opacity-0 group-hover:opacity-100 absolute bottom-full left-1/2 -translate-x-1/2 mb-1 bg-black text-white text-[10px] px-1 rounded pointer-events-none whitespace-nowrap z-30 shadow-sm">
                    2017: {item.v2}
                  </div>
                </div>

                {/* X-Axis Label */}
                <div className="absolute top-[100%] left-1/2 w-0 h-0 overflow-visible">
                  <span className="absolute top-2 left-0 text-[11px] font-medium text-gray-800 rotate-45 origin-top-left whitespace-nowrap">
                    {item.label}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Legend & Label Wrapper */}
        <div className="ml-8 sm:ml-12 max-w-[500px] mr-auto text-center">
          {/* Major sport label */}
          <div className="text-xs font-bold mb-6">Major sport</div>

          {/* Legend */}
          <div className="flex justify-center gap-8">
            <div className="flex items-center gap-2 text-xs font-bold">
              <div className="w-4 h-4 bg-[#333]"></div> 1997
            </div>
            <div className="flex items-center gap-2 text-xs font-bold">
              <div className="w-4 h-4 bg-[#999]"></div> 2017
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const rightContent = (
    <div className="h-[360px] md:h-full flex flex-col">
      <div className="flex-1 p-4 sm:p-8 pt-0 mt-4 sm:mt-8">
        <textarea
          id="writing-task-1-answer"
          name="writing_task_1"
          aria-label="Writing Task 1 response"
          className={`w-full h-full border border-gray-400 p-3 sm:p-4 resize-none font-serif text-base sm:text-lg leading-relaxed text-gray-800 shadow-inner ${isLocked ? "bg-gray-50 cursor-not-allowed" : "focus:outline-none focus:border-black"}`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={MAX_WRITING_ESSAY_LENGTH}
          spellCheck={false}
          disabled={isLocked}
        />
      </div>
      <div className="px-4 sm:px-8 pb-3 sm:pb-4 text-right font-bold text-sm text-gray-700">
        Words: {wordCount}
      </div>
    </div>
  );

  return (
    <ResizableSplitPane
      left={leftContent}
      right={rightContent}
      isRightScrollable={false}
      initialLeftPercent={50}
      minLeftPercent={30}
      maxLeftPercent={70}
      mobileTopPercent={45}
      mobileResizable={false}
    />
  );
};

// --- Part 2 Component ---
const WritingPart2: React.FC<{
  value: string;
  onChange: (val: string) => void;
  topicText: string;
  promptText: string;
  isLocked?: boolean;
}> = ({ value, onChange, topicText, promptText, isLocked }) => {
  const wordCount = value.trim() === "" ? 0 : value.trim().split(/\s+/).length;

  const leftContent = (
    <div className="text-gray-900 font-sans p-4 sm:p-8">
      <QuestionGroupHeader
        title="Part 2"
        instruction="You should spend about 40 minutes on this task. Write at least 250 words."
      />

      <div className="text-sm mb-6 text-black">
        Write about the following topic:
      </div>

      <div className="font-bold text-sm mb-8 leading-relaxed text-black">
        <p className="mb-4">{topicText}</p>
        <p>{promptText}</p>
      </div>

      <div className="text-sm leading-relaxed text-black">
        Give reasons for your answer and include any relevant examples from your
        own knowledge or experience.
      </div>
    </div>
  );

  const rightContent = (
    <div className="h-[360px] md:h-full flex flex-col">
      <div className="flex-1 p-4 sm:p-8 pt-0 mt-4 sm:mt-8">
        <textarea
          id="writing-task-2-answer"
          name="writing_task_2"
          aria-label="Writing Task 2 response"
          className={`w-full h-full border border-gray-400 p-3 sm:p-4 resize-none font-serif text-base sm:text-lg leading-relaxed text-gray-800 shadow-inner ${isLocked ? "bg-gray-50 cursor-not-allowed" : "focus:outline-none focus:border-black"}`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={MAX_WRITING_ESSAY_LENGTH}
          spellCheck={false}
          disabled={isLocked}
        />
      </div>
      <div className="px-4 sm:px-8 pb-3 sm:pb-4 text-right font-bold text-sm text-gray-700">
        Words: {wordCount}
      </div>
    </div>
  );

  return (
    <ResizableSplitPane
      left={leftContent}
      right={rightContent}
      isRightScrollable={false}
      initialLeftPercent={50}
      minLeftPercent={30}
      maxLeftPercent={70}
      mobileTopPercent={40}
      mobileResizable={false}
    />
  );
};


type LocalWritingExamProps = {
  answers: Record<1 | 2, string>;
  currentPart: 1 | 2;
  secondsRemaining: number;
  onExit: () => void;
  onAnswerChange: (part: 1 | 2, value: string) => void;
  onPartChange: (part: 1 | 2) => void;
  onTick: () => void;
  onSubmit: () => unknown | Promise<unknown>;
};

export function LocalWritingExam({
  answers,
  currentPart,
  secondsRemaining,
  onExit,
  onAnswerChange,
  onPartChange,
  onTick,
  onSubmit,
}: LocalWritingExamProps) {
  const onTickRef = useRef(onTick);
  const onSubmitRef = useRef<() => void>(() => undefined);
  const timeoutHandledRef = useRef(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);

  const handleSubmit = useCallback(async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setSubmissionError(null);
    try {
      await onSubmit();
    } catch (error) {
      setSubmissionError(
        error instanceof Error ? error.message : "Unable to submit this Writing test.",
      );
      setIsSubmitting(false);
    }
  }, [isSubmitting, onSubmit]);

  useEffect(() => {
    onTickRef.current = onTick;
    onSubmitRef.current = () => {
      void handleSubmit();
    };
  }, [handleSubmit, onTick]);

  const [task1, task2] = writingTasks;

  useEffect(() => {
    if (isSubmitting) return;
    const timer = window.setInterval(() => onTickRef.current(), 1000);
    return () => window.clearInterval(timer);
  }, [isSubmitting]);

  useEffect(() => {
    if (secondsRemaining > 0 || timeoutHandledRef.current) return;
    timeoutHandledRef.current = true;
    onSubmitRef.current();
  }, [secondsRemaining]);

  return (
    <ExamUiBoundary>
      <div className="h-screen bg-white text-gray-900 font-sans flex flex-col overflow-hidden">
        <Header
          testType="writing"
          onExit={onExit}
          writingTaskNumber={currentPart}
          timeLeft={formatTime(secondsRemaining)}
          isTimerWarning={secondsRemaining <= 300}
        />

        <div className="flex-1 mt-[60px] mb-[64px] sm:mb-[72px] flex flex-col min-h-0">
          <div className="bg-white border-b border-gray-200 shrink-0 px-3 sm:px-6 py-2 sm:py-3">
            <div className="max-w-[1400px] mx-auto flex items-center justify-end gap-4">
              {submissionError ? (
                <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">
                  {submissionError}
                </div>
              ) : null}
            </div>
          </div>

          <div className="flex-1 relative min-h-0">
            <div
              className="h-full w-full"
              style={{ display: currentPart === 1 ? "block" : "none" }}
            >
              <WritingPart1
                value={answers[1]}
                onChange={(value) => onAnswerChange(1, value)}
                leadText={task1.lead}
                promptText={task1.prompt}
                isLocked={isSubmitting}
              />
            </div>
            <div
              className="h-full w-full"
              style={{ display: currentPart === 2 ? "block" : "none" }}
            >
              <WritingPart2
                value={answers[2]}
                onChange={(value) => onAnswerChange(2, value)}
                topicText={task2.lead}
                promptText={task2.prompt}
                isLocked={isSubmitting}
              />
            </div>
          </div>
        </div>

        <WritingExamFooter
          currentPart={currentPart}
          answers={answers}
          parts={[1, 2]}
          onPartChange={(part) => {
            if (part === 1 || part === 2) onPartChange(part);
          }}
          onSubmit={() => {
            void handleSubmit();
          }}
          isSubmitting={isSubmitting}
        />
      </div>
    </ExamUiBoundary>
  );
}
