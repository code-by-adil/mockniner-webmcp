import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Check, FileCheck, Timer } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { THINKING_LOADER_STEP_DURATION_MS } from "@/shared/ui/exam/thinkingDelay";

const AnimatedProgressRing: React.FC<{ progress: number }> = ({ progress }) => {
  const circumference = 2 * Math.PI * 42;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <div className="relative h-28 w-28">
      <motion.div
        className="absolute inset-0 rounded-full bg-gradient-to-tr from-blue-500/10 to-indigo-500/10"
        animate={{ scale: [1, 1.02, 1] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
      />
      <svg className="h-full w-full -rotate-90" viewBox="0 0 100 100">
        <circle
          cx="50"
          cy="50"
          r="42"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          className="text-slate-100"
        />
        <motion.circle
          cx="50"
          cy="50"
          r="42"
          fill="none"
          stroke="url(#gradient)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={circumference}
          style={{ strokeDashoffset: circumference }}
          initial={false}
          animate={{ strokeDashoffset }}
          transition={{ duration: 0.3, ease: "easeOut" }}
        />
        <defs>
          <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#3b82f6" />
            <stop offset="100%" stopColor="#6366f1" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <motion.span
          className="text-2xl font-bold tracking-tight text-slate-900"
          key={Math.round(progress)}
          initial={{ scale: 1.2, opacity: 0.5 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.2 }}
        >
          {Math.round(progress)}
        </motion.span>
        <span className="text-xs font-medium text-slate-400">%</span>
      </div>
    </div>
  );
};

const StepDot: React.FC<{ isDone: boolean; isActive: boolean }> = ({ isDone, isActive }) => {
  return (
    <div className="relative flex h-4 w-4 items-center justify-center">
      {/* Ripple effect for active */}
      <AnimatePresence>
        {isActive && (
          <>
            <motion.div
              className="absolute inset-0 rounded-full bg-blue-500/20"
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 2.5, opacity: [0.6, 0] }}
              exit={{ scale: 2.5, opacity: 0 }}
              transition={{ duration: 1.2, repeat: Infinity, ease: "easeOut" }}
            />
            <motion.div
              className="absolute inset-0 rounded-full bg-blue-500/10"
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 3, opacity: [0.4, 0] }}
              exit={{ scale: 3, opacity: 0 }}
              transition={{ duration: 1.2, repeat: Infinity, ease: "easeOut", delay: 0.3 }}
            />
          </>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {isDone ? (
          <motion.div
            key="done"
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            exit={{ scale: 0, rotate: 180 }}
            transition={{ type: "spring", stiffness: 400, damping: 20 }}
            className="flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 shadow-sm shadow-blue-500/20"
          >
            <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />
          </motion.div>
        ) : isActive ? (
          <motion.div
            key="active"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 15 }}
            className="relative h-4 w-4"
          >
            <motion.div
              className="absolute inset-0 rounded-full bg-blue-500"
              animate={{ scale: [1, 1.15, 1] }}
              transition={{ duration: 0.8, repeat: Infinity, ease: "easeInOut" }}
            />
            <div className="absolute inset-1 rounded-full bg-white" />
            <motion.div
              className="absolute inset-[5px] rounded-full bg-blue-500"
              animate={{ opacity: [1, 0.5, 1] }}
              transition={{ duration: 0.8, repeat: Infinity, ease: "easeInOut" }}
            />
          </motion.div>
        ) : (
          <motion.div
            key="pending"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            transition={{ duration: 0.3 }}
            className="h-2.5 w-2.5 rounded-full bg-slate-300"
          />
        )}
      </AnimatePresence>
    </div>
  );
};

const StepConnector: React.FC<{ isActive: boolean; progress: number }> = ({
  isActive,
  progress,
}) => {
  const isFilled = progress >= 100;

  return (
    <div className="relative h-10 w-0.5 overflow-hidden bg-slate-200">
      <motion.div
        className="absolute inset-x-0 top-0 bg-gradient-to-b from-blue-500 to-indigo-500"
        initial={{ height: "0%", top: "0%" }}
        animate={{
          height: isActive ? `${progress}%` : isFilled ? "100%" : "0%",
        }}
        transition={{ duration: 0.15, ease: "easeOut" }}
      />
      {/* Glowing tip for active connector */}
      {isActive && progress > 0 && progress < 100 && (
        <motion.div
          className="absolute left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)]"
          style={{ top: `${progress}%` }}
          animate={{ scale: [1, 1.3, 1], opacity: [0.8, 1, 0.8] }}
          transition={{ duration: 0.6, repeat: Infinity }}
        />
      )}
    </div>
  );
};

type MultiStepLoaderStep = { text: string; detail?: string };

type Props = {
  visible: boolean;
  title?: string;
  badgeLabel?: string;
  note?: string;
  steps: MultiStepLoaderStep[];
  stepDurationMs?: number;
};

export const GlobalMultiStepThinkingLoader: React.FC<Props> = ({
  visible,
  title = "Processing your submission",
  badgeLabel = "AI Scoring",
  note,
  steps,
  stepDurationMs = THINKING_LOADER_STEP_DURATION_MS,
}) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [stepProgress, setStepProgress] = useState(0);

  useEffect(() => {
    if (!visible) {
      setActiveIndex(0);
      setCompletedSteps(new Set());
      setStepProgress(0);
      return;
    }

    const progressInterval = window.setInterval(() => {
      setStepProgress((prev) => {
        if (prev >= 100) return 0;
        return prev + 100 / (stepDurationMs / 50);
      });
    }, 50);

    const stepInterval = window.setInterval(() => {
      setActiveIndex((prev) => {
        const next = Math.min(prev + 1, steps.length - 1);
        if (next > prev) {
          setCompletedSteps((current) => new Set([...current, prev]));
          setStepProgress(0);
        }
        return next;
      });
    }, stepDurationMs);

    return () => {
      window.clearInterval(progressInterval);
      window.clearInterval(stepInterval);
    };
  }, [visible, stepDurationMs, steps.length]);

  const progressPercent = useMemo(() => {
    if (steps.length === 0) return 0;
    return Math.min(100, ((activeIndex + stepProgress / 100) / steps.length) * 100);
  }, [activeIndex, stepProgress, steps.length]);

  const remainingSeconds = useMemo(() => {
    if (steps.length === 0) return 0;
    const remainingSteps = Math.max(0, steps.length - 1 - activeIndex);
    return Math.ceil((remainingSteps * stepDurationMs) / 1000);
  }, [activeIndex, stepDurationMs, steps.length]);

  if (!visible) return null;
  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[130]">
      <div className="flex h-full items-center justify-center overflow-hidden bg-slate-900/20 p-4 backdrop-blur-sm">
        <motion.div
          className="relative w-full max-w-md overflow-hidden rounded-3xl bg-white/95 shadow-2xl shadow-slate-900/10 ring-1 ring-slate-200/50 backdrop-blur-xl"
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          {/* Header */}
          <div className="flex flex-col items-center px-8 pt-10 pb-8">
            <AnimatedProgressRing progress={progressPercent} />

            <motion.div
              className="mt-8 text-center"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-100">
                <FileCheck className="h-3.5 w-3.5" />
                <span>{badgeLabel}</span>
              </div>

              <h2 className="mt-4 text-xl font-semibold tracking-tight text-slate-900">
                {title}
              </h2>

              {note && (
                <p className="mt-2 max-w-xs text-sm leading-relaxed text-slate-500">{note}</p>
              )}
            </motion.div>
          </div>

          {/* Steps */}
          <div className="px-10 pb-8">
            <div className="flex flex-col">
              <AnimatePresence mode="popLayout">
                {steps.map((step, index) => {
                  const isDone = completedSteps.has(index);
                  const isActive = index === activeIndex;
                  const isVisible = isDone || isActive || index === activeIndex + 1;

                  if (!isVisible) return null;

                  return (
                    <motion.div
                      key={`${step.text}-${index}`}
                      layout
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                      className="relative flex"
                    >
                      {/* Active step background glow */}
                      {isActive && (
                        <motion.div
                          layoutId="activeGlow"
                          className="pointer-events-none absolute -inset-3 -left-2 rounded-xl bg-blue-500/[0.03]"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.3 }}
                        />
                      )}

                      <div className="flex flex-col items-center">
                        <StepDot isDone={isDone} isActive={isActive} />
                        {index < steps.length - 1 && (
                          <StepConnector
                            isActive={isActive}
                            progress={isActive ? stepProgress : isDone ? 100 : 0}
                          />
                        )}
                      </div>

                      <div className="relative flex-1 pb-10 pl-5">
                        <motion.div
                          layout="position"
                          className={`text-sm transition-colors duration-200 ${
                            isActive
                              ? "font-semibold text-slate-900"
                              : isDone
                                ? "font-medium text-slate-600"
                                : "font-normal text-slate-400"
                          }`}
                        >
                          {step.text}
                        </motion.div>

                        {/* Active step loader bar */}
                        {isActive && (
                          <motion.div
                            initial={{ opacity: 0, width: 0 }}
                            animate={{ opacity: 1, width: "100%" }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.3 }}
                            className="mt-2 h-0.5 w-16 overflow-hidden rounded-full bg-slate-200"
                          >
                            <motion.div
                              className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-500"
                              initial={{ x: "-100%" }}
                              animate={{ x: ["-100%", "100%"] }}
                              transition={{ duration: 1, repeat: Infinity, ease: "easeInOut" }}
                            />
                          </motion.div>
                        )}

                        <AnimatePresence mode="wait">
                          {isActive && step.detail && (
                            <motion.div
                              initial={{ opacity: 0, height: 0, y: -5 }}
                              animate={{ opacity: 1, height: "auto", y: 0 }}
                              exit={{ opacity: 0, height: 0, y: -5 }}
                              transition={{ duration: 0.25, ease: "easeOut" }}
                              className="overflow-hidden"
                            >
                              <motion.p
                                className="mt-2 text-xs leading-relaxed text-slate-500"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: 0.1 }}
                              >
                                {step.detail}
                              </motion.p>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          </div>

          {/* Footer */}
          <motion.div
            className="flex items-center justify-between border-t border-slate-100 bg-slate-50/80 px-8 py-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <Timer className="h-4 w-4 text-slate-400" />
              <span className="font-medium">~{remainingSeconds}s</span>
              <span className="text-slate-400">remaining</span>
            </div>
            <div className="font-mono text-sm font-semibold text-slate-900">
              {Math.round(progressPercent)}%
            </div>
          </motion.div>
        </motion.div>
      </div>
    </div>,
    document.body,
  );
};
