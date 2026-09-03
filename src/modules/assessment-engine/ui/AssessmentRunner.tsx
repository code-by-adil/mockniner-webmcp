import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactElement,
} from "react";
import { Bookmark, BookmarkCheck } from "lucide-react";
import {
  assessmentPartHasTool,
  findAssessmentItem,
  findAssessmentPart,
  getAssessmentItemLayout,
  getAssessmentPartResources,
  getAssessmentResponseGuidance,
  hasAssessmentResponse,
  type AssessmentPackage,
  type AssessmentResponse,
  type AssessmentSubmission,
} from "@/domain/assessment";
import { isFinalPart, isLastItemInPart, type AssessmentSession } from "@/domain/assessmentSession";
import { ResizableSplitPane } from "@/shared/ui/exam/ResizableSplitPane";
import { AssessmentBoundaryDialog } from "./AssessmentBoundaryDialog";
import { AssessmentContentBlockView } from "./AssessmentContentBlockView";
import { AssessmentInteractionView } from "./AssessmentInteractionView";
import { AssessmentQuestionNavigator } from "./AssessmentQuestionNavigator";
import { AssessmentRunnerFooter } from "./AssessmentRunnerFooter";
import { AssessmentRunnerHeader } from "./AssessmentRunnerHeader";
import { getAssessmentThemeStyle } from "./assessmentTheme";

export function AssessmentRunner({
  assessment,
  session,
  onExit,
  onResponse,
  onToggleMark,
  onToggleElimination,
  onSetTimerHidden,
  onSetItem,
  onTick,
  onAdvanceItem,
  onCompletePart,
  onExpirePart,
  onSubmit,
}: {
  assessment: AssessmentPackage;
  session: AssessmentSession;
  onExit: () => void;
  onResponse: (itemId: string, response: AssessmentResponse) => void;
  onToggleMark: (itemId: string) => void;
  onToggleElimination: (itemId: string, optionId: string) => void;
  onSetTimerHidden: (hidden: boolean) => void;
  onSetItem: (itemId: string) => void;
  onTick: () => void;
  onAdvanceItem: () => void;
  onCompletePart: (partId: string) => void;
  onExpirePart: (partId: string) => void;
  onSubmit: () => Promise<AssessmentSubmission>;
}): ReactElement {
  const part = findAssessmentPart(assessment, session.partId);
  if (!part) throw new Error(`Active assessment part ${session.partId ?? "none"} was not found.`);
  const item = findAssessmentItem(part, session.itemId);
  if (!item) throw new Error(`Active assessment item ${session.itemId ?? "none"} was not found.`);
  const finalItem = isLastItemInPart(assessment, session);
  const finalPart = isFinalPart(assessment, session);
  const itemNumber = part.items.findIndex((candidate) => candidate.id === item.id) + 1;
  const itemLayout = getAssessmentItemLayout(part, item);
  const resources = getAssessmentPartResources(assessment, part);
  const expiredPartRef = useRef<string | null>(null);
  const [navigatorOpen, setNavigatorOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const hasMarking = assessmentPartHasTool(part, "mark_for_review");
  const hasEliminator = assessmentPartHasTool(part, "option_eliminator");
  const hasCalculator = assessmentPartHasTool(part, "calculator");
  const marked = session.workspace.markedItemIds.includes(item.id);
  const eliminated = session.workspace.eliminatedOptionIds[item.id] ?? [];
  const warning = session.secondsRemaining !== null &&
    session.secondsRemaining > 0 &&
    session.secondsRemaining <= 300;
  const style = getAssessmentThemeStyle(assessment.presentation.accent);
  const panelPadding = assessment.presentation.density === "compact" ? "p-4 sm:p-5" : "p-5 sm:p-8";
  const unansweredCount = part.items.filter(
    (candidate) => !hasAssessmentResponse(session.responses[candidate.id]),
  ).length;
  const constrainedResponseCount = part.items.filter((candidate) => {
    const response = session.responses[candidate.id];
    return hasAssessmentResponse(response) &&
      Boolean(getAssessmentResponseGuidance(candidate, response).issue);
  }).length;

  const submitAssessment = useCallback(async (): Promise<boolean> => {
    setSubmitting(true);
    setSubmissionError(null);
    try {
      await onSubmit();
      return true;
    } catch (error) {
      setSubmissionError(error instanceof Error ? error.message : "The attempt could not be saved.");
      return false;
    } finally {
      setSubmitting(false);
    }
  }, [onSubmit, setSubmissionError, setSubmitting]);

  useEffect(() => {
    if (session.secondsRemaining === null || session.secondsRemaining <= 0) return;
    const timer = window.setInterval(onTick, 1_000);
    return () => window.clearInterval(timer);
  }, [onTick, session.secondsRemaining]);

  useEffect(() => {
    if (session.secondsRemaining !== 0 || expiredPartRef.current === part.id) return;
    const expiration = window.setTimeout(() => {
      if (expiredPartRef.current === part.id) return;
      expiredPartRef.current = part.id;
      if (finalPart) void submitAssessment();
      else onExpirePart(part.id);
    });
    return () => window.clearTimeout(expiration);
  }, [finalPart, onExpirePart, part.id, session.secondsRemaining, submitAssessment]);

  const confirmBoundary = async () => {
    if (finalPart && !await submitAssessment()) return;
    if (!finalPart) onCompletePart(part.id);
    setConfirmOpen(false);
  };

  const prompt = (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-start justify-between gap-4 border-b border-neutral-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-neutral-900 font-mono text-xs font-bold text-white">
              {itemNumber}
            </span>
            <span className="text-xs font-bold uppercase tracking-wider text-neutral-500">
              Question {itemNumber} of {part.items.length}
            </span>
          </div>
          {item.domain ? (
            <p className="mt-2 text-xs font-medium text-neutral-500">
              {item.domain}{item.skill ? ` · ${item.skill}` : ""}
            </p>
          ) : null}
        </div>
        {hasMarking ? (
          <button
            type="button"
            onClick={() => onToggleMark(item.id)}
            aria-label={marked ? "Remove mark for review" : "Mark question for review"}
            aria-pressed={marked}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold ${
              marked
                ? "border-amber-300 bg-amber-50 text-amber-900"
                : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50"
            }`}
          >
            {marked
              ? <BookmarkCheck size={14} className="fill-current text-amber-600" />
              : <Bookmark size={14} />}
            <span className="hidden sm:inline">{marked ? "Marked" : "Mark for review"}</span>
          </button>
        ) : null}
      </div>
      <div className="space-y-4">
        {item.prompt.map((block, index) => (
          <AssessmentContentBlockView key={index} block={block} />
        ))}
      </div>
      <AssessmentInteractionView
        item={item}
        response={session.responses[item.id]}
        onChange={(response) => onResponse(item.id, response)}
        eliminatedOptionIds={eliminated}
        onToggleEliminateOption={hasEliminator
          ? (optionId) => onToggleElimination(item.id, optionId)
          : undefined}
      />
    </div>
  );

  const stimulusContent = item.stimulus.length ? (
    <div className="mx-auto max-w-2xl space-y-5 text-neutral-900">
      {item.presentation?.stimulusLabel ? (
        <p className="border-b border-neutral-200 pb-2 text-xs font-bold uppercase tracking-wider text-neutral-500">
          {item.presentation.stimulusLabel}
        </p>
      ) : null}
      {item.stimulus.map((block, index) => (
        <AssessmentContentBlockView key={index} block={block} />
      ))}
    </div>
  ) : null;
  const stimulusPane = stimulusContent ? (
    <div className={`h-full overflow-y-auto bg-white selection:bg-neutral-200 ${panelPadding}`}>
      {stimulusContent}
    </div>
  ) : null;
  const questionPane = (
    <div className={`h-full overflow-y-auto bg-white selection:bg-neutral-200 ${panelPadding}`}>
      {prompt}
    </div>
  );

  return (
    <div
      style={style}
      data-density={assessment.presentation.density}
      className="flex h-screen w-full flex-col overflow-hidden bg-neutral-100 font-sans text-neutral-950"
    >
      <AssessmentRunnerHeader
        assessmentTitle={assessment.title}
        part={part}
        resources={resources}
        secondsRemaining={session.secondsRemaining}
        timerHidden={session.workspace.timerHidden}
        warning={warning}
        calculatorEnabled={hasCalculator}
        onSetTimerHidden={onSetTimerHidden}
        onExit={onExit}
      />

      {submissionError ? (
        <div
          role="alert"
          className="flex shrink-0 items-center justify-between gap-4 border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-900"
        >
          <span>The attempt could not be saved: {submissionError}</span>
          <button
            type="button"
            disabled={submitting}
            onClick={() => void submitAssessment()}
            className="shrink-0 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-bold disabled:opacity-60"
          >
            Retry
          </button>
        </div>
      ) : null}

      <main className="min-h-0 flex-1 overflow-hidden bg-neutral-100">
        {itemLayout === "split" && stimulusPane ? (
          <div className="mx-auto h-full max-w-[1440px] border-x border-neutral-200 bg-white shadow-xs">
            <ResizableSplitPane
              left={stimulusPane}
              right={questionPane}
              initialLeftPercent={50}
              minLeftPercent={30}
              maxLeftPercent={70}
            />
          </div>
        ) : (
          <div className="h-full overflow-y-auto p-4 sm:p-8">
            <div
              className={`mx-auto max-w-3xl space-y-6 rounded-2xl border border-neutral-200 bg-white shadow-sm ${panelPadding}`}
            >
              {stimulusContent ? (
                <div className="border-b border-neutral-200 pb-6">{stimulusContent}</div>
              ) : null}
              {prompt}
            </div>
          </div>
        )}
      </main>

      <AssessmentRunnerFooter
        assessmentLabel={part.groupTitle ?? assessment.metadata.shortLabel ?? assessment.title}
        part={part}
        item={item}
        responses={session.responses}
        markedItemIds={session.workspace.markedItemIds}
        finalPart={finalPart}
        onSetItem={onSetItem}
        onOpenNavigator={() => setNavigatorOpen(true)}
        onAdvance={() => {
          if (finalItem) setConfirmOpen(true);
          else onAdvanceItem();
        }}
      />

      <AssessmentQuestionNavigator
        open={navigatorOpen}
        onOpenChange={setNavigatorOpen}
        part={part}
        currentItemId={item.id}
        responses={session.responses}
        markedItemIds={session.workspace.markedItemIds}
        onSelectItem={onSetItem}
      />
      <AssessmentBoundaryDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        partTitle={part.title}
        finalPart={finalPart}
        unansweredCount={unansweredCount}
        constrainedResponseCount={constrainedResponseCount}
        submitting={submitting}
        onConfirm={confirmBoundary}
      />
    </div>
  );
}
