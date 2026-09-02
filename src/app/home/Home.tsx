import React, { useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Clock,
  FileText,
  Headphones,
  Mic,
  PlayCircle,
  RotateCcw,
} from "lucide-react";
import { AssessmentLabBrand } from "@/shared/ui/global/AssessmentLabBrand";
import { SECTION_META, SECTION_ORDER } from "@/domain/sections";
import {
  getResumableSection,
  type IeltsMode,
  type IeltsSession,
} from "@/domain/session";
import type { SectionKey } from "@/domain/types";
import type { ActiveContentDocuments } from "@/domain/contentDocument";
import type { ListeningAudioSession } from "@/application/useListeningAudio";
import type { LearningSummary } from "@/domain/learningSummary";
import {
  AssessmentLibrary,
  type AssessmentLibraryProps,
} from "./AssessmentLibrary";
import { RecentAttempts } from "./RecentAttempts";
import { WebMcpHelpDialog } from "./WebMcpHelpDialog";

type Section = SectionKey;
type Mode = IeltsMode;
type HomeProps = {
  assessmentLibrary: AssessmentLibraryProps;
  onStart: (mode: Mode, section: Section) => void;
  onResume: () => void;
  session: IeltsSession;
  listeningAudio: ListeningAudioSession;
  onRetryListeningAudio: () => void;
  content: ActiveContentDocuments;
  learningSummary: LearningSummary | null;
  onReviewAttempt: (
    attemptId: string,
    section: "listening" | "reading" | "writing" | "speaking",
  ) => Promise<void>;
};

const SECTION_PRESENTATION = {
  listening: {
    summary: "Recorded conversations and lectures with timed question pacing.",
    icon: Headphones,
  },
  reading: {
    summary: "Academic passages with split-pane text and interactive questions.",
    icon: BookOpen,
  },
  writing: {
    summary: "Report and essay responses stored locally for agent evaluation.",
    icon: FileText,
  },
  speaking: {
    summary: "Voice prompts and audio recording with transcript scoring.",
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
  learningSummary,
  onReviewAttempt,
  assessmentLibrary,
}: HomeProps): React.ReactElement {
  const [toolsModalOpen, setToolsModalOpen] = useState(false);
  const listeningReady = listeningAudio.readyToPlay;
  const resumableSection = getResumableSection(session);
  const resumableFullExamSection =
    session.mode === "full" ? resumableSection : null;
  const resumablePracticeSection =
    session.mode === "section" ? resumableSection : null;
  const fullExamEntrySection = resumableFullExamSection ?? "listening";
  const canOpenFullExam = fullExamEntrySection !== "listening" || listeningReady;

  return (
    <div className="min-h-screen w-full bg-[#fafafa] text-neutral-900 font-sans selection:bg-neutral-200 flex flex-col">
      {/* Unified Top Header Bar */}
      <header className="w-full border-b border-neutral-200/80 bg-white sticky top-0 z-30">
        <div className="max-w-[1400px] mx-auto flex h-[60px] items-center justify-between px-4 sm:px-8">
          <div className="flex items-center gap-2 sm:gap-6 min-w-0">
            <AssessmentLabBrand />
            <div className="hidden sm:flex flex-col text-xs border-l pl-6 h-8 justify-center min-w-0">
              <span className="font-bold text-neutral-900 leading-tight">
                Practice
              </span>
              <span className="text-neutral-500 text-[11px] truncate leading-tight">
                IELTS and custom assessments
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs shrink-0">
            <div className="inline-flex items-center gap-1.5 text-neutral-500 text-[11px]">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              <span>Saved on this device</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Page Content */}
      <main className="flex-1 w-full max-w-[1400px] mx-auto px-4 sm:px-8 lg:px-12 py-8 lg:py-10 space-y-10">
        {/* Title & Philosophy Block */}
        <div className="space-y-3">
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-neutral-950">
            Choose your practice
          </h1>
          <p className="text-base text-neutral-600 leading-relaxed font-normal max-w-3xl">
            Create practice with your agent, answer the questions here, and review your results.
          </p>
          <div className="border-l-2 border-neutral-300 pl-4 py-1 text-sm text-neutral-600 italic">
            The application provides structure. Your agent provides intelligence.
          </div>
        </div>

        {/* Full Exam Simulation Card */}
        <section className="rounded-xl border border-neutral-200/90 bg-white p-6 sm:p-7 shadow-2xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
            <div className="space-y-1.5">
              <div className="inline-flex items-center gap-2">
                <span className="text-[10px] font-bold tracking-wider uppercase bg-neutral-900 text-white px-2 py-0.5 rounded">
                  Native IELTS
                </span>
                <span className="text-xs text-neutral-500 inline-flex items-center gap-1">
                  <Clock size={12} /> ~{Math.floor(fullExamMinutes / 60)} hrs {fullExamMinutes % 60} mins · {SECTION_ORDER.length} sections
                </span>
              </div>
              <h2 className="text-lg sm:text-xl font-bold text-neutral-900">
                Full IELTS Simulation
              </h2>
              <p className="text-xs sm:text-sm text-neutral-500 leading-relaxed max-w-2xl">
                {fullExamSequence}. Complete each section in order.
              </p>
            </div>

            <div className="shrink-0">
              <button
                type="button"
                onClick={
                  resumableFullExamSection
                    ? onResume
                    : () => onStart("full", "listening")
                }
                disabled={!canOpenFullExam}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--exam-accent)] hover:bg-[var(--exam-accent-hover)] text-white px-5 py-3 text-xs sm:text-sm font-semibold transition-colors disabled:opacity-40 cursor-pointer shadow-xs"
              >
                <PlayCircle size={16} />
                <span>
                  {resumableFullExamSection
                    ? `Resume Exam (${SECTION_META[resumableFullExamSection].label})`
                    : "Start Full Exam"}
                </span>
              </button>
            </div>
          </div>

          {resumableSection && session.mode === "full" && (
            <div className="mt-4 pt-3 border-t border-neutral-100 flex items-center justify-between text-xs text-neutral-500">
              <span>Unfinished attempt in progress.</span>
              <button
                type="button"
                onClick={() => onStart("full", "listening")}
                className="text-neutral-700 hover:text-neutral-950 inline-flex items-center gap-1 font-medium underline cursor-pointer"
              >
                <RotateCcw size={11} /> Start over
              </button>
            </div>
          )}
        </section>

        <AssessmentLibrary {...assessmentLibrary} />

        {/* Modular Section Practice List */}
        <section className="space-y-4">
          <div className="flex items-center justify-between border-b border-neutral-200/80 pb-2.5">
            <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-500">
              IELTS practice
            </h2>
            <span className="text-xs text-neutral-400">Timed section practice</span>
          </div>

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
              const isResumable = resumablePracticeSection === sec;

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
                          <h3 className="text-sm font-bold text-neutral-900 leading-none">
                            {meta.label}
                          </h3>
                          <span className="text-[11px] text-neutral-400">
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

                    <p className="text-xs text-neutral-500 leading-relaxed min-h-[36px]">
                      {presentation.summary}
                    </p>

                    <div className="text-[11px] text-neutral-400 font-medium">
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
                          "Loading Kokoro TTS voice engine…"
                        ) : listeningAudio.phase === "generating" ? (
                          `${listeningReady ? 'Ready to start. Preparing remaining audio' : 'Generating audio'} (${listeningAudio.completedChunks}${
                            listeningAudio.totalChunks ? `/${listeningAudio.totalChunks}` : ""
                          } chunks)…`
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
                        isResumable ? onResume : () => onStart("section", sec)
                      }
                      disabled={sec === "listening" && !listeningReady}
                      className="w-full flex items-center justify-between rounded-md bg-neutral-50 hover:bg-neutral-100 border border-neutral-200/60 px-3.5 py-2 text-xs font-semibold text-neutral-800 transition-colors disabled:opacity-40 cursor-pointer"
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
        </section>

        <RecentAttempts
          assessmentHistory={assessmentLibrary.assessmentHistory}
          onReviewAssessment={assessmentLibrary.onReviewAssessment}
          learningSummary={learningSummary}
          onReviewAttempt={onReviewAttempt}
        />

        {/* Signature Monospace Callout */}
        <footer className="pt-6 border-t border-neutral-200/80 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-neutral-400">
          <div className="font-mono">
            Your practice is saved in this browser.
          </div>
          <button
            type="button"
            onClick={() => setToolsModalOpen(true)}
            className="inline-flex items-center gap-1.5 text-neutral-600 hover:text-neutral-900 font-medium cursor-pointer"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            <span>WebMCP Tools</span>
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
