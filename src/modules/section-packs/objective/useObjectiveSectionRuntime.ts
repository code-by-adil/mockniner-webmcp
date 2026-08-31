import { useCallback, useEffect, useRef, useState } from "react";
import type { AnswerMap } from "@ielts/shared";

type Params = {
  section: "listening" | "reading";
  answers: AnswerMap;
  currentPart: number;
  secondsRemaining: number;
  isReviewMode?: boolean;
  onAnswerChange: (id: number, value: string) => void;
  onPartChange: (part: number) => void;
  onTick: () => void;
  onSubmit?: () => unknown | Promise<unknown>;
  onBack: () => void;
};

export function useObjectiveSectionRuntime(params: Params) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const tickRef = useRef(params.onTick);
  const submitRef = useRef(params.onSubmit);
  const timeoutHandledRef = useRef(false);

  useEffect(() => {
    tickRef.current = params.onTick;
    submitRef.current = params.onSubmit;
  }, [params.onSubmit, params.onTick]);

  useEffect(() => {
    if (isSubmitting || params.isReviewMode) return;
    const timer = window.setInterval(() => tickRef.current(), 1000);
    return () => window.clearInterval(timer);
  }, [isSubmitting, params.isReviewMode]);

  const handleSubmit = useCallback(async () => {
    if (isSubmitting || params.isReviewMode || !submitRef.current) return;
    setIsSubmitting(true);
    setSubmissionError(null);
    try {
      await submitRef.current();
    } catch (error) {
      setSubmissionError(
        error instanceof Error ? error.message : "Unable to submit this section.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [isSubmitting, params.isReviewMode]);

  useEffect(() => {
    if (
      params.isReviewMode ||
      params.secondsRemaining > 0 ||
      timeoutHandledRef.current
    ) return;
    timeoutHandledRef.current = true;
    void handleSubmit();
  }, [handleSubmit, params.isReviewMode, params.secondsRemaining]);

  return {
    answers: params.answers,
    currentPart: params.currentPart,
    effectiveSubmissionLocked: params.isReviewMode ?? false,
    handleAnswerChange: params.onAnswerChange,
    handleExit: async () => params.onBack(),
    handleSubmit,
    isReviewMode: params.isReviewMode ?? false,
    isSubmitting,
    secondsRemaining: params.secondsRemaining,
    setCurrentPart: params.onPartChange,
    submissionError,
  };
}
