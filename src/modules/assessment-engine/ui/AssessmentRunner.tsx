import { useEffect, useRef, type ReactElement } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  BookmarkCheck,
  Check,
  Clock,
  Send,
} from "lucide-react";
import {
  hasAssessmentResponse,
  type AssessmentPackage,
  type AssessmentResponse,
} from "@/domain/assessment";
import {
  isFinalAssessmentItem,
  isFinalAssessmentModule,
  type AssessmentSession,
} from "@/domain/assessmentSession";
import { WorkspaceBrandMark } from "@/shared/ui/global/WorkspaceBrandMark";
import { AssessmentContentBlockView } from "./AssessmentContentBlockView";
import { AssessmentInteractionView } from "./AssessmentInteractionView";

function formatTime(seconds: number | null): string {
  if (seconds === null) return "Untimed";
  const minutes = Math.floor(Math.max(0, seconds) / 60);
  const remainder = Math.max(0, seconds) % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}
export function AssessmentRunner({
  assessment,
  session,
  onExit,
  onResponse,
  onToggleMark,
  onSetItem,
  onTick,
  onAdvance,
  onExpireModule,
  onSubmit,
}: {
  assessment: AssessmentPackage;
  session: AssessmentSession;
  onExit: () => void;
  onResponse: (itemId: string, response: AssessmentResponse) => void;
  onToggleMark: (itemId: string) => void;
  onSetItem: (index: number) => void;
  onTick: () => void;
  onAdvance: () => void;
  onExpireModule: () => void;
  onSubmit: () => Promise<unknown>;
}): ReactElement {
  const section = assessment.sections[session.sectionIndex]!;
  const module = section.modules[session.moduleIndex]!;
  const item = module.items[session.itemIndex]!;
  const finalItem = isFinalAssessmentItem(assessment, session);
  const finalModule = isFinalAssessmentModule(assessment, session);
  const expiredModuleRef = useRef<string | null>(null);

  useEffect(() => {
    if (session.secondsRemaining === null || session.secondsRemaining <= 0) return;
    const timer = window.setInterval(onTick, 1_000);
    return () => window.clearInterval(timer);
  }, [onTick, session.secondsRemaining]);

  useEffect(() => {
    const moduleKey = `${section.id}:${module.id}`;
    if (session.secondsRemaining !== 0 || expiredModuleRef.current === moduleKey) return;
    expiredModuleRef.current = moduleKey;
    if (finalModule) void onSubmit();
    else onExpireModule();
  }, [finalModule, module.id, onExpireModule, onSubmit, section.id, session.secondsRemaining]);

  return (
    <div className="min-h-screen bg-neutral-100 text-neutral-950">
      <header className="sticky top-0 z-30 border-b border-neutral-200 bg-white">
        <div className="mx-auto flex h-16 max-w-[1400px] items-center justify-between px-4 sm:px-8">
          <WorkspaceBrandMark />
          <div className="flex items-center gap-4">
            <div className="hidden text-right sm:block">
              <div className="text-xs font-semibold text-neutral-800">{section.title}</div>
              <div className="text-[11px] text-neutral-500">{module.title}</div>
            </div>
            <div className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 font-mono text-sm font-semibold tabular-nums">
              <Clock size={15} /> {formatTime(session.secondsRemaining)}
            </div>
            <button type="button" onClick={onExit} className="rounded-lg border border-neutral-200 px-3 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50">Exit</button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-[1400px] gap-6 px-4 py-6 lg:grid-cols-[minmax(0,1fr)_280px] lg:px-8">
        <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm sm:p-8">
          <div className="mb-6 flex items-center justify-between border-b border-neutral-100 pb-4">
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-neutral-400">Question {session.itemIndex + 1} of {module.items.length}</div>
              {item.domain ? <div className="mt-1 text-xs text-neutral-500">{item.domain}{item.skill ? ` · ${item.skill}` : ""}</div> : null}
            </div>
            <button
              type="button"
              onClick={() => onToggleMark(item.id)}
              className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 px-3 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
            >
              {session.markedItemIds.includes(item.id) ? <BookmarkCheck size={15} className="text-[var(--exam-accent)]" /> : <Bookmark size={15} />}
              {session.markedItemIds.includes(item.id) ? "Marked" : "Mark for review"}
            </button>
          </div>

          <div className="space-y-5">
            {item.stimulus.map((block, index) => <AssessmentContentBlockView key={`stimulus-${index}`} block={block} />)}
            <div className="space-y-3">{item.prompt.map((block, index) => <AssessmentContentBlockView key={`prompt-${index}`} block={block} />)}</div>
            <div className="pt-2">
              <AssessmentInteractionView item={item} response={session.responses[item.id]} onChange={(response) => onResponse(item.id, response)} />
            </div>
          </div>

          <div className="mt-8 flex items-center justify-between border-t border-neutral-100 pt-5">
            <button
              type="button"
              disabled={session.itemIndex === 0}
              onClick={() => onSetItem(session.itemIndex - 1)}
              className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 px-4 py-2.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-40"
            >
              <ArrowLeft size={16} /> Previous
            </button>
            <button
              type="button"
              onClick={() => finalItem ? void onSubmit() : onAdvance()}
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--exam-accent)] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[var(--exam-accent-hover)]"
            >
              {finalItem ? <><Send size={16} /> Submit assessment</> : <>Next <ArrowRight size={16} /></>}
            </button>
          </div>
        </section>

        <aside className="h-fit rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-bold text-neutral-900">{assessment.title}</h2>
          <p className="mt-1 text-xs leading-5 text-neutral-500">You can revisit questions in the current module. Completed modules are locked.</p>
          <div className="mt-5 grid grid-cols-5 gap-2">
            {module.items.map((candidate, index) => {
              const answered = hasAssessmentResponse(session.responses[candidate.id]);
              const marked = session.markedItemIds.includes(candidate.id);
              return (
                <button
                  key={candidate.id}
                  type="button"
                  onClick={() => onSetItem(index)}
                  aria-label={`Question ${index + 1}${marked ? ", marked" : ""}`}
                  className={`relative flex h-9 items-center justify-center rounded-lg border text-xs font-bold ${index === session.itemIndex ? "border-[var(--exam-accent)] bg-[var(--exam-accent)] text-white" : answered ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-neutral-200 bg-neutral-50 text-neutral-600"}`}
                >
                  {answered && index !== session.itemIndex ? <Check size={13} /> : index + 1}
                  {marked ? <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-amber-400" /> : null}
                </button>
              );
            })}
          </div>
          <div className="mt-5 border-t border-neutral-100 pt-4 text-[11px] leading-5 text-neutral-500">
            Section {session.sectionIndex + 1} of {assessment.sections.length} · Module {session.moduleIndex + 1} of {section.modules.length}
          </div>
        </aside>
      </main>
    </div>
  );
}
