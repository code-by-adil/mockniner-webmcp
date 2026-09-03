import { useMemo } from "react";
import { Header } from "@/modules/exam-engine/ui/Header";
import { ObjectiveExamFooter } from "@/modules/exam-engine/ui/ObjectiveExamFooter";
import { buildObjectiveFooterParts } from "@/modules/exam-engine/footerParts";
import { formatTime } from "@/shared/time";
import type { ObjectivePracticeRunnerProps } from "@/modules/ielts/objective/types/ObjectivePracticeRunnerProps";
import { useTimedSubmission } from "@/modules/exam-engine/useTimedSubmission";
import { ResizableSplitPaneMobileHeaderProvider } from "@/shared/ui/exam/ResizableSplitPane";
import { ObjectivePartView } from "@/modules/ielts/objective/ui/ObjectivePartView";

type ReadingExamRunnerProps = Omit<ObjectivePracticeRunnerProps, 'isReviewMode'>;

export function ReadingExamRunner({
  document,
  onBack,
  answers,
  currentPart,
  secondsRemaining,
  onAnswerChange,
  onPartChange,
  onTick,
  onSubmit,
}: ReadingExamRunnerProps) {
  const footerParts = useMemo(
    () => buildObjectiveFooterParts(document),
    [document],
  );
  const {
    isSubmitting,
    submissionError,
    submit: handleSubmit,
  } = useTimedSubmission({
    secondsRemaining,
    onTick,
    onSubmit,
    fallbackError: "Unable to submit this Reading test.",
  });

  // Helper to display instructions in the top bar based on the current part definition
  const currentPartDef = document.parts[currentPart - 1];
  const instructionCard = (
    <div className="bg-[#f0f0f0] border border-gray-200 p-3 sm:p-4 rounded-sm">
      <h2 className="font-bold text-xs sm:text-sm text-gray-800 mb-1">
        {currentPartDef?.label || `Part ${currentPart}`}
      </h2>
      <p className="text-xs sm:text-sm text-gray-700">
        {currentPartDef?.instructionText}
      </p>
    </div>
  );
  const mobileTopPaneHeader = (
    <div className="border-b border-gray-200 bg-white px-3 py-2">
      {instructionCard}
      {submissionError ? (
        <div className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">
          {submissionError}
        </div>
      ) : null}
    </div>
  );

  return (
    <div className="h-screen bg-white text-gray-900 font-sans flex flex-col overflow-hidden">
      <Header
        testType="reading"
        onExit={onBack}
        timeLeft={formatTime(secondsRemaining)}
        isTimerWarning={secondsRemaining <= 300}
      />

      {/* Main content: top offset for fixed header; footer is a flex sibling (contained). */}
      <div className="flex-1 mt-[60px] flex flex-col min-h-0">
        {/* Top Bar: Navigation & Instructions */}
        <div className="hidden shrink-0 border-b border-gray-200 bg-white px-3 py-2 sm:block sm:px-6 sm:py-4">
          <div className="max-w-[1400px] mx-auto">
            {instructionCard}
            {submissionError ? (
              <div className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">
                {submissionError}
              </div>
            ) : null}
          </div>
        </div>

        {/* Resizable Content Area - Render the specific part component */}
        <div className="flex-1 relative min-h-0 overscroll-contain">
          {currentPartDef ? (
            <ResizableSplitPaneMobileHeaderProvider header={mobileTopPaneHeader}>
              <ObjectivePartView
                part={currentPartDef}
                section={document.section}
                answers={answers}
                onAnswerChange={onAnswerChange}
                isReviewMode={false}
              />
            </ResizableSplitPaneMobileHeaderProvider>
          ) : (
            <div className="p-8">Content not found for this part.</div>
          )}
        </div>
      </div>

      <ObjectiveExamFooter
        currentPart={currentPart}
        answers={answers}
        parts={footerParts}
        onPartChange={onPartChange}
        onSubmit={() => void handleSubmit()}
        isSubmitting={isSubmitting}
      />
    </div>
  );
}
