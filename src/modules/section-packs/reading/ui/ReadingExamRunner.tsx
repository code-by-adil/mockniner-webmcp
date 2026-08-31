import { useMemo } from "react";
import { Header } from "@/modules/exam-engine/ui/Header";
import {
  ObjectiveExamFooter,
  buildObjectiveFooterParts,
} from "@/modules/exam-engine/ui/Footer";
import { formatTime } from "@ielts/shared";
import { GlobalMultiStepThinkingLoader } from "@/shared/ui/global/GlobalMultiStepThinkingLoader";
import type { ObjectivePracticeRunnerProps } from "@/modules/section-packs/objective/ObjectivePracticeShell";
import { useObjectiveSectionRuntime } from "@/modules/section-packs/objective/useObjectiveSectionRuntime";
import { ResizableSplitPaneMobileHeaderProvider } from "@/shared/ui/exam/ResizableSplitPane";

type ReadingExamRunnerProps = ObjectivePracticeRunnerProps;

type SubmissionLoaderCopy = {
  badgeLabel: string;
  title: string;
  note: string;
  steps: Array<{
    text: string;
    detail: string;
  }>;
};

function buildSubmissionLoaderCopy(
  isFullExam: boolean | undefined,
): SubmissionLoaderCopy {
  if (isFullExam) {
    return {
      badgeLabel: "Full Exam",
      title: "Checking your reading answers",
      note: "We are scoring your reading section, saving your progress, and getting Writing ready.",
      steps: [
        {
          text: "Checking your answers",
          detail: "Reviewing each response against the reading answer key.",
        },
        {
          text: "Calculating your reading score",
          detail: "Converting your raw score to the IELTS reading band.",
        },
        {
          text: "Saving your progress",
          detail:
            "Recording your result so you can continue the full exam smoothly.",
        },
        {
          text: "Preparing Writing",
          detail: "Getting the next section ready for you.",
        },
      ],
    };
  }

  return {
    badgeLabel: "Scoring Reading",
    title: "Analyzing objective reading performance",
    note: "We are validating answers and finalizing your reading report.",
    steps: [
      {
        text: "Assembling reading responses",
        detail:
          "Collecting answers from every passage into a single grading map.",
      },
      {
        text: "Checking response accuracy",
        detail:
          "Matching each response against the official reading answer key.",
      },
      {
        text: "Calculating IELTS band score",
        detail:
          "Converting the raw objective result into IELTS reading band scale.",
      },
      {
        text: "Finalizing reading report",
        detail:
          "Saving your score and preparing the completed reading summary.",
      },
    ],
  };
}

export function ReadingExamRunner({
  testDefinition,
  onBack,
  topBarContent,
  isFullExam,
  isReviewMode: providedReviewMode = false,
  answers: controlledAnswers,
  currentPart: controlledCurrentPart,
  secondsRemaining: controlledSecondsRemaining,
  onAnswerChange,
  onPartChange,
  onTick,
  onSubmit,
}: ReadingExamRunnerProps) {
  const footerParts = useMemo(
    () => buildObjectiveFooterParts(testDefinition.parts),
    [testDefinition.parts],
  );
  const {
    answers,
    currentPart,
    effectiveSubmissionLocked,
    handleAnswerChange,
    handleExit,
    handleSubmit,
    isSubmitting,
    isReviewMode,
    secondsRemaining,
    setCurrentPart,
    submissionError,
  } = useObjectiveSectionRuntime({
    section: "reading",
    answers: controlledAnswers,
    currentPart: controlledCurrentPart,
    secondsRemaining: controlledSecondsRemaining,
    isReviewMode: providedReviewMode,
    onAnswerChange,
    onPartChange,
    onTick,
    onSubmit,
    onBack,
  });

  const submissionLoaderCopy = useMemo(
    () => buildSubmissionLoaderCopy(isFullExam),
    [isFullExam],
  );
  // Helper to display instructions in the top bar based on the current part definition
  const currentPartDef = testDefinition.parts[currentPart - 1];
  const CurrentPartComponent = currentPartDef?.Component;
  const hasTopStatusContent = Boolean(topBarContent);
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
      {hasTopStatusContent ? (
        <div className="mb-2 flex items-center justify-end">
          <div className="flex items-center gap-2 sm:gap-4 flex-wrap">
            {topBarContent}
          </div>
        </div>
      ) : null}
      {instructionCard}
      {submissionError ? (
        <div className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">
          {submissionError}
        </div>
      ) : null}
      {effectiveSubmissionLocked ? (
        <div className="mt-3 rounded border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700">
          This reading test has already been submitted. You can review answers
          only.
        </div>
      ) : null}
    </div>
  );

  return (
    <div className="h-screen bg-white text-gray-900 font-sans flex flex-col overflow-hidden">
      <GlobalMultiStepThinkingLoader
        visible={isSubmitting}
        badgeLabel={submissionLoaderCopy.badgeLabel}
        title={submissionLoaderCopy.title}
        steps={submissionLoaderCopy.steps}
        note={submissionLoaderCopy.note}
      />
      <Header
        testType="reading"
        onExit={handleExit}
        isReviewMode={isReviewMode}
        timeLeft={formatTime(secondsRemaining)}
        isTimerWarning={secondsRemaining <= 300}
      />

      {/* Main content: top offset for fixed header; footer is a flex sibling (contained). */}
      <div className="flex-1 mt-[60px] flex flex-col min-h-0">
        {/* Top Bar: Navigation & Instructions */}
        <div className="hidden shrink-0 border-b border-gray-200 bg-white px-3 py-2 sm:block sm:px-6 sm:py-4">
          <div className="max-w-[1400px] mx-auto">
            <div className="flex items-center justify-end mb-2 sm:mb-4">
              <div className="flex items-center gap-2 sm:gap-4 flex-wrap">
                {topBarContent}
              </div>
            </div>

            {instructionCard}
            {submissionError ? (
              <div className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">
                {submissionError}
              </div>
            ) : null}
            {effectiveSubmissionLocked ? (
              <div className="mt-3 rounded border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700">
                This reading test has already been submitted. You can review
                answers only.
              </div>
            ) : null}
          </div>
        </div>

        {/* Resizable Content Area - Render the specific part component */}
        <div className="flex-1 relative min-h-0 overscroll-contain">
          {CurrentPartComponent ? (
            <ResizableSplitPaneMobileHeaderProvider header={mobileTopPaneHeader}>
              <CurrentPartComponent
                answers={answers}
                onAnswerChange={handleAnswerChange}
                isReviewMode={isReviewMode}
                answerKey={isReviewMode ? testDefinition.answerKey : undefined}
              />
            </ResizableSplitPaneMobileHeaderProvider>
          ) : (
            <div className="p-8">Content not found for this part.</div>
          )}
        </div>
      </div>

      {isReviewMode || !effectiveSubmissionLocked ? (
        <ObjectiveExamFooter
          currentPart={currentPart}
          answers={answers}
          parts={footerParts}
          onPartChange={setCurrentPart}
          onSubmit={
            isReviewMode
              ? undefined
              : () => {
                  void handleSubmit();
                }
          }
          isSubmitting={isSubmitting}
        />
      ) : null}
    </div>
  );
}
