import React, { useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Clock,
  FileText,
  Headphones,
  CircleHelp,
  Mic,
  PlayCircle,
  RotateCcw,
} from "lucide-react";
import { PracticeHeader } from '@/app/layouts/PracticeHeader';
import { SECTION_META, SECTION_ORDER } from "@/domain/sections";
import {
  getResumableSection,
  findIeltsDraft,
  type IeltsMode,
  type IeltsSession,
} from "@/domain/session";
import type { SectionKey } from "@/domain/types";
import type { ActiveContentDocuments } from "@/domain/contentDocument";
import type { ListeningAudioSession } from "@/application/useListeningAudio";
import { usePracticeHistory } from '@/application/usePracticeHistory';
import type { HistoryKind } from '@/infrastructure/database/historyRepository';
import {
  AssessmentLibrary,
  type AssessmentLibraryProps,
} from "./AssessmentLibrary";
import { RecentAttempts } from "./RecentAttempts";
import { WebMcpHelpDialog } from "./WebMcpHelpDialog";
import { ContinuePractice } from './ContinuePractice';

type Section = SectionKey;
type Mode = IeltsMode;
type HomeProps = {
  assessmentLibrary: AssessmentLibraryProps;
  onStart: (mode: Mode, section: Section) => void;
  onResume: (attemptId?: string) => void;
  session: IeltsSession;
  listeningAudio: ListeningAudioSession;
  onRetryListeningAudio: () => void;
  content: ActiveContentDocuments;
  historyRevision: string;
  onReviewAttempt: (
    attemptId: string,
    kind: HistoryKind,
  ) => Promise<void>;
};

const SECTION_PRESENTATION = {
  listening: {
    summary: "Listen to conversations and lectures, then answer as you go.",
    icon: Headphones,
  },
  reading: {
    summary: "Read academic passages and answer questions alongside the text.",
    icon: BookOpen,
  },
  writing: {
    summary: "Write a report and an essay, then ask your agent for feedback.",
    icon: FileText,
  },
  speaking: {
    summary: "Answer spoken questions and get feedback on your interview transcript.",
    icon: Mic,
  },
} as const;

// The overview estimates total time to the nearest five minutes.
const fullExamMinutes = Math.round(
  SECTION_ORDER.reduce((total, section) => total + SECTION_META[section].durationSeconds, 0) / 300,
) * 5;
const fullExamSequence = SECTION_ORDER.map((section) => {
  const { label, durationSeconds } = SECTION_META[section];
  return `${label} (${durationSeconds / 60}m)`;
}).join(" → ");

export function Home({
  onStart,
  onResume,
  session,
  listeningAudio,
  onRetryListeningAudio,
  content,
  historyRevision,
  onReviewAttempt,
  assessmentLibrary,
}: HomeProps): React.ReactElement {
  const [toolsModalOpen, setToolsModalOpen] = useState(false);
  const history = usePracticeHistory(historyRevision);
  const listeningReady = listeningAudio.readyToPlay;
  const fullDraft = findIeltsDraft(session, 'full', 'listening');
  const resumableFullExamSection = fullDraft ? getResumableSection(fullDraft) : null;

  return (
    <div className="min-h-screen w-full bg-[#fafafa] text-neutral-900 font-sans selection:bg-neutral-200 flex flex-col">
      <PracticeHeader canImport />

      <main className="flex-1 w-full max-w-[1400px] mx-auto px-4 sm:px-8 lg:px-12 py-8 lg:py-10 space-y-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-neutral-950">Your practice</h1>
            <p className="max-w-2xl text-base leading-relaxed text-neutral-600">
              Pick up where you left off, choose a test, or ask your agent for something new.
            </p>
          </div>
          <button type="button" onClick={() => setToolsModalOpen(true)} aria-haspopup="dialog"
            className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3.5 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50">
            <CircleHelp size={16} aria-hidden="true" /> How to use
          </button>
        </div>

        <ContinuePractice session={session} content={content} listeningReady={listeningReady}
          onResume={onResume} assessmentLibrary={assessmentLibrary} />

        <section aria-labelledby="practice-library-title" className="space-y-5">
          <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-neutral-200 pb-3">
            <div>
              <h2 id="practice-library-title" className="text-lg font-semibold tracking-tight">Practice library</h2>
              <p className="mt-1 text-sm text-neutral-600">Ready-made tests and practice created by your agent.</p>
            </div>
            <a href="#practice-history" className="text-sm font-medium text-neutral-700 underline underline-offset-4 hover:text-neutral-950">Practice history</a>
          </div>

          <AssessmentLibrary {...assessmentLibrary} />

          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-neutral-700">IELTS practice</h3>
            <section className="rounded-xl border border-neutral-200/90 bg-white p-6 sm:p-7 shadow-2xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                <div className="space-y-1.5">
                  <div className="inline-flex items-center gap-2">
                    <span className="text-[10px] font-bold tracking-wider uppercase bg-neutral-900 text-white px-2 py-0.5 rounded">
                      IELTS practice
                    </span>
                    <span className="text-xs text-neutral-500 inline-flex items-center gap-1">
                      <Clock size={12} /> ~{Math.floor(fullExamMinutes / 60)} hrs {fullExamMinutes % 60} mins · {SECTION_ORDER.length} sections
                    </span>
                  </div>
                  <h4 className="text-lg sm:text-xl font-bold text-neutral-900">
                    Full IELTS practice test
                  </h4>
                  <p className="text-xs sm:text-sm text-neutral-500 leading-relaxed max-w-2xl">
                    {fullExamSequence}. Complete each section in order.
                  </p>
                </div>

                <div className="shrink-0">
                  <button
                    type="button"
                    onClick={
                      resumableFullExamSection
                        ? () => onResume(fullDraft!.attemptId!)
                        : () => onStart("full", "listening")
                    }
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-lg border border-neutral-300 bg-white hover:bg-neutral-50 text-neutral-900 px-5 py-3 text-sm font-semibold transition-colors disabled:opacity-40 cursor-pointer"
                  >
                    <PlayCircle size={16} />
                    <span>
                      {resumableFullExamSection
                        ? `Resume test (${SECTION_META[resumableFullExamSection].label})`
                        : "Start full test"}
                    </span>
                  </button>
                </div>
              </div>

              {fullDraft && (
                <div className="mt-4 pt-3 border-t border-neutral-100 flex items-center justify-between text-xs text-neutral-500">
                  <span>Your unfinished test is ready to resume.</span>
                  <button
                    type="button"
                    onClick={() => { if (window.confirm('Start this full IELTS test again? Your answers in this test will be cleared. Other section attempts will be kept.')) onStart("full", "listening"); }}
                    className="text-neutral-700 hover:text-neutral-950 inline-flex items-center gap-1 font-medium underline cursor-pointer"
                  >
                    <RotateCcw size={11} /> Start over
                  </button>
                </div>
              )}
            </section>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {SECTION_ORDER.map((sec) => {
                const meta = SECTION_META[sec];
                const presentation = SECTION_PRESENTATION[sec];
                const Icon = presentation.icon;
                const activeDoc = sec === "speaking" ? null : content[sec];
                const isAgent = Boolean(
                  activeDoc &&
                    (activeDoc.source === "agent" ||
                      !activeDoc.contentKey.startsWith("local-")),
                );
                const draft = findIeltsDraft(session, 'section', sec);
                const isResumable = Boolean(draft);

                return (
                  <div
                    key={sec}
                    role="region"
                    aria-label={`${meta.label} practice`}
                    className="flex flex-col justify-between rounded-xl border border-neutral-200/80 bg-white p-5 hover:border-neutral-300 transition-colors shadow-2xs"
                  >
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-neutral-100 text-neutral-700">
                            <Icon size={18} />
                          </div>
                          <div>
                            <h4 className="text-sm font-bold text-neutral-900 leading-none">
                              {meta.label}
                            </h4>
                            <span className="text-xs text-neutral-600">
                              {meta.minimumDurationSeconds ? `${meta.minimumDurationSeconds / 60}–` : ""}{meta.durationSeconds / 60} mins
                            </span>
                          </div>
                        </div>

                        {isAgent && (
                          <span className="text-[10px] font-semibold text-neutral-600 bg-neutral-100 px-1.5 py-0.5 rounded border border-neutral-200">
                            Custom
                          </span>
                        )}
                      </div>

                      {activeDoc ? <p className="break-words text-sm font-semibold leading-5 text-neutral-800">{activeDoc.name}</p> : null}
                      {sec === 'speaking' && draft?.speakingPlan ? <p className="break-words text-sm font-semibold leading-5 text-neutral-800">{draft.speakingPlan.title}</p> : null}

                      <p className="text-sm text-neutral-600 leading-relaxed">
                        {presentation.summary}
                      </p>

                      <div className="text-xs text-neutral-600">
                        {meta.structure}
                      </div>

                      {sec === "listening" && listeningAudio.phase !== "ready" && (
                        <div className="text-[11px] text-neutral-500 pt-1">
                          {listeningAudio.phase === "error" ? (
                            <span role="alert" className="text-red-600 font-medium">
                              {listeningAudio.error || 'Audio preparation failed.'}{" "}
                              <button
                                type="button"
                                onClick={onRetryListeningAudio}
                                className="underline cursor-pointer"
                              >
                                Retry audio
                              </button>
                            </span>
                          ) : listeningAudio.phase === "loading" ? (
                            "Preparing the listening voice…"
                          ) : listeningAudio.phase === "generating" ? (
                            `${listeningReady ? 'Ready to start. Preparing remaining audio' : 'Preparing audio'}. ${listeningAudio.completedChunks}${
                              listeningAudio.totalChunks ? ` of ${listeningAudio.totalChunks}` : ""
                            } audio segments ready.`
                          ) : (
                            "Preparing audio…"
                          )}
                        </div>
                      )}
                    </div>

                    <div className="mt-5 pt-3.5 border-t border-neutral-100">
                      <button
                        type="button"
                        onClick={
                          isResumable ? () => onResume(draft!.attemptId!) : () => onStart("section", sec)
                        }
                        className="w-full min-h-10 flex items-center justify-between rounded-md bg-neutral-50 hover:bg-neutral-100 border border-neutral-200/60 px-3.5 py-2 text-sm font-semibold text-neutral-800 transition-colors disabled:opacity-40 cursor-pointer"
                      >
                        <span>
                          {isResumable ? "Resume" : "Practice"} {meta.label}
                        </span>
                        <ArrowRight size={13} className="text-neutral-400" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <RecentAttempts
          history={history}
          onReview={onReviewAttempt}
        />

        <footer className="pt-5 border-t border-neutral-200/80 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-neutral-600">
          <div>
            Your practice is saved in this browser.
          </div>
          <button
            type="button"
            onClick={() => setToolsModalOpen(true)}
            aria-haspopup="dialog"
            className="inline-flex min-h-10 items-center gap-1.5 text-neutral-700 hover:text-neutral-900 font-medium cursor-pointer"
          >
            <CircleHelp size={15} aria-hidden="true" />
            <span>How to use</span>
          </button>
        </footer>
      </main>

      <WebMcpHelpDialog
        open={toolsModalOpen}
        onClose={() => setToolsModalOpen(false)}
      />
    </div>
  );
}
