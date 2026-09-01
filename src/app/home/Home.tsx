import React, { useEffect, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Check,
  Clock,
  Copy,
  FileText,
  Headphones,
  Mic,
  PlayCircle,
  RotateCcw,
  X,
} from "lucide-react";
import { ExamBrandMark } from "@/modules/exam-engine/ui/ExamBrandMark";
import { SECTION_ORDER } from "@/domain/exam";
import {
  getResumableSection,
  type ExamMode,
  type ExamSession,
} from "@/domain/session";
import type { SectionKey } from "@/domain/types";
import type { ActiveContentDocuments } from "@/domain/contentDocument";
import type { ListeningAudioSession } from "@/application/useListeningAudio";
import type { LearningSummary } from "@/domain/learningSummary";

type Section = SectionKey;
type Mode = ExamMode;

const SECTION_CONFIG = {
  listening: {
    title: "Listening",
    timing: "30 mins",
    structure: "4 parts · 40 questions",
    summary: "Recorded conversations and lectures with timed question pacing.",
    icon: Headphones,
  },
  reading: {
    title: "Reading",
    timing: "60 mins",
    structure: "3 passages · 40 questions",
    summary: "Academic passages with split-pane text and interactive questions.",
    icon: BookOpen,
  },
  writing: {
    title: "Writing",
    timing: "60 mins",
    structure: "2 tasks · 150 & 250 words",
    summary: "Report and essay responses stored locally for agent evaluation.",
    icon: FileText,
  },
  speaking: {
    title: "Speaking",
    timing: "11–14 mins",
    structure: "3 parts · interview",
    summary: "Voice prompts and audio recording with transcript scoring.",
    icon: Mic,
  },
} as const;

const WEBMCP_TOOLS = [
  {
    name: "install_practice_set",
    desc: "Generate and install customized Listening, Reading, or Writing test materials.",
  },
  {
    name: "read_writing_attempt",
    desc: "Retrieve submitted Task 1 and Task 2 essays for grading.",
  },
  {
    name: "attach_writing_evaluation",
    desc: "Attach official Band descriptors, criteria scores, and targeted feedback.",
  },
  {
    name: "read_speaking_attempt",
    desc: "Retrieve recorded interview audio transcripts across all 3 parts.",
  },
  {
    name: "attach_speaking_evaluation",
    desc: "Attach Fluency, Lexical Resource, Grammar, and Pronunciation scores.",
  },
  {
    name: "read_learning_summary",
    desc: "Inspect recent attempt history, overall bands, and weak skill areas.",
  },
];

const PROMPT_SUGGESTIONS = [
  "Generate an IELTS Academic Reading test on renewable energy with 13 questions.",
  "Grade my submitted IELTS Writing Task 2 essay against official band descriptors.",
  "Review my latest Speaking test transcript and recommend Band 8+ vocabulary improvements.",
];

export function Home({
  onStart,
  onResume,
  session,
  listeningAudio,
  onRetryListeningAudio,
  content,
  onReview,
}: {
  onStart: (mode: Mode, section: Section) => void;
  onResume: () => void;
  session: ExamSession;
  listeningAudio: ListeningAudioSession;
  onRetryListeningAudio: () => void;
  content: ActiveContentDocuments;
  onReview?: (section: Section) => void;
}): React.ReactElement {
  const [learningSummary, setLearningSummary] = useState<LearningSummary | null>(null);
  const [toolsModalOpen, setToolsModalOpen] = useState(false);
  const [copiedPromptIndex, setCopiedPromptIndex] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      import("@/infrastructure/database/client"),
      import("@/infrastructure/database/attemptRepository"),
    ])
      .then(async ([{ getLocalDatabase }, { readLearningSummary }]) => {
        const db = await getLocalDatabase();
        return readLearningSummary(db, 5);
      })
      .then((summary) => {
        if (!cancelled) setLearningSummary(summary);
      })
      .catch(() => {
        // SQLite history reading is optional
      });
    return () => {
      cancelled = true;
    };
  }, [session]);

  const handleCopyPrompt = (promptText: string, index: number) => {
    void navigator.clipboard.writeText(promptText);
    setCopiedPromptIndex(index);
    setTimeout(() => setCopiedPromptIndex(null), 2000);
  };

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
            <ExamBrandMark />
            <div className="hidden sm:flex flex-col text-xs border-l pl-6 h-8 justify-center min-w-0">
              <span className="font-bold text-neutral-900 leading-tight">
                Computer-Delivered IELTS
              </span>
              <span className="text-neutral-500 text-[11px] truncate leading-tight">
                Practice &amp; Evaluation Workspace
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
            IELTS Practice Environment
          </h1>
          <p className="text-base text-neutral-600 leading-relaxed font-normal max-w-3xl">
            A quiet, authentic environment for computer-delivered IELTS simulation, drafting, and evaluation.
          </p>
          <div className="border-l-2 border-neutral-300 pl-4 py-1 text-sm text-neutral-600 italic">
            “The application provides structure. Your agent provides intelligence.”
          </div>
        </div>

        {/* Full Exam Simulation Card */}
        <section className="rounded-xl border border-neutral-200/90 bg-white p-6 sm:p-7 shadow-2xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
            <div className="space-y-1.5">
              <div className="inline-flex items-center gap-2">
                <span className="text-[10px] font-bold tracking-wider uppercase bg-neutral-900 text-white px-2 py-0.5 rounded">
                  Full Simulation
                </span>
                <span className="text-xs text-neutral-500 inline-flex items-center gap-1">
                  <Clock size={12} /> ~2 hrs 45 mins · 4 sections
                </span>
              </div>
              <h2 className="text-lg sm:text-xl font-bold text-neutral-900">
                Official Exam Simulation
              </h2>
              <p className="text-xs sm:text-sm text-neutral-500 leading-relaxed max-w-2xl">
                Listening (30m) → Reading (60m) → Writing (60m) → Speaking (14m) with authentic exam-day timing and section sequencing.
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
                    ? `Resume Exam (${SECTION_CONFIG[resumableFullExamSection].title})`
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

        {/* Modular Section Practice List */}
        <section className="space-y-4">
          <div className="flex items-center justify-between border-b border-neutral-200/80 pb-2.5">
            <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-500">
              Practice Modules
            </h2>
            <span className="text-xs text-neutral-400">Untimed or standard pacing</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {SECTION_ORDER.map((sec) => {
              const meta = SECTION_CONFIG[sec];
              const Icon = meta.icon;
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
                            {meta.title}
                          </h3>
                          <span className="text-[11px] text-neutral-400">
                            {meta.timing}
                          </span>
                        </div>
                      </div>

                      {isAgent && (
                        <span className="text-[10px] font-semibold text-neutral-600 bg-neutral-100 px-1.5 py-0.5 rounded border border-neutral-200">
                          Custom
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-neutral-500 leading-relaxed min-h-[36px]">
                      {meta.summary}
                    </p>

                    <div className="text-[11px] text-neutral-400 font-medium">
                      {meta.structure}
                    </div>

                    {sec === "listening" && listeningAudio.phase !== "ready" && (
                      <div className="text-[11px] text-neutral-500 pt-1">
                        {listeningAudio.phase === "error" ? (
                          <span className="text-red-600 font-medium">
                            Audio generation failed —{" "}
                            <button
                              type="button"
                              onClick={onRetryListeningAudio}
                              className="underline cursor-pointer"
                            >
                              retry
                            </button>
                          </span>
                        ) : listeningAudio.phase === "loading" ? (
                          "Loading Kokoro TTS voice engine…"
                        ) : listeningAudio.phase === "generating" ? (
                          `Generating audio (${listeningAudio.completedChunks}${
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
                        {isResumable ? "Resume" : "Practice"} {meta.title}
                      </span>
                      <ArrowRight size={13} className="text-neutral-400" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Recent Attempts (if existing) */}
        {learningSummary && learningSummary.totalAttempts > 0 && (
          <section className="space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-200/80 pb-2.5">
              <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-500">
                Recent Attempts
              </h2>
              <span className="text-xs text-neutral-400">
                {learningSummary.totalAttempts} total saved locally
              </span>
            </div>

            <div className="divide-y divide-neutral-100 rounded-xl border border-neutral-200 bg-white text-xs shadow-2xs">
              {learningSummary.sections.reading.recent.slice(0, 2).map((attempt) => (
                <div
                  key={attempt.attemptId}
                  className="flex items-center justify-between p-4"
                >
                  <div className="flex items-center gap-3">
                    <BookOpen size={16} className="text-neutral-400" />
                    <div>
                      <span className="font-semibold text-neutral-800">Reading Practice</span>
                      <span className="text-neutral-400 text-[11px] ml-2">
                        {new Date(attempt.submittedAt).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <span className="font-bold text-neutral-900">
                      Band {attempt.band} ({attempt.raw}/{attempt.total})
                    </span>
                    {onReview && (
                      <button
                        type="button"
                        onClick={() => onReview("reading")}
                        className="rounded border border-neutral-200 px-2.5 py-1 text-[11px] font-medium text-neutral-700 hover:bg-neutral-50 cursor-pointer"
                      >
                        Review
                      </button>
                    )}
                  </div>
                </div>
              ))}

              {learningSummary.sections.listening.recent.slice(0, 2).map((attempt) => (
                <div
                  key={attempt.attemptId}
                  className="flex items-center justify-between p-4"
                >
                  <div className="flex items-center gap-3">
                    <Headphones size={16} className="text-neutral-400" />
                    <div>
                      <span className="font-semibold text-neutral-800">Listening Practice</span>
                      <span className="text-neutral-400 text-[11px] ml-2">
                        {new Date(attempt.submittedAt).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <span className="font-bold text-neutral-900">
                      Band {attempt.band} ({attempt.raw}/{attempt.total})
                    </span>
                    {onReview && (
                      <button
                        type="button"
                        onClick={() => onReview("listening")}
                        className="rounded border border-neutral-200 px-2.5 py-1 text-[11px] font-medium text-neutral-700 hover:bg-neutral-50 cursor-pointer"
                      >
                        Review
                      </button>
                    )}
                  </div>
                </div>
              ))}

              {learningSummary.sections.writing.recent.slice(0, 2).map((attempt) => (
                <div
                  key={attempt.attemptId}
                  className="flex items-center justify-between p-4"
                >
                  <div className="flex items-center gap-3">
                    <FileText size={16} className="text-neutral-400" />
                    <div>
                      <span className="font-semibold text-neutral-800">Writing Practice</span>
                      <span className="text-neutral-400 text-[11px] ml-2">
                        {new Date(attempt.submittedAt).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <span className="font-bold text-neutral-900">
                      {attempt.overallBand ? `Band ${attempt.overallBand}` : "Awaiting Evaluation"}
                    </span>
                    {onReview && attempt.overallBand && (
                      <button
                        type="button"
                        onClick={() => onReview("writing")}
                        className="rounded border border-neutral-200 px-2.5 py-1 text-[11px] font-medium text-neutral-700 hover:bg-neutral-50 cursor-pointer"
                      >
                        Review
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Signature Monospace Callout */}
        <footer className="pt-6 border-t border-neutral-200/80 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-neutral-400">
          <div className="font-mono">
            Your practice stays local. Your workspace stays yours.
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

      {/* Clean WebMCP Modal Dialog */}
      {toolsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/40 backdrop-blur-xs p-4 sm:p-6">
          <div
            className="w-full max-w-2xl max-h-[88vh] flex flex-col rounded-2xl border border-neutral-200 bg-white shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
            role="dialog"
            aria-modal="true"
          >
            {/* Dialog Header */}
            <div className="flex items-start justify-between p-6 pb-4 border-b border-neutral-100">
              <div>
                <h2 className="text-lg font-bold text-neutral-900 leading-tight">
                  WebMCP Integration
                </h2>
                <p className="text-xs text-neutral-500 mt-1">
                  Page-native capabilities enabling your AI agent to create tests, grade essays, and evaluate speaking.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setToolsModalOpen(false)}
                aria-label="Close dialog"
                className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-800 transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Dialog Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* How it works */}
              <div className="space-y-1.5">
                <h3 className="text-xs font-bold text-neutral-900">
                  How your agent works with this site
                </h3>
                <p className="text-xs text-neutral-600 leading-relaxed">
                  Through WebMCP, your agent (such as ChatGPT or Claude) interacts directly with this exam simulator. It can generate customized test materials, retrieve submitted writing to evaluate against official IELTS band descriptors, and review speaking transcripts—all stored locally on your device.
                </p>
              </div>

              {/* Status Pill Box */}
              <div className="flex items-start gap-2.5 rounded-xl bg-neutral-100/70 border border-neutral-200/60 p-3.5 text-xs">
                <span className="h-2 w-2 rounded-full bg-emerald-500 mt-0.5 shrink-0" />
                <div className="space-y-0.5">
                  <div className="font-semibold text-neutral-900">
                    6 browser tools active
                  </div>
                  <div className="text-neutral-500 text-[11px]">
                    Available directly to connected AI agents while this workspace is open in your browser.
                  </div>
                </div>
              </div>

              {/* 2-Column Tools Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {WEBMCP_TOOLS.map((tool) => (
                  <div
                    key={tool.name}
                    className="rounded-xl border border-neutral-200/80 bg-neutral-50/70 p-3.5 space-y-1.5 hover:bg-neutral-50 hover:border-neutral-300 transition-colors"
                  >
                    <div className="font-mono text-xs font-semibold text-neutral-900">
                      {tool.name}
                    </div>
                    <div className="text-[11px] text-neutral-500 leading-relaxed">
                      {tool.desc}
                    </div>
                  </div>
                ))}
              </div>

              {/* Try Asking Section */}
              <div className="space-y-3 pt-3 border-t border-neutral-100">
                <div className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
                  Sample agent prompts
                </div>

                <div className="space-y-2.5">
                  {PROMPT_SUGGESTIONS.map((promptText, idx) => {
                    const isCopied = copiedPromptIndex === idx;
                    return (
                      <div
                        key={promptText}
                        className="flex items-start justify-between gap-3 rounded-xl border border-neutral-200/80 bg-neutral-50/60 p-3 text-xs text-neutral-800 hover:bg-neutral-50 hover:border-neutral-300 transition-colors"
                      >
                        <p className="flex-1 leading-relaxed text-neutral-800 font-normal select-text">
                          “{promptText}”
                        </p>
                        <button
                          type="button"
                          onClick={() => handleCopyPrompt(promptText, idx)}
                          aria-label={`Copy prompt: ${promptText}`}
                          className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-2.5 py-1 text-[11px] font-medium text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900 transition-colors shadow-2xs cursor-pointer"
                        >
                          {isCopied ? (
                            <>
                              <Check size={12} className="text-emerald-600" />
                              <span className="text-emerald-700 font-semibold">Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy size={12} className="text-neutral-400" />
                              <span>Copy</span>
                            </>
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
