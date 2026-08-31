import type { ReactNode } from "react";
import { useCallback, useMemo, useRef, useState } from "react";
import type {
  WritingAnnotation,
  WritingTaskEvaluation,
} from "@/domain/types";
import { ResizableSplitPane } from "@/shared/ui/exam/ResizableSplitPane";
import { ExamBrandMark } from "@/modules/exam-engine/ui/ExamBrandMark";
import {
  ArrowDown,
  ChevronDown,
  ChevronUp,
  LogOut,
  MessageSquareText,
  X,
} from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  handleExamDialogBackdropClick,
  useExamNativeDialog,
} from "@/shared/ui/exam/useExamNativeDialog";
import { supportsNativeDialog } from "@/shared/ui/exam/cssAnchorPositioning";
import {
  EMPTY_WRITING_ANNOTATIONS,
  getWritingIssueTitle,
  resolveAnnotationRanges,
  sanitizeAnnotations,
  type AnnotationIssue,
} from "./writingReviewAnnotations";

interface Props {
  essay: string;
  scoreData: WritingTaskEvaluation;
  evaluationSummary?: string;
  overallBand?: number;
  evaluatedAt?: string;
  onClose: () => void;
  taskOptions?: Array<{
    id: 1 | 2;
    label: string;
  }>;
  activeTaskId?: 1 | 2;
  onTaskChange?: (taskId: 1 | 2) => void;
}


function getTypeClasses(type: WritingAnnotation["type"]) {
  switch (type) {
    case "grammar":
      return {
        dot: "bg-red-500",
        highlight: "decoration-red-400/70 hover:bg-red-50 data-[active=true]:bg-red-100/80",
        card: "border-red-200 bg-red-50/30",
        label: "text-red-700",
      };
    case "vocabulary":
      return {
        dot: "bg-amber-500",
        highlight: "decoration-amber-400/70 hover:bg-amber-50 data-[active=true]:bg-amber-100/80",
        card: "border-amber-200 bg-amber-50/30",
        label: "text-amber-700",
      };
    case "coherence":
      return {
        dot: "bg-blue-500",
        highlight: "decoration-blue-400/70 hover:bg-blue-50 data-[active=true]:bg-blue-100/80",
        card: "border-blue-200 bg-blue-50/30",
        label: "text-blue-700",
      };
    default:
      return {
        dot: "bg-slate-400",
        highlight: "decoration-slate-400/70 hover:bg-slate-50 data-[active=true]:bg-slate-100/80",
        card: "border-slate-200 bg-slate-50/30",
        label: "text-slate-600",
      };
  }
}

export const WritingReviewView: React.FC<Props> = ({
  essay,
  scoreData,
  evaluationSummary,
  overallBand,
  evaluatedAt,
  onClose,
  taskOptions,
  activeTaskId,
  onTaskChange,
}) => {
  const isMobile = useIsMobile();
  const [isDrawerOpen, setIsDrawerOpen] = useState(Boolean(evaluationSummary));
  const useNativeDrawer = supportsNativeDialog();
  const showDrawer = useNativeDrawer || isDrawerOpen;
  const correctionsDialogRef = useExamNativeDialog({
    open: isDrawerOpen && useNativeDrawer,
    onOpenChange: setIsDrawerOpen,
  });
  const [activeAnnotationIndex, setActiveAnnotationIndex] = useState<number | null>(null);
  const [hoveredAnnotationIndex, setHoveredAnnotationIndex] = useState<number | null>(null);
  const annotationRefs = useRef<Record<number, HTMLButtonElement | null>>({});
  const cardRefs = useRef<Record<number, HTMLElement | null>>({});
  const feedbackRef = useRef<HTMLDivElement | null>(null);

  const rawAnnotations = scoreData.annotations ?? EMPTY_WRITING_ANNOTATIONS;
  const { annotations } = useMemo(
    () => sanitizeAnnotations(rawAnnotations),
    [rawAnnotations],
  );

  const { mapped } = useMemo(
    () => resolveAnnotationRanges(essay, annotations),
    [annotations, essay],
  );

  const issues = useMemo<AnnotationIssue[]>(() => {
    const startLookup = new Map<number, number>();
    mapped.forEach((entry) => startLookup.set(entry.annotationIndex, entry.start));

    return annotations
      .map((annotation, annotationIndex) => ({
        annotationIndex,
        annotation,
        start: startLookup.get(annotationIndex) ?? null,
      }))
      .sort((a, b) => {
        if (a.start === null && b.start === null) return a.annotationIndex - b.annotationIndex;
        if (a.start === null) return 1;
        if (b.start === null) return -1;
        return a.start - b.start;
      });
  }, [annotations, mapped]);

  const resolvedActiveAnnotationIndex = issues.some(
    (issue) => issue.annotationIndex === activeAnnotationIndex,
  )
    ? activeAnnotationIndex
    : (issues[0]?.annotationIndex ?? null);

  const activeIssue = useMemo(
    () =>
      issues.find((issue) => issue.annotationIndex === resolvedActiveAnnotationIndex) ??
      null,
    [issues, resolvedActiveAnnotationIndex],
  );

  const focusedAnnotationIndex = hoveredAnnotationIndex ?? activeIssue?.annotationIndex ?? null;
  const activeIssuePosition = activeIssue
    ? issues.findIndex((i) => i.annotationIndex === activeIssue.annotationIndex)
    : -1;

  const focusAnnotation = useCallback((annotationIndex: number) => {
    setActiveAnnotationIndex(annotationIndex);
    setIsDrawerOpen(true);
    annotationRefs.current[annotationIndex]?.scrollIntoView({
      behavior: "smooth",
      block: "center",
      inline: "nearest",
    });
    setTimeout(() => {
      cardRefs.current[annotationIndex]?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 50);
  }, []);

  const jumpIssue = useCallback((direction: "prev" | "next") => {
    if (issues.length <= 1) return;
    const startIndex = activeIssuePosition >= 0 ? activeIssuePosition : 0;
    const offset = direction === "next" ? 1 : -1;
    const nextIndex = (startIndex + offset + issues.length) % issues.length;
    const nextIssue = issues[nextIndex];
    if (!nextIssue) return;
    focusAnnotation(nextIssue.annotationIndex);
  }, [activeIssuePosition, issues, focusAnnotation]);

  const annotatedElements = useMemo(() => {
    if (annotations.length === 0 || mapped.length === 0) {
      return (
        <p className="whitespace-pre-wrap font-serif text-[17px] leading-[1.9] text-gray-900">
          {essay}
        </p>
      );
    }

    const fragments: ReactNode[] = [];
    let cursor = 0;

    mapped.forEach((entry) => {
      if (entry.start > cursor) fragments.push(essay.slice(cursor, entry.start));

      const annotation = annotations[entry.annotationIndex];
      if (!annotation) return;
      const isFocused = focusedAnnotationIndex === entry.annotationIndex;
      const classes = getTypeClasses(annotation.type);

      fragments.push(
        <button
          key={`a-${entry.annotationIndex}-${entry.start}`}
          ref={(node) => {
            annotationRefs.current[entry.annotationIndex] = node;
          }}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            focusAnnotation(entry.annotationIndex);
          }}
          onMouseEnter={() => setHoveredAnnotationIndex(entry.annotationIndex)}
          onMouseLeave={() => setHoveredAnnotationIndex(null)}
          data-active={isFocused}
          className={[
            "relative inline rounded-[3px] px-0.5 text-left align-baseline transition-colors",
            "underline decoration-[2px] underline-offset-[3px] decoration-wavy",
            classes.highlight,
          ].join(" ")}
        >
          {essay.slice(entry.start, entry.end)}
        </button>,
      );

      cursor = entry.end;
    });

    if (cursor < essay.length) fragments.push(essay.slice(cursor));

    return (
      <div className="whitespace-pre-wrap font-serif text-[17px] leading-[1.9] text-gray-900">
        {fragments}
      </div>
    );
  }, [
    annotations,
    essay,
    focusAnnotation,
    focusedAnnotationIndex,
    mapped,
  ]);

  const leftContent = (
    <div className={`bg-white ${isMobile ? 'h-auto relative pb-safe' : 'h-full flex flex-col'}`}>
      <div className="sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-gray-100">
        {taskOptions && taskOptions.length > 1 ? (
          <div className="px-4 sm:px-8 pt-3 sm:pt-4 pb-0">
            <div className="flex gap-1 rounded-xl bg-gray-100/80 p-1 sm:p-1.5">
              {taskOptions.map((task) => {
                const isActive = activeTaskId === task.id;
                return (
                  <button
                    key={task.id}
                    type="button"
                    onClick={() => onTaskChange?.(task.id)}
                    className={[
                      "flex-1 py-1.5 sm:py-2.5 text-xs sm:text-sm rounded-lg transition-all duration-200 select-none relative",
                      "active:scale-[0.98] active:duration-100",
                      isActive
                        ? "bg-white text-[#d40000] font-bold shadow-sm ring-1 ring-black/5"
                        : "text-gray-500 font-medium hover:text-gray-700 hover:bg-white/50 hover:shadow-sm hover:-translate-y-px",
                    ].join(" ")}
                  >
                    {task.label}
                    {isActive && (
                      <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-[#d40000]/80 rounded-full" />
                    )}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center justify-between py-2.5">
              <span className="text-[12px] font-medium text-gray-400">
                {annotations.length} {annotations.length === 1 ? "issue" : "issues"} found
              </span>
              <span className="hidden text-[12px] text-gray-400 sm:block">
                Click underlined text to view suggestions
              </span>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between px-4 sm:px-8 py-3">
            <span className="text-[13px] font-medium text-gray-400">
              {annotations.length} {annotations.length === 1 ? "issue" : "issues"} found
            </span>
            <span className="hidden text-[13px] text-gray-400 sm:block">
              Click underlined text to view suggestions
            </span>
          </div>
        )}
      </div>
      <div className={`px-5 py-6 sm:px-10 sm:py-10 pb-28 ${!isMobile ? "overflow-y-auto flex-1" : ""}`}>
        {annotatedElements}
      </div>
    </div>
  );

  const rightContent = (
    <div className={`flex flex-col bg-gray-50 ${isMobile ? 'h-full' : 'h-full'}`}>
      <div className="shrink-0 border-b border-gray-200 bg-white px-4 py-3 sm:px-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-base font-semibold text-gray-800">Task score</span>
            <span className="px-2 py-0.5 bg-gray-100 rounded text-sm font-bold text-gray-700">
              {scoreData.band.toFixed(1)}
            </span>
          </div>
          <span className="text-xs text-gray-400">{issues.length} corrections</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto w-full pb-safe">
        <div className="space-y-2.5 p-3 sm:p-4 w-full">
          {overallBand !== undefined && evaluationSummary ? (
            <section className="rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">
                    Agent evaluation
                  </p>
                  <p className="mt-2 text-[13px] leading-[1.7] text-gray-700">
                    {evaluationSummary}
                  </p>
                </div>
                <div className="shrink-0 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-center">
                  <span className="block text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                    Overall
                  </span>
                  <span className="text-xl font-extrabold text-emerald-700">
                    {overallBand.toFixed(1)}
                  </span>
                </div>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-2 text-xs">
                {[
                  [activeTaskId === 2 ? "Task response" : "Task achievement", scoreData.taskAchievement],
                  ["Coherence & cohesion", scoreData.coherenceCohesion],
                  ["Lexical resource", scoreData.lexicalResource],
                  ["Grammatical range & accuracy", scoreData.grammaticalRange],
                ].map(([label, value]) => (
                  <div key={String(label)} className="rounded-lg bg-white px-3 py-2">
                    <dt className="text-gray-500">{label}</dt>
                    <dd className="mt-0.5 font-bold text-gray-800">{Number(value).toFixed(1)}</dd>
                  </div>
                ))}
              </dl>
              {evaluatedAt ? (
                <p className="mt-3 text-[10px] text-emerald-800/60">
                  Saved locally {new Date(evaluatedAt).toLocaleString()}
                </p>
              ) : null}
            </section>
          ) : null}
          {issues.length === 0 ? (
            <div className="rounded-xl border border-gray-200 bg-white px-4 py-8 text-center">
              <p className="text-sm text-gray-500">
                No line-level corrections were generated for this response. Read the examiner feedback for overall guidance.
              </p>
            </div>
          ) : (
            issues.map((issue) => {
              const isActive = issue.annotationIndex === resolvedActiveAnnotationIndex;
              const typeClasses = getTypeClasses(issue.annotation.type);
              const title = getWritingIssueTitle(issue.annotation);

              if (!isActive) {
                return (
                  <button
                    key={`c-${issue.annotationIndex}`}
                    ref={(node) => {
                      cardRefs.current[issue.annotationIndex] = node;
                    }}
                    type="button"
                    onClick={() => focusAnnotation(issue.annotationIndex)}
                    onMouseEnter={() => setHoveredAnnotationIndex(issue.annotationIndex)}
                    onMouseLeave={() => setHoveredAnnotationIndex(null)}
                    className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-left transition-all hover:border-gray-300 hover:shadow-sm"
                  >
                    <div className="mb-1 flex items-center gap-2">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${typeClasses.dot}`} />
                      <span className={`text-[11px] font-semibold capitalize ${typeClasses.label}`}>
                        {issue.annotation.type}
                      </span>
                    </div>
                    <p className="line-clamp-1 text-sm text-gray-700">{title}</p>
                  </button>
                );
              }

              return (
                <div
                  key={`c-${issue.annotationIndex}`}
                  ref={(node) => {
                    cardRefs.current[issue.annotationIndex] = node;
                  }}
                  className={`rounded-xl border-2 ${typeClasses.card} px-4 py-4 shadow-sm`}
                >
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${typeClasses.dot}`} />
                      <span className={`text-xs font-semibold capitalize ${typeClasses.label}`}>
                        {issue.annotation.type}
                      </span>
                      {issue.annotation.severity && issue.annotation.severity !== "minor" && (
                        <span className="rounded-full bg-orange-50 px-1.5 py-0.5 text-[10px] font-medium text-orange-600">
                          {issue.annotation.severity}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="mr-1 text-[11px] text-gray-500">
                        {activeIssuePosition + 1}/{issues.length}
                      </span>
                      <button
                        type="button"
                        aria-label="Previous correction"
                        onClick={() => jumpIssue("prev")}
                        disabled={issues.length <= 1}
                        className="rounded-md p-1 text-gray-500 transition hover:bg-black/5 disabled:opacity-30"
                      >
                        <ChevronUp size={14} />
                      </button>
                      <button
                        type="button"
                        aria-label="Next correction"
                        onClick={() => jumpIssue("next")}
                        disabled={issues.length <= 1}
                        className="rounded-md p-1 text-gray-500 transition hover:bg-black/5 disabled:opacity-30"
                      >
                        <ChevronDown size={14} />
                      </button>
                    </div>
                  </div>

                  <div className="mb-1.5 rounded-lg bg-red-50/80 px-3 py-2.5">
                    <p className="text-[15px] leading-relaxed text-red-800/70 line-through decoration-red-300/80 decoration-2">
                      {issue.annotation.originalText}
                    </p>
                  </div>

                  <div className="flex justify-center py-0.5">
                    <ArrowDown size={14} className="text-gray-300" />
                  </div>

                  <div className="mb-4 rounded-lg border border-emerald-200/50 bg-emerald-50/80 px-3 py-2.5">
                    <p className="text-[15px] leading-relaxed font-medium text-emerald-800">
                      {issue.annotation.suggestion}
                    </p>
                  </div>

                  <p className="text-[13px] leading-[1.7] text-gray-700">
                    {issue.annotation.explanation}
                  </p>
                </div>
              );
            })
          )}

          {scoreData.feedback && (
            <div
              ref={feedbackRef}
              className="mt-4 rounded-xl border border-gray-200 bg-white px-4 py-4"
            >
              <div className="mb-2 flex items-center gap-2">
                <MessageSquareText size={14} className="text-gray-400" />
                <span className="text-xs font-semibold text-gray-500">Examiner Feedback</span>
              </div>
              <p className="text-[13px] leading-[1.75] text-gray-700">
                {scoreData.feedback}
              </p>
            </div>
          )}
        </div>

      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-white">
      <div className="z-20 flex h-12 shrink-0 items-center justify-between border-b border-gray-200 bg-white px-3 sm:h-14 sm:px-5">
        <div className="flex min-w-0 items-center gap-2 sm:gap-4">
          <ExamBrandMark />
          <div className="hidden h-5 w-px bg-gray-200 sm:block" />
          <h1 className="hidden truncate text-sm font-semibold text-gray-700 sm:block">Writing Review</h1>
        </div>
        <div className="flex items-center gap-2 mr-6 sm:mr-12">
          {scoreData.feedback && (
            <button
              type="button"
              aria-label="Open agent evaluation and examiner feedback"
              onClick={() => {
                if (isMobile) setIsDrawerOpen(true);
                setTimeout(() => {
                  feedbackRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
                }, isMobile ? 150 : 0);
              }}
              className="flex items-center gap-1 sm:gap-2 text-xs font-bold text-gray-500 hover:text-gray-900 px-2 sm:px-3 py-1 sm:py-1.5 rounded transition-colors border border-gray-200 hover:border-gray-400"
            >
              <MessageSquareText size={14} />
              <span className="hidden sm:inline">Examiner Feedback</span>
            </button>
          )}
          <button
            type="button"
            aria-label="Back to results"
            onClick={onClose}
            className="flex items-center gap-1 sm:gap-2 text-xs font-bold text-gray-500 hover:text-[#D40000] px-2 sm:px-3 py-1 sm:py-1.5 rounded transition-colors border border-gray-200 hover:border-[#D40000]"
          >
            <LogOut size={14} />
            <span className="hidden sm:inline">Back to Results</span>
          </button>
        </div>
      </div>

      <div className="relative min-h-0 flex-1 overflow-y-auto">
        {isMobile ? (
          <>
            <div className="h-full w-full bg-white relative overflow-y-auto">
              {leftContent}
            </div>
            {showDrawer ? (
              useNativeDrawer ? (
                <dialog
                  ref={correctionsDialogRef}
                  className="exam-writing-corrections-dialog exam-native-dialog exam-answer-picker-dialog--sheet flex h-[85vh] w-full flex-col overflow-hidden rounded-t-[10px] border border-gray-200 bg-gray-50 p-0 shadow-2xl"
                  aria-labelledby="writing-review-corrections-title"
                  aria-describedby="writing-review-corrections-description"
                  onClick={handleExamDialogBackdropClick}
                >
                  <div className="flex h-12 shrink-0 items-center justify-between border-b border-gray-200 bg-white px-4">
                    <div>
                      <h2
                        id="writing-review-corrections-title"
                        className="text-sm font-bold text-gray-900"
                      >
                        Writing Review Corrections
                      </h2>
                      <p
                        id="writing-review-corrections-description"
                        className="text-xs font-medium text-gray-500"
                      >
                        Detailed corrections and examiner feedback.
                      </p>
                    </div>
                    <button
                      type="button"
                      aria-label="Close writing review corrections"
                      onClick={() => setIsDrawerOpen(false)}
                      className="rounded px-2 py-1 text-gray-500 hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/30"
                    >
                      <X size={18} aria-hidden="true" />
                    </button>
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto">
                    {rightContent}
                  </div>
                </dialog>
              ) : (
                <div
                  className="fixed inset-0 z-[70] flex items-end bg-black/35 px-3 pb-3"
                  role="presentation"
                  onClick={() => setIsDrawerOpen(false)}
                >
                  <section
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="writing-review-corrections-title"
                    aria-describedby="writing-review-corrections-description"
                    className="flex h-[85vh] w-full flex-col overflow-hidden rounded-t-[10px] border border-gray-200 bg-gray-50 shadow-2xl"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <div className="flex h-12 shrink-0 items-center justify-between border-b border-gray-200 bg-white px-4">
                      <div>
                        <h2
                          id="writing-review-corrections-title"
                          className="text-sm font-bold text-gray-900"
                        >
                          Writing Review Corrections
                        </h2>
                        <p
                          id="writing-review-corrections-description"
                          className="text-xs font-medium text-gray-500"
                        >
                          Detailed corrections and examiner feedback.
                        </p>
                      </div>
                      <button
                        type="button"
                        aria-label="Close writing review corrections"
                        onClick={() => setIsDrawerOpen(false)}
                        className="rounded px-2 py-1 text-gray-500 hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/30"
                      >
                        <X size={18} aria-hidden="true" />
                      </button>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto">
                      {rightContent}
                    </div>
                  </section>
                </div>
              )
            ) : null}
          </>
        ) : (
          <ResizableSplitPane
            left={leftContent}
            right={rightContent}
            initialLeftPercent={60}
            minLeftPercent={40}
            maxLeftPercent={75}
            mobileResizable={false}
          />
        )}
      </div>
    </div>
  );
};
