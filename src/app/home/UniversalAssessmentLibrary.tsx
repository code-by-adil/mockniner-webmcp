import type { ReactElement } from "react";
import { ArrowRight, Shapes } from "lucide-react";
import {
  getAssessmentDurationSeconds,
  getAssessmentItemCount,
  type AssessmentHistoryEntry,
  type AssessmentPackage,
} from "@/domain/assessment";
import type { AssessmentSession } from "@/domain/assessmentSession";

export type UniversalAssessmentHomeProps = {
  assessments: AssessmentPackage[];
  assessmentSession: AssessmentSession;
  assessmentHistory: AssessmentHistoryEntry[];
  onStartAssessment: (packageId: string) => void;
  onResumeAssessment: () => void;
  onReviewAssessment: (attemptId: string) => Promise<void>;
};

export function UniversalAssessmentLibrary({
  assessments,
  assessmentSession,
  onStartAssessment,
  onResumeAssessment,
}: Pick<
  UniversalAssessmentHomeProps,
  "assessments" | "assessmentSession" | "onStartAssessment" | "onResumeAssessment"
>): ReactElement {
  return (
    <section className="space-y-4">
      <div className="flex items-end justify-between border-b border-neutral-200/80 pb-2.5">
        <div>
          <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-500">
            Universal Assessments
          </h2>
          <p className="mt-1 text-xs text-neutral-400">
            Trusted interaction components · deterministic scoring · standard rubrics
          </p>
        </div>
        <span className="hidden text-xs text-neutral-400 sm:block">
          Agent-installable JSON packages
        </span>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {assessments.map((assessment) => {
          const isResumable = assessmentSession.packageId === assessment.packageId &&
            !assessmentSession.submission;
          const durationSeconds = getAssessmentDurationSeconds(assessment);
          const itemCount = getAssessmentItemCount(assessment);
          return (
            <article
              key={assessment.packageId}
              className="flex flex-col justify-between rounded-xl border border-neutral-200/80 bg-white p-5 shadow-2xs transition-colors hover:border-neutral-300"
            >
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-neutral-900 text-white">
                    <Shapes size={18} />
                  </div>
                  <div className="flex gap-1.5">
                    <span className="rounded border border-neutral-200 bg-neutral-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-neutral-500">
                      {assessment.metadata.shortLabel ?? assessment.metadata.subject ?? "Assessment"}
                    </span>
                    {assessment.source === "agent" ? (
                      <span className="rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                        Agent installed
                      </span>
                    ) : null}
                  </div>
                </div>
                <h3 className="mt-4 text-base font-bold text-neutral-950">
                  {assessment.title}
                </h3>
                <p className="mt-1.5 min-h-[40px] text-xs leading-5 text-neutral-500">
                  {assessment.description}
                </p>
                <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-medium text-neutral-400">
                  <span>{assessment.parts.length} {assessment.parts.length === 1 ? "part" : "parts"}</span>
                  <span>{itemCount} items</span>
                  <span>
                    {durationSeconds ? `${Math.round(durationSeconds / 60)} mins` : "Untimed"}
                  </span>
                </div>
              </div>
              <div className="mt-5 border-t border-neutral-100 pt-3.5">
                <button
                  type="button"
                  onClick={isResumable
                    ? onResumeAssessment
                    : () => onStartAssessment(assessment.packageId)}
                  className="flex w-full items-center justify-between rounded-md border border-neutral-200/60 bg-neutral-50 px-3.5 py-2 text-xs font-semibold text-neutral-800 transition-colors hover:bg-neutral-100"
                >
                  <span>{isResumable ? "Resume assessment" : "Start assessment"}</span>
                  <ArrowRight size={13} className="text-neutral-400" />
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export function UniversalAssessmentHistoryRows({
  history,
  onReview,
}: {
  history: AssessmentHistoryEntry[];
  onReview: (attemptId: string) => Promise<void>;
}): ReactElement {
  return (
    <>
      {history.slice(0, 3).map((attempt) => (
        <div key={attempt.attemptId} className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <Shapes size={16} className="text-neutral-400" />
            <div>
              <span className="font-semibold text-neutral-800">{attempt.title}</span>
              <span className="ml-2 text-[11px] text-neutral-400">
                {new Date(attempt.submittedAt).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="font-bold text-neutral-900">
              {attempt.rawScore}/{attempt.maximumScore}
              {attempt.awaitingEvaluationCount ? " · Evaluation pending" : ""}
            </span>
            <button
              type="button"
              onClick={() => void onReview(attempt.attemptId)}
              className="rounded border border-neutral-200 px-2.5 py-1 text-[11px] font-medium text-neutral-700 hover:bg-neutral-50"
            >
              Review
            </button>
          </div>
        </div>
      ))}
    </>
  );
}
