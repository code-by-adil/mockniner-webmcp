import { useState } from 'react';
import { DeletePracticeDialog, type DeletePracticeAction } from './DeletePracticeDialog';
import { Trash2, ArrowRight, BookOpen, FileText, Headphones, Mic, Shapes } from 'lucide-react';
import type { ActiveContentDocuments, PracticeContentDocument } from '@/domain/contentDocument';
import { getIeltsDrafts, getResumableSection, type IeltsSession } from '@/domain/session';
import { getDraftAssessmentPackageId } from '@/domain/assessmentSession';
import { SECTION_META, SECTION_ORDER } from '@/domain/sections';
import { hasAssessmentResponse } from '@/domain/assessmentScoring';
import type { AssessmentLibraryProps } from './AssessmentLibrary';

type Props = {
  session: IeltsSession;
  documents?: PracticeContentDocument[];
  onDeleteDraft?: (attemptId: string) => void | Promise<void>;
  content: ActiveContentDocuments;
  listeningReady: boolean;
  onResume: (attemptId: string) => void;
  assessmentLibrary: AssessmentLibraryProps;
};

type ContinuingPractice = {
  attemptId: string;
  kind: keyof typeof icons;
  title: string;
  progress: string;
  startedAt?: string;
  audioPreparing?: boolean;
  resume: () => void;
  remove?: () => void | Promise<void>;
};

const icons = { listening: Headphones, reading: BookOpen, writing: FileText, speaking: Mic, assessment: Shapes };

export function ContinuePractice({ session, content, documents = Object.values(content), onDeleteDraft, listeningReady, onResume, assessmentLibrary }: Props) {
  const [deleting, setDeleting] = useState<DeletePracticeAction | null>(null);
  const practices: ContinuingPractice[] = getIeltsDrafts(session).map(draft => {
    const section = getResumableSection(draft)!;
    const document = section === 'speaking' ? null : documents.find(item => item.contentKey === draft.contentKeys?.[section]) ?? content[section];
    const contentKey = section === 'speaking' ? null : draft.contentKeys?.[section];
    // A parked draft may pin a different set from the library's active content.
    const matchingDocument = document && (!contentKey || contentKey === document.contentKey) ? document : null;
    const title = draft.mode === 'full' ? 'Full IELTS practice test'
      : section === 'speaking' ? draft.speakingPlan?.title ?? 'IELTS Speaking practice'
      : matchingDocument?.name ?? `IELTS ${SECTION_META[section].label} practice`;
    const progress = draft.mode === 'full'
      ? `${SECTION_META[section].label} · ${draft.completedSections.length} of ${SECTION_ORDER.length} sections completed`
      : section === 'speaking' ? 'Speaking interview · In progress'
      : `${SECTION_META[section].label} · ${section === 'writing' ? 'Task' : section === 'reading' ? 'Passage' : 'Part'} ${draft.partBySection[section]}`;
    return { attemptId: draft.attemptId!, kind: section, title, progress,
      startedAt: draft.startedAt, audioPreparing: section === 'listening' && (!contentKey || contentKey === content.listening.contentKey) && !listeningReady,
      remove: onDeleteDraft ? () => onDeleteDraft(draft.attemptId!) : undefined,
      resume: () => onResume(draft.attemptId!) };
  });

  const assessment = assessmentLibrary.assessmentSession;
  const packageId = getDraftAssessmentPackageId(assessment);
  if (packageId) {
    const definition = assessment.packageSnapshot ?? assessmentLibrary.assessments.find(item => item.packageId === packageId);
    const partIndex = definition?.parts.findIndex(part => part.id === assessment.partId) ?? -1;
    const items = definition?.parts.flatMap(part => part.items) ?? [];
    const answered = items.filter(item => hasAssessmentResponse(assessment.responses[item.id])).length;
    practices.push({ attemptId: assessment.attemptId!, kind: 'assessment',
      title: definition?.title ?? 'Saved assessment',
      progress: definition && partIndex >= 0
        ? `Part ${partIndex + 1} of ${definition.parts.length} · ${answered} of ${items.length} ${items.length === 1 ? 'question' : 'questions'} answered`
        : 'In progress',
      startedAt: assessment.startedAt,
      resume: assessmentLibrary.onResumeAssessment,
      remove: assessmentLibrary.onDiscardAssessment,
    });
  }

  // Start dates are durable; the sessions do not track reliable last-edit times.
  practices.sort((a, b) => (Date.parse(b.startedAt ?? '') || 0) - (Date.parse(a.startedAt ?? '') || 0));
  if (!practices.length) return null;

  return <section aria-labelledby="continue-practice-title" className="space-y-3">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h2 id="continue-practice-title" className="text-lg font-semibold tracking-tight">Continue practice</h2>
      <span className="text-xs text-neutral-600">Your unfinished attempts</span>
    </div>
    <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white divide-y divide-neutral-200/70">
      {practices.map((practice, index) => {
        const Icon = icons[practice.kind];
        return <article key={practice.attemptId} data-resume-attempt-id={practice.attemptId}
          className={`flex flex-wrap items-center justify-between gap-4 p-4 sm:px-5 ${index === 0 ? 'border-l-2 border-l-[var(--exam-accent)]' : ''}`}>
          <div className="flex min-w-0 flex-1 basis-64 items-start gap-3">
            <Icon size={19} className="mt-1 shrink-0 text-neutral-600" aria-hidden="true" />
            <div className="min-w-0 space-y-1">
              <h3 className="break-words text-sm font-semibold text-neutral-950">{practice.title}</h3>
              <p className="text-sm text-neutral-600">{practice.progress}</p>
              {practice.startedAt ? <p className="text-xs text-neutral-500">Started <time dateTime={practice.startedAt}>
                {new Date(practice.startedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
              </time></p> : null}
              {practice.audioPreparing ? <p className="text-xs text-neutral-600">Resume to see audio preparation. Your timer pauses while audio is unavailable.</p> : null}
            </div>
          </div>
          <div className="flex items-center gap-2">
          <button type="button" onClick={practice.resume} aria-label={`Resume ${practice.title}`}
            className={`inline-flex min-h-10 items-center justify-center gap-3 rounded-lg px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${index === 0
              ? 'bg-[var(--exam-accent)] text-white hover:bg-[var(--exam-accent-hover)]'
              : 'border border-neutral-200 text-neutral-800 hover:bg-neutral-50'}`}>
            Resume <ArrowRight size={15} aria-hidden="true" />
          </button>
          {practice.remove && <button type="button" aria-label={`Delete unfinished test ${practice.title}`} onClick={() => setDeleting({ title: practice.title, description: 'This unfinished attempt and its answers will be deleted. The saved test and submitted results remain available.', remove: practice.remove! })} className="min-h-10 rounded-lg p-2 text-neutral-500 hover:bg-red-50 hover:text-red-700"><Trash2 size={17} aria-hidden="true" /></button>}
          </div>
        </article>;
      })}
    </div>
    {deleting && <DeletePracticeDialog action={deleting} onClose={() => setDeleting(null)} />}
  </section>;
}
