import { useState, type ReactElement } from 'react';
import { ArrowRight, Shapes } from 'lucide-react';
import { getAssessmentDurationSeconds, getAssessmentItemCount, type AssessmentPackage } from '@/domain/assessment';
import { getDraftAssessmentPackageId, type AssessmentSession } from '@/domain/assessmentSession';
import { AssessmentLifecycleDialog, type AssessmentLifecycleAction } from './AssessmentLifecycleDialog';

export type AssessmentLibraryProps = {
  assessments: AssessmentPackage[];
  assessmentSession: AssessmentSession;
  onStartAssessment: (packageId: string) => void;
  onResumeAssessment: () => void;
  onRestartAssessment: () => void;
  onDiscardAssessment: () => void;
  onDeleteAssessment: (packageId: string) => Promise<void>;
};

export function AssessmentLibrary({ assessments, assessmentSession, onStartAssessment, onResumeAssessment,
  onRestartAssessment, onDiscardAssessment, onDeleteAssessment }: AssessmentLibraryProps): ReactElement {
  const [lifecycleAction, setLifecycleAction] = useState<AssessmentLifecycleAction | null>(null);
  const draftPackageId = getDraftAssessmentPackageId(assessmentSession);
  const confirmLifecycleAction = async (action: AssessmentLifecycleAction) => {
    if (action.type === 'restart') onRestartAssessment();
    if (action.type === 'discard') onDiscardAssessment();
    if (action.type === 'delete') await onDeleteAssessment(action.assessment.packageId);
    setLifecycleAction(null);
  };

  return <section aria-labelledby="saved-tests-title" className="space-y-3">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h3 id="saved-tests-title" className="text-sm font-semibold text-neutral-700">Saved tests</h3>
      <p className="text-xs text-neutral-600">Reusable question sets, separate from your results.</p>
    </div>
    {assessments.length ? <div className="divide-y divide-neutral-200/70 rounded-xl border border-neutral-200 bg-white">
      {assessments.map(assessment => {
        const isResumable = draftPackageId === assessment.packageId;
        const anotherAttemptIsActive = draftPackageId !== null && !isResumable;
        const durationSeconds = getAssessmentDurationSeconds(assessment);
        const itemCount = getAssessmentItemCount(assessment);
        return <article key={assessment.packageId} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 p-4 sm:p-5">
          <div className="flex min-w-0 flex-1 basis-72 items-start gap-3">
            <Shapes size={20} className="mt-1 shrink-0 text-neutral-600" aria-hidden="true" />
            <div className="min-w-0 space-y-1.5">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <h4 className="break-words text-base font-semibold text-neutral-950">{assessment.title}</h4>
                <span className="text-xs text-neutral-600">{assessment.source === 'agent' ? 'Agent-created' : 'Ready-made'}</span>
              </div>
              <p className="max-w-3xl break-words text-sm leading-relaxed text-neutral-600">{assessment.description}</p>
              <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-neutral-600">
                <span>{assessment.metadata.shortLabel ?? assessment.metadata.subject ?? 'Practice test'}</span>
                <span>{assessment.parts.length} {assessment.parts.length === 1 ? 'part' : 'parts'}</span>
                <span>{itemCount} {itemCount === 1 ? 'question' : 'questions'}</span>
                <span>{durationSeconds ? `${Math.round(durationSeconds / 60)} mins` : 'Untimed'}</span>
                {isResumable ? <span className="font-medium text-neutral-900">In progress</span> : null}
              </p>
              {anotherAttemptIsActive ? <p className="text-xs text-neutral-600">
                Finish or discard your unfinished assessment to start this one.
              </p> : null}
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-3">
            <button type="button" onClick={isResumable ? onResumeAssessment : () => onStartAssessment(assessment.packageId)}
              disabled={anotherAttemptIsActive} aria-label={`${isResumable ? 'Resume' : 'Start practice:'} ${assessment.title}`}
              title={anotherAttemptIsActive ? 'Finish or discard your unfinished assessment before starting another.' : undefined}
              className="inline-flex min-h-10 items-center justify-center gap-3 rounded-lg border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-800 transition-colors hover:bg-neutral-50 disabled:cursor-not-allowed disabled:text-neutral-500 disabled:hover:bg-white">
              {isResumable ? 'Resume' : 'Start practice'} <ArrowRight size={15} aria-hidden="true" />
            </button>
            {isResumable || assessment.source === 'agent' ? <details className="basis-full text-xs">
              <summary className="w-fit cursor-pointer py-2 font-medium text-neutral-600">Manage test</summary>
              <div className="flex flex-wrap gap-4 pt-1">
                {isResumable ? <>
                  <button type="button" onClick={() => setLifecycleAction({ type: 'restart', assessment })}
                    className="min-h-9 font-medium text-neutral-700 underline underline-offset-4">Restart</button>
                  <button type="button" onClick={() => setLifecycleAction({ type: 'discard', assessment })}
                    className="min-h-9 font-medium text-red-700">Discard attempt</button>
                </> : null}
                {assessment.source === 'agent' ? <button type="button" onClick={() => setLifecycleAction({ type: 'delete', assessment })}
                  className="min-h-9 font-medium text-red-700">Delete assessment</button> : null}
              </div>
            </details> : null}
          </div>
        </article>;
      })}
    </div> : <p className="rounded-xl border border-dashed border-neutral-300 p-4 text-sm text-neutral-600">
      Ask your agent to create a test. It will appear here, ready to start.
    </p>}
    <AssessmentLifecycleDialog key={lifecycleAction ? `${lifecycleAction.type}-${lifecycleAction.assessment.packageId}` : 'closed'}
      action={lifecycleAction} onClose={() => setLifecycleAction(null)} onConfirm={confirmLifecycleAction} />
  </section>;
}
