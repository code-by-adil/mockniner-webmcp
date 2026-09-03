import { useCallback, useEffect, useRef, useState } from "react";

type TimedSubmissionOptions = {
  secondsRemaining: number;
  disabled?: boolean;
  timerPaused?: boolean;
  onTick: () => void;
  onSubmit?: () => unknown | Promise<unknown>;
  fallbackError: string;
};

export function useTimedSubmission({
  secondsRemaining,
  disabled = false,
  timerPaused = false,
  onTick,
  onSubmit,
  fallbackError,
}: TimedSubmissionOptions) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const tickRef = useRef(onTick);
  const submitRef = useRef(onSubmit);
  const timeoutHandledRef = useRef(false);

  useEffect(() => {
    tickRef.current = onTick;
    submitRef.current = onSubmit;
  }, [onSubmit, onTick]);

  useEffect(() => {
    if (disabled || timerPaused || isSubmitting) return;
    const timer = window.setInterval(() => tickRef.current(), 1_000);
    return () => window.clearInterval(timer);
  }, [disabled, timerPaused, isSubmitting]);

  const submit = useCallback(async () => {
    if (disabled || isSubmitting || !submitRef.current) return;
    setIsSubmitting(true);
    setSubmissionError(null);
    try {
      await submitRef.current();
    } catch (error) {
      setSubmissionError(error instanceof Error ? error.message : fallbackError);
      setIsSubmitting(false);
    }
  }, [disabled, fallbackError, isSubmitting]);

  useEffect(() => {
    if (disabled || timerPaused || secondsRemaining > 0 || timeoutHandledRef.current) return;
    timeoutHandledRef.current = true;
    void submit();
  }, [disabled, timerPaused, secondsRemaining, submit]);

  return { isSubmitting, submissionError, submit };
}
