import React, { useCallback, useMemo, useState } from "react";
import { Header } from "@/modules/exam-engine/ui/Header";
import {
  ObjectiveExamFooter,
  buildObjectiveFooterParts,
} from "@/modules/exam-engine/ui/Footer";
import {
  formatTime,
  type AnswerMap,
} from "@ielts/shared";
import { TestDefinition } from "@ielts/shared";
import {
  ListeningAudioBar,
  type ListeningAudioPersistedState,
  type ListeningAudioUiStatus,
} from "./ListeningAudioBar";
import { GlobalMultiStepThinkingLoader } from "@/shared/ui/global/GlobalMultiStepThinkingLoader";
import { useObjectiveSectionRuntime } from "@/modules/section-packs/objective/useObjectiveSectionRuntime";

interface Props {
  testDefinition: TestDefinition;
  contentKey?: string | undefined;
  onBack: () => void;
  topBarContent?: React.ReactNode | undefined;
  isFullExam?: boolean | undefined;
  isReviewMode?: boolean | undefined;
  answers: AnswerMap;
  currentPart: number;
  secondsRemaining: number;
  listeningPlayback: ListeningAudioPersistedState;
  onAnswerChange: (id: number, value: string) => void;
  onPartChange: (part: number) => void;
  onListeningPlaybackChange: (state: ListeningAudioPersistedState) => void;
  onTick: () => void;
  onSubmit?: (() => unknown | Promise<unknown>) | undefined;
}

export const ListeningExamRunner: React.FC<Props> = ({
  testDefinition,
  contentKey,
  onBack,
  topBarContent,
  isFullExam,
  isReviewMode: providedReviewMode = false,
  answers: controlledAnswers,
  currentPart: controlledCurrentPart,
  secondsRemaining: controlledSecondsRemaining,
  listeningPlayback,
  onAnswerChange,
  onPartChange,
  onListeningPlaybackChange,
  onTick,
  onSubmit,
}) => {
  const [audioUiStatus, setAudioUiStatus] = useState<ListeningAudioUiStatus>({
    state: "paused",
    audioPart: null,
    isInSilence: false,
    silenceEndSec: null,
    currentTimeSec: 0,
  });
  const [audioPromptsEnabled, setAudioPromptsEnabled] = useState(true);
  const [isAudioMuted, setIsAudioMuted] = useState(false);

  const footerParts = useMemo(
    () => buildObjectiveFooterParts(testDefinition.parts),
    [testDefinition.parts],
  );
  const [initialAudioState] = useState(listeningPlayback);
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
    section: "listening",
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

  const submissionLoaderCopy = useMemo(() => {
    if (isFullExam) {
      return {
        badgeLabel: "Full Exam",
        title: "Checking your listening answers",
        note: "We are scoring your listening section, saving your progress, and getting Reading ready.",
        steps: [
          {
            text: "Checking your answers",
            detail: "Reviewing each response against the listening answer key.",
          },
          {
            text: "Calculating your listening score",
            detail: "Converting your raw score to the IELTS listening band.",
          },
          {
            text: "Saving your progress",
            detail:
              "Recording your result so you can continue the full exam smoothly.",
          },
          {
            text: "Preparing Reading",
            detail: "Getting the next section ready for you.",
          },
        ],
      };
    }

    return {
      badgeLabel: "Scoring Listening",
      title: "Analyzing objective listening performance",
      note: "We are validating answers and finalizing your listening report.",
      steps: [
        {
          text: "Compiling your answer sheet",
          detail:
            "Aligning all responses by question number and completion status.",
        },
        {
          text: "Validating answer accuracy",
          detail:
            "Checking each entry against the official listening answer key.",
        },
        {
          text: "Applying IELTS conversion",
          detail:
            "Transforming your raw score into the IELTS listening band scale.",
        },
        {
          text: "Publishing listening report",
          detail:
            "Saving your result and preparing the finalized listening summary.",
        },
      ],
    };
  }, [isFullExam]);

  const currentPartDef = testDefinition.parts[currentPart - 1];
  const CurrentPartComponent = currentPartDef?.Component;

  const handlePersistAudioState = useCallback(
    (next: ListeningAudioPersistedState): void => {
      onListeningPlaybackChange(next);
    },
    [onListeningPlaybackChange],
  );

  const handleAudioUiStatus = useCallback(
    (status: ListeningAudioUiStatus): void => {
      setAudioUiStatus((prev) => {
        if (
          prev.state === status.state &&
          prev.audioPart === status.audioPart &&
          prev.isInSilence === status.isInSilence &&
          prev.silenceEndSec === status.silenceEndSec
        ) {
          return prev;
        }
        return status;
      });
    },
    [],
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
        testType="listening"
        onExit={handleExit}
        isReviewMode={isReviewMode}
        timeLeft={formatTime(secondsRemaining)}
        isTimerWarning={secondsRemaining <= 300}
        listeningAudioStatus={audioUiStatus.state}
        listeningAudioPart={audioUiStatus.audioPart}
        audioPromptsEnabled={audioPromptsEnabled}
        onAudioPromptsEnabledChange={setAudioPromptsEnabled}
        isAudioMuted={isAudioMuted}
        onToggleAudioMute={() => setIsAudioMuted((muted) => !muted)}
      />

      {/* Main content: top offset for fixed header; footer is a flex sibling (contained). */}
      <div className="flex-1 mt-[60px] flex flex-col min-h-0">
        {/* Top Bar: Navigation & Instructions */}
        <div className="bg-white border-b border-gray-200 shrink-0 px-3 sm:px-6 py-2 sm:py-4">
          <div className="max-w-[1400px] mx-auto">
            <div className="flex items-center justify-end mb-2 sm:mb-4">
              <div className="flex items-center gap-2 sm:gap-4 flex-wrap">
                {topBarContent}
              </div>
            </div>

            {testDefinition.listeningAudio?.key && (
              <ListeningAudioBar
                contentKey={contentKey ?? testDefinition.listeningAudio.key}
                currentPart={currentPart}
                isReviewMode={isReviewMode}
                placement="header-popout"
                audioPromptsEnabled={audioPromptsEnabled}
                hydrateState={initialAudioState}
                onPersistState={handlePersistAudioState}
                onUiStatus={handleAudioUiStatus}
                isMuted={isAudioMuted}
              />
            )}

            <div className="bg-[#f0f0f0] border border-gray-200 p-3 sm:p-4 rounded-sm mt-2 sm:mt-3">
              <h2 className="font-bold text-xs sm:text-sm text-gray-800 mb-1">
                {currentPartDef?.label || `Part ${currentPart}`}
              </h2>
              <p className="text-xs sm:text-sm text-gray-700">
                {currentPartDef?.instructionText}
              </p>
            </div>
            {submissionError ? (
              <div className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">
                {submissionError}
              </div>
            ) : null}
            {effectiveSubmissionLocked ? (
              <div className="mt-3 rounded border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700">
                This listening test has already been submitted. You can review
                answers only.
              </div>
            ) : null}
          </div>
        </div>

        {/* Scrollable Content Area */}
        <div
          data-exam-scroll-container
          className="flex-1 overflow-y-auto overflow-x-auto overscroll-contain"
        >
          <div className="max-w-[1400px] mx-auto p-3 sm:p-6">
            {CurrentPartComponent ? (
              <CurrentPartComponent
                answers={answers}
                onAnswerChange={handleAnswerChange}
                isReviewMode={isReviewMode}
                answerKey={isReviewMode ? testDefinition.answerKey : undefined}
              />
            ) : (
              <div>Part content not found.</div>
            )}
          </div>
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
};
