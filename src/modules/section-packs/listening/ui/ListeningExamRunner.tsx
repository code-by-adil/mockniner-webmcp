import React, { useCallback, useMemo, useState } from "react";
import { Header } from "@/modules/exam-engine/ui/Header";
import { ObjectiveExamFooter } from "@/modules/exam-engine/ui/Footer";
import { buildObjectiveFooterParts } from "@/modules/exam-engine/footerParts";
import { formatTime } from "@/domain/exam";
import { ObjectivePartView } from "@/modules/section-packs/objective/ui/ObjectivePartView";
import type { ObjectivePracticeRunnerProps } from "@/modules/section-packs/objective/types/ObjectivePracticeRunnerProps";
import { ListeningAudioBar } from "./ListeningAudioBar";
import type {
  ListeningAudioPersistedState,
  ListeningAudioUiStatus,
} from "./listeningAudioTypes";
import { useTimedSubmission } from "@/modules/exam-engine/useTimedSubmission";
import type { ListeningAudioSession } from "@/application/useListeningAudio";

interface Props extends ObjectivePracticeRunnerProps {
  audioSession: ListeningAudioSession;
  listeningPlayback: ListeningAudioPersistedState;
  onListeningPlaybackChange: (state: ListeningAudioPersistedState) => void;
}

export const ListeningExamRunner: React.FC<Props> = ({
  document,
  onBack,
  isReviewMode: providedReviewMode = false,
  answers,
  currentPart,
  secondsRemaining,
  audioSession,
  listeningPlayback,
  onAnswerChange,
  onPartChange,
  onListeningPlaybackChange,
  onTick,
  onSubmit,
}) => {
  if (document.section !== "listening") {
    throw new Error("ListeningExamRunner requires Listening content.");
  }
  const [audioUiStatus, setAudioUiStatus] = useState<ListeningAudioUiStatus>({
    state: "paused",
    audioPart: null,
    isInSilence: false,
    silenceEndSec: null,
  });
  const [audioPromptsEnabled, setAudioPromptsEnabled] = useState(true);
  const [isAudioMuted, setIsAudioMuted] = useState(false);

  const footerParts = useMemo(
    () => buildObjectiveFooterParts(document),
    [document],
  );
  const [initialAudioState] = useState(listeningPlayback);
  const isReviewMode = providedReviewMode;
  const {
    isSubmitting,
    submissionError,
    submit: handleSubmit,
  } = useTimedSubmission({
    secondsRemaining,
    disabled: isReviewMode,
    onTick,
    onSubmit,
    fallbackError: "Unable to submit this Listening test.",
  });

  const currentPartDef = document.parts[currentPart - 1];

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
      <Header
        testType="listening"
        onExit={onBack}
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
            </div>

            <ListeningAudioBar
              document={document}
              audioSession={audioSession}
              currentPart={currentPart}
              isReviewMode={isReviewMode}
              placement="header-popout"
              audioPromptsEnabled={audioPromptsEnabled}
              hydrateState={initialAudioState}
              onPersistState={handlePersistAudioState}
              onUiStatus={handleAudioUiStatus}
              isMuted={isAudioMuted}
            />

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
            {isReviewMode ? (
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
            {currentPartDef ? (
              <ObjectivePartView
                part={currentPartDef}
                section={document.section}
                answers={answers}
                onAnswerChange={onAnswerChange}
                isReviewMode={isReviewMode}
              />
            ) : (
              <div>Part content not found.</div>
            )}
          </div>
        </div>
      </div>

      <ObjectiveExamFooter
        currentPart={currentPart}
        answers={answers}
        parts={footerParts}
        onPartChange={onPartChange}
        onSubmit={isReviewMode ? undefined : () => void handleSubmit()}
        isSubmitting={isSubmitting}
      />
    </div>
  );
};
