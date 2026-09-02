import type { ComponentProps, ReactElement } from "react";
import type { LearningSummary } from "@/domain/learningSummary";
import { AssessmentHistory, type AssessmentLibraryProps } from "./AssessmentLibrary";
import { NativeAttemptHistoryRows } from "./NativeAttemptHistoryRows";

type Props = Pick<AssessmentLibraryProps, "assessmentHistory" | "onReviewAssessment"> & {
  learningSummary: LearningSummary | null;
  onReviewAttempt: ComponentProps<typeof NativeAttemptHistoryRows>["onReview"];
};

export function RecentAttempts({
  assessmentHistory,
  onReviewAssessment,
  learningSummary,
  onReviewAttempt,
}: Props): ReactElement | null {
  const hasAttempts = (learningSummary?.totalAttempts ?? 0) > 0 || assessmentHistory.length > 0;
  if (!hasAttempts) return null;

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between border-b border-neutral-200/80 pb-2.5">
        <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-500">
          Recent Attempts
        </h2>
        <span className="text-xs text-neutral-400">
          {(learningSummary?.totalAttempts ?? 0) + assessmentHistory.length} universal and IELTS attempts saved locally
        </span>
      </div>

      <div className="divide-y divide-neutral-100 rounded-xl border border-neutral-200 bg-white text-xs shadow-2xs">
        <AssessmentHistory
          history={assessmentHistory}
          onReview={onReviewAssessment}
        />

        {learningSummary ? (
          <NativeAttemptHistoryRows
            summary={learningSummary}
            onReview={onReviewAttempt}
          />
        ) : null}
      </div>
    </section>
  );
}
