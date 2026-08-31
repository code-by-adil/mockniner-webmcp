import React, { useCallback, useState, useRef, useEffect } from "react";
import { Loader2, Mic, RotateCcw, Square } from "lucide-react";
import type { SpeakingQuestion } from "@ielts/shared";
import type { CompleteSpeakingAttemptInput } from "@/application/attemptWriter";
import { reportWebHandledProductFailure } from "@/shared/observability/report-error";
import {
  useSpeakingRecorder,
  type RecordedSpeakingResponse,
} from "../useSpeakingRecorder";

interface Props {
  contentKey: string;
  onComplete: (input: CompleteSpeakingAttemptInput) => Promise<unknown>;
  setLoading: (l: boolean) => void;
  questions: SpeakingQuestion[];
}

export const StandardSpeakingMode: React.FC<Props> = ({
  contentKey,
  onComplete,
  setLoading,
  questions,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [status, setStatus] = useState<
    "idle" | "recording" | "completed" | "save-failed"
  >("idle");
  const [timeLeft, setTimeLeft] = useState(questions[0]?.timeLimit ?? 0);
  const [recordedResponses, setRecordedResponses] = useState<RecordedSpeakingResponse[]>([]);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const transitionTimeoutRef = useRef<number | null>(null);
  const isStoppingRef = useRef(false);
  const [attemptStartedAt] = useState(() => new Date().toISOString());
  const {
    canvasRef,
    start: startRecorder,
    stop: stopRecorder,
  } = useSpeakingRecorder();

  const questionList = questions;
  const currentQuestion = questionList[currentIndex] ?? questionList[0];
  if (!currentQuestion) {
    throw new Error("Speaking mode requires at least one question.");
  }

  const finishTest = useCallback(async (
    finalRecordings: RecordedSpeakingResponse[],
  ) => {
    setStatus("completed");
    setLoading(true);
    setErrorMessage(null);

    try {
      if (finalRecordings.length !== questionList.length) {
        throw new Error("Every Speaking prompt must have exactly one recording before submission.");
      }

      await onComplete({
        contentKey,
        startedAt: attemptStartedAt,
        recordings: finalRecordings.map((response, sequence) => {
          const question = questionList[sequence];
          if (!question) throw new Error(`Missing Speaking prompt at sequence ${sequence}.`);
          return {
            promptId: question.id,
            partLabel: question.part,
            sequence,
            promptText: question.text,
            timeLimitSeconds: question.timeLimit,
            durationMs: response.durationMs,
            audio: response.audio,
          };
        }),
      });
    } catch (e) {
      reportWebHandledProductFailure(e, {
        runtime: "web",
        surface: "web-exam",
        feature: "speaking-standard",
        section: "speaking",
        phase: "submission",
        handled: true,
      }, {
          code: "SPEAKING_STANDARD_SUBMISSION_FAILED",
      });
      setErrorMessage(
        "Your recordings are still available in this tab, but they could not be saved locally. Try saving again.",
      );
      setStatus("save-failed");
    } finally {
      setLoading(false);
    }
  }, [attemptStartedAt, contentKey, onComplete, questionList, setLoading]);

  const handleRecordingComplete = useCallback((
    response: RecordedSpeakingResponse,
  ) => {
    const nextRecordings = [...recordedResponses, response];
    setRecordedResponses(nextRecordings);

    if (currentIndex >= questionList.length - 1) {
      void finishTest(nextRecordings);
      return;
    }

    const nextIndex = currentIndex + 1;
    setIsTransitioning(true);
    if (transitionTimeoutRef.current) {
      window.clearTimeout(transitionTimeoutRef.current);
    }
    transitionTimeoutRef.current = window.setTimeout(() => {
      setCurrentIndex(nextIndex);
      setTimeLeft(questionList[nextIndex]?.timeLimit ?? 0);
      setStatus("idle");
      setIsTransitioning(false);
      transitionTimeoutRef.current = null;
    }, 200);
  }, [currentIndex, finishTest, questionList, recordedResponses]);

  const startRecording = useCallback(async () => {
    try {
      setErrorMessage(null);
      await startRecorder();
      setStatus("recording");
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "NotAllowedError")) {
        reportWebHandledProductFailure(error, {
          runtime: "web",
          surface: "web-exam",
          feature: "speaking-standard",
          section: "speaking",
          phase: "microphone-setup",
          handled: true,
        }, {
          code: "MICROPHONE_SETUP_FAILED",
        });
      }
      setErrorMessage(
        "Microphone access is required. Allow permission and try again.",
      );
    }
  }, [startRecorder]);

  const stopRecording = useCallback(async () => {
    if (status !== "recording" || isStoppingRef.current) return;
    isStoppingRef.current = true;
    setStatus("completed");
    try {
      const response = await stopRecorder();
      if (!response || response.audio.size === 0) {
        setErrorMessage(
          "No audio was captured. Check your microphone and record this response again.",
        );
        setStatus("idle");
        return;
      }
      handleRecordingComplete(response);
    } finally {
      isStoppingRef.current = false;
    }
  }, [handleRecordingComplete, status, stopRecorder]);

  useEffect(() => {
    if (status !== "recording") return;
    const timer = window.setInterval(() => {
      setTimeLeft((remaining) => Math.max(0, remaining - 1));
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [status]);

  useEffect(() => {
    if (status === "recording" && timeLeft === 0) {
      void stopRecording();
    }
  }, [status, stopRecording, timeLeft]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Space") return;
      event.preventDefault();
      if (status === "idle" && !isTransitioning) {
        void startRecording();
      } else if (status === "recording") {
        void stopRecording();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isTransitioning, startRecording, status, stopRecording]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (transitionTimeoutRef.current) {
        window.clearTimeout(transitionTimeoutRef.current);
        transitionTimeoutRef.current = null;
      }
    };
  }, []);

  const timerProgress =
    status === "recording"
      ? ((currentQuestion.timeLimit - timeLeft) / currentQuestion.timeLimit) * 100
      : 0;

  const timerCircumference = 2 * Math.PI * 54;
  const timerStrokeDashoffset =
    timerCircumference - (timerProgress / 100) * timerCircumference;

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-180px)] max-w-2xl mx-auto px-4 sm:px-6 py-6 select-none">
      {/* Segmented Step Progress */}
      <div className="w-full max-w-md mb-8 sm:mb-12">
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-[11px] font-bold uppercase tracking-widest text-gray-400">
            {currentQuestion.part}
          </span>
          <span className="text-[11px] font-semibold text-gray-400 tabular-nums">
            {currentIndex + 1} / {questionList.length}
          </span>
        </div>
        <div className="flex gap-1.5">
          {questionList.map((q, idx) => (
            <div
              key={q.id}
              className="flex-1 h-1 rounded-full overflow-hidden bg-gray-200/80"
            >
              <div
                className={`h-full rounded-full transition-all duration-500 ease-out ${
                  idx < currentIndex
                    ? "w-full bg-emerald-500"
                    : idx === currentIndex
                      ? status === "recording"
                        ? "bg-[#D40000]"
                        : "w-full bg-gray-900"
                      : "w-0 bg-gray-300"
                }`}
                style={
                  idx === currentIndex && status === "recording"
                    ? { width: `${timerProgress}%` }
                    : undefined
                }
              />
            </div>
          ))}
        </div>
      </div>

      {/* Question Area */}
      <div
        className={`w-full text-center transition-all duration-300 ease-out ${
          isTransitioning
            ? "opacity-0 translate-y-3 scale-[0.98]"
            : "opacity-100 translate-y-0 scale-100"
        }`}
      >
        <h2 className="text-2xl sm:text-4xl font-bold text-gray-900 leading-snug sm:leading-tight tracking-tight mb-2 sm:mb-3 min-h-[72px] sm:min-h-[100px] flex items-center justify-center">
          {currentQuestion.text}
        </h2>
        <p className="text-sm text-gray-400 mb-8 sm:mb-14">
          {status === "idle" && !isTransitioning
            ? "Tap the microphone or press Space to begin"
            : status === "recording"
              ? "Speaking… tap again or press Space when done"
              : status === "save-failed"
                ? "Your recordings are ready. Try saving the attempt again."
              : "\u00A0"}
        </p>
      </div>

      {/* Central Mic / Timer Orb */}
      <div className="relative flex items-center justify-center mb-6 sm:mb-10">
        {/* Outer pulse rings (recording) */}
        {status === "recording" && (
          <>
            <div className="absolute w-40 h-40 sm:w-48 sm:h-48 rounded-full border border-[#D40000]/10 animate-ping" />
            <div
              className="absolute w-36 h-36 sm:w-44 sm:h-44 rounded-full border-2 border-[#D40000]/15 animate-pulse"
              style={{ animationDuration: "1.5s" }}
            />
          </>
        )}

        {/* SVG timer ring */}
        <svg
          width="136"
          height="136"
          className="absolute sm:w-[160px] sm:h-[160px] rotate-[-90deg]"
          viewBox="0 0 136 136"
        >
          <circle
            cx="68"
            cy="68"
            r="54"
            fill="none"
            stroke={status === "recording" ? "#fee2e2" : "#f3f4f6"}
            strokeWidth="3"
          />
          {status === "recording" && (
            <circle
              cx="68"
              cy="68"
              r="54"
              fill="none"
              stroke="#D40000"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={timerCircumference}
              strokeDashoffset={timerStrokeDashoffset}
              className="transition-all duration-1000 ease-linear"
            />
          )}
        </svg>

        {/* Main button */}
        {status === "idle" ? (
          <button
            type="button"
            onClick={startRecording}
            disabled={isTransitioning}
            aria-label="Start recording your answer"
            className="relative z-10 w-28 h-28 sm:w-32 sm:h-32 rounded-full bg-gray-900 hover:bg-gray-800 active:scale-95 transition-all duration-200 flex items-center justify-center shadow-xl hover:shadow-2xl group disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Mic
              size={36}
              className="text-white group-hover:scale-110 transition-transform duration-200"
            />
          </button>
        ) : status === "recording" ? (
          <button
            type="button"
            onClick={stopRecording}
            aria-label="Stop recording and continue"
            className="relative z-10 w-28 h-28 sm:w-32 sm:h-32 rounded-full bg-[#D40000] hover:bg-red-700 active:scale-95 transition-all duration-200 flex flex-col items-center justify-center shadow-xl hover:shadow-2xl group"
          >
            <Square
              size={22}
              className="text-white fill-white mb-1 group-hover:scale-110 transition-transform duration-200"
            />
            <span className="text-white/90 text-xs font-bold tabular-nums">
              {formatTime(timeLeft)}
            </span>
          </button>
        ) : status === "save-failed" ? (
          <button
            type="button"
            onClick={() => void finishTest(recordedResponses)}
            aria-label="Try saving the Speaking attempt again"
            className="relative z-10 w-28 h-28 sm:w-32 sm:h-32 rounded-full bg-gray-900 hover:bg-gray-800 active:scale-95 transition-all duration-200 flex flex-col items-center justify-center shadow-xl hover:shadow-2xl"
          >
            <RotateCcw size={24} className="text-white mb-1" />
            <span className="text-white/90 text-xs font-bold">Retry save</span>
          </button>
        ) : (
          <div className="relative z-10 w-28 h-28 sm:w-32 sm:h-32 rounded-full bg-white border-2 border-gray-100 flex items-center justify-center shadow-lg">
            <Loader2
              size={36}
              className="text-[#D40000] animate-spin"
            />
          </div>
        )}
      </div>

      {/* Visualizer */}
      <div className="w-full max-w-md h-16 sm:h-20 mb-6 sm:mb-8 rounded-2xl overflow-hidden relative">
        {status === "recording" ? (
          <canvas
            ref={canvasRef}
            width="480"
            height="80"
            className="w-full h-full"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center gap-[3px]">
            {Array.from({ length: 32 }).map((_, i) => (
              <div
                key={i}
                className="w-[3px] rounded-full bg-gray-200"
                style={{ height: `${12 + Math.sin(i * 0.5) * 8}px` }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Error */}
      {errorMessage ? (
        <div className="w-full max-w-md mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-700 text-center">
          {errorMessage}
        </div>
      ) : null}

      {/* Saved confirmation */}
      {status === "idle" && currentIndex > 0 && !isTransitioning ? (
        <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200/60 px-3 py-1.5 rounded-full mb-4">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <circle cx="7" cy="7" r="7" fill="#059669" />
            <path d="M4 7l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Response recorded
        </div>
      ) : null}

      {/* Keyboard hint */}
      <div className="flex items-center gap-2 text-xs text-gray-400">
        <kbd className="px-2 py-0.5 bg-gray-100 border border-gray-200 rounded text-[10px] font-bold text-gray-500 leading-relaxed">
          Space
        </kbd>
        <span>
          {status === "recording" ? "stop & next" : "start recording"}
        </span>
      </div>
    </div>
  );
};
