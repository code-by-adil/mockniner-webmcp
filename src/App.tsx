import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ClipboardCheck,
  FileText,
  Headphones,
  Mic,
  PlayCircle,
} from "lucide-react";
import { ExamUiBoundary } from "@/app/layouts/UiLayerBoundary";
import { BrandLogo, BrandWordmark } from "@/shared/ui/global/BrandLogo";
import { ListeningExamRunner } from "@/modules/section-packs/listening/ui/ListeningExamRunner";
import { ReadingExamRunner } from "@/modules/section-packs/reading/ui/ReadingExamRunner";
import { LocalWritingExam } from "@/local/LocalWritingExam";
import { LocalWritingReview } from "@/local/LocalWritingReview";
import { LocalSpeakingExam } from "@/local/LocalSpeakingExam";
import { SECTION_ORDER } from "@/domain/exam";
import type { ExamMode, ExamSession } from "@/domain/session";
import type { SectionKey } from "@/domain/types";
import type { ActiveContentDocuments } from "@/domain/contentDocument";
import { useExamApplication } from "@/application/useExamApplication";
import {
  useListeningAudio,
  type ListeningAudioSession,
} from "@/application/useListeningAudio";
import { useWebMcpTools } from "@/webmcp/useWebMcpTools";

type Section = SectionKey;
type Mode = ExamMode;
const SECTION_META = {
  listening: {
    title: "Listening",
    description: "4 parts · 40 questions · continuous recording",
    icon: Headphones,
  },
  reading: {
    title: "Reading",
    description: "3 passages · 40 questions · split-pane workspace",
    icon: BookOpen,
  },
  writing: {
    title: "Writing",
    description: "2 tasks · 60 minutes · locally saved responses",
    icon: FileText,
  },
  speaking: {
    title: "Speaking",
    description: "3 parts · timed local audio responses",
    icon: Mic,
  },
} as const;

function AppHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-[var(--exam-border-muted)] bg-[color:var(--exam-surface)]/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6">
        <BrandLogo className="h-9 w-12" />
        <BrandWordmark />
        <span className="ml-auto rounded border border-[var(--exam-border)] bg-[var(--exam-surface)] px-3 py-1 text-xs font-semibold text-[var(--exam-text-muted)]">
          Offline practice
        </span>
      </div>
    </header>
  );
}

function Home({
  onStart,
  listeningAudio,
  onRetryListeningAudio,
  content,
}: {
  onStart: (mode: Mode, section: Section) => void;
  listeningAudio: ListeningAudioSession;
  onRetryListeningAudio: () => void;
  content: ActiveContentDocuments;
}) {
  const listeningReady = listeningAudio.readyToPlay;
  return (
    <div className="min-h-screen bg-[var(--exam-surface-muted)] text-[var(--exam-text)]">
        <AppHeader />
        <main className="mx-auto max-w-7xl px-4 pb-16 pt-10 sm:px-6">
          <div className="max-w-3xl">
            <div className="mb-4 inline-flex rounded border border-[var(--exam-border)] bg-[var(--exam-surface)] px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-[var(--exam-text-muted)]">
              Computer-delivered IELTS practice
            </div>
            <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">
              Choose a complete test section.
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--exam-text-muted)]">
              The exam runtime, navigation, question interactions, responsive
              behavior, and visual system are the MockNiner interface, running
              against local practice content.
            </p>
            <button
              type="button"
              onClick={() => onStart("full", "listening")}
              disabled={!listeningReady}
              className="mt-7 inline-flex items-center gap-2 rounded border border-[var(--exam-accent-border)] bg-[var(--exam-accent)] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[var(--exam-accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <PlayCircle size={18} />
              Start full practice test
            </button>
          </div>

          <div className="mt-12 grid gap-5 md:grid-cols-2">
            {SECTION_ORDER.map((section) => {
              const item = SECTION_META[section];
              const Icon = item.icon;
              const activeContent = section === "speaking" ? null : content[section];
              const isAgentCreated = Boolean(
                activeContent &&
                (activeContent.source === "agent" || !activeContent.contentKey.startsWith("local-")),
              );
              return (
                <article
                  key={section}
                  className="flex h-full flex-col rounded-lg border border-[var(--exam-border-muted)] bg-[var(--exam-surface)] px-6 py-6 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded bg-[var(--exam-accent)] text-white">
                    <Icon size={20} />
                  </div>
                  <h2 className="mt-5 text-xl font-semibold">{item.title}</h2>
                  <p className="mt-2 leading-6 text-[var(--exam-text-muted)]">
                    {item.description}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold">
                    <span className={`rounded-full px-2 py-1 ${isAgentCreated ? "bg-[var(--exam-success-bg)] text-[var(--exam-success-fg)]" : "bg-[var(--exam-surface-muted)] text-[var(--exam-text-muted)]"}`}>
                      {isAgentCreated ? "Agent-created" : "Built-in"}
                    </span>
                    <span className="text-[var(--exam-accent)]">
                      {activeContent?.name ?? "Speaking practice"}
                    </span>
                  </div>
                  {section === "listening" && listeningAudio.phase !== "ready" ? (
                    <div className="mt-4 rounded border border-[var(--exam-border-muted)] bg-[var(--exam-surface-muted)] px-3 py-2 text-xs font-semibold text-[var(--exam-text-muted)]">
                      {listeningAudio.phase === "error" ? (
                        <div className="flex items-center justify-between gap-3">
                          <span>{listeningAudio.error}</span>
                          <button
                            type="button"
                            onClick={onRetryListeningAudio}
                            className="shrink-0 text-[var(--exam-accent)] underline underline-offset-2"
                          >
                            Retry
                          </button>
                        </div>
                      ) : listeningAudio.phase === "loading" ? (
                        "Loading the local Kokoro voice engine…"
                      ) : listeningAudio.phase === "generating" ? (
                        `Preparing listening audio — ${listeningAudio.completedChunks}${listeningAudio.totalChunks == null ? "" : ` of ${listeningAudio.totalChunks}`} chunks saved`
                      ) : (
                        "Preparing listening audio…"
                      )}
                    </div>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => onStart("section", section)}
                    disabled={section === "listening" && !listeningReady}
                    className="mt-6 inline-flex w-full items-center justify-between gap-2 rounded border border-[var(--exam-accent-border)] bg-[var(--exam-accent)] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[var(--exam-accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span>Start {item.title}</span>
                    <ArrowRight size={16} />
                  </button>
                </article>
              );
            })}
          </div>
        </main>
    </div>
  );
}

function Complete({
  section,
  mode,
  onContinue,
  onHome,
}: {
  section: Section;
  mode: Mode;
  onContinue: () => void;
  onHome: () => void;
}) {
  const isFinal = mode === "section" || section === "speaking";
  return (
    <div className="min-h-screen bg-[var(--exam-surface-muted)] text-[var(--exam-text)]">
        <AppHeader />
        <main className="mx-auto flex max-w-3xl flex-col items-center px-6 py-24 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--exam-success-bg)] text-[var(--exam-success-fg)]">
            <Check size={28} />
          </div>
          <div className="mt-6 text-xs font-semibold uppercase tracking-widest text-[var(--exam-text-muted)]">
            Section submitted
          </div>
          <h1 className="mt-3 text-3xl font-extrabold tracking-tight">
            {SECTION_META[section].title} is complete
          </h1>
          <p className="mt-3 max-w-xl leading-7 text-[var(--exam-text-muted)]">
            Your answers are locked and retained locally for this practice
            attempt.
          </p>
          {section === "writing" ? (
            <div className="mt-6 w-full max-w-xl rounded-lg border border-[var(--exam-accent-border)] bg-[var(--exam-surface)] px-5 py-4 text-left shadow-sm">
              <p className="text-sm font-bold text-[var(--exam-text)]">
                Ready for agent evaluation
              </p>
              <p className="mt-1 text-sm leading-6 text-[var(--exam-text-muted)]">
                Ask your agent: “Grade my latest Writing attempt.” It can read this immutable submission and return structured feedback here.
              </p>
            </div>
          ) : null}
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={onHome}
              className="inline-flex items-center gap-2 rounded border border-[var(--exam-border)] bg-[var(--exam-surface)] px-5 py-3 text-sm font-semibold hover:bg-[var(--exam-control-hover-bg)]"
            >
              <ArrowLeft size={16} />
              Back to practice
            </button>
            <button
              type="button"
              onClick={onContinue}
              className="inline-flex items-center gap-2 rounded border border-[var(--exam-accent-border)] bg-[var(--exam-accent)] px-5 py-3 text-sm font-semibold text-white hover:bg-[var(--exam-accent-hover)]"
            >
              {isFinal ? "View results" : `Continue to ${SECTION_META[SECTION_ORDER[SECTION_ORDER.indexOf(section) + 1]!].title}`}
              <ArrowRight size={16} />
            </button>
          </div>
        </main>
    </div>
  );
}

function Results({
  session,
  onHome,
  onReview,
}: {
  session: ExamSession;
  onHome: () => void;
  onReview: (section: Section) => void;
}) {
  return (
    <div className="min-h-screen bg-[var(--exam-surface-muted)] text-[var(--exam-text)]">
        <AppHeader />
        <main className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
          <div className="mb-9">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[var(--exam-success-border)] bg-[var(--exam-success-bg)] px-3 py-1 text-xs font-semibold text-[var(--exam-success-fg)]">
              <Check size={14} /> Attempt complete
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight">
              Practice results
            </h1>
            <p className="mt-2 text-[var(--exam-text-muted)]">
              Objective answers are graded locally. Writing and Speaking remain
              available for agent evaluation.
            </p>
          </div>
          <div className="grid gap-5 md:grid-cols-2">
            {session.completedSections.map((section) => {
              const meta = SECTION_META[section];
              const Icon = meta.icon;
              const result =
                section === "listening" || section === "reading"
                  ? session.objectiveSubmissions[section]?.result
                  : null;
              const canReview =
                section === "listening" ||
                section === "reading" ||
                (section === "writing" && Boolean(session.writingEvaluation));
              return (
                <article
                  key={section}
                  className="rounded-lg border border-[var(--exam-border-muted)] bg-[var(--exam-surface)] px-6 py-6 shadow-sm"
                >
                  <div className="flex items-start gap-4">
                    <div className="flex h-11 w-11 items-center justify-center rounded bg-[var(--exam-accent)] text-white">
                      <Icon size={20} />
                    </div>
                    <div>
                      <h2 className="text-xl font-semibold">{meta.title}</h2>
                      <p className="mt-1 text-sm text-[var(--exam-text-muted)]">
                        {result
                          ? `${result.raw} of 40 correct · Band ${result.band}`
                          : section === "writing" && session.writingEvaluation
                            ? `Estimated overall band ${session.writingEvaluation.overallBand} · Evaluation ready`
                          : section === "speaking" && session.speakingSubmission
                            ? `${session.speakingSubmission.recordedCount} recordings saved locally · Awaiting evaluation`
                          : "Submission ready for evaluation"}
                      </p>
                      {canReview ? (
                        <button
                          type="button"
                          onClick={() => onReview(section)}
                          className="mt-4 inline-flex items-center gap-2 rounded border border-[var(--exam-accent-border)] bg-[var(--exam-surface)] px-3.5 py-2 text-xs font-bold text-[var(--exam-accent)] transition-colors hover:bg-[var(--exam-control-hover-bg)]"
                        >
                          <ClipboardCheck size={15} />
                          Review answers
                        </button>
                      ) : null}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
          <button
            type="button"
            onClick={onHome}
            className="mt-8 inline-flex items-center gap-2 rounded border border-[var(--exam-accent-border)] bg-[var(--exam-accent)] px-5 py-3 text-sm font-semibold text-white hover:bg-[var(--exam-accent-hover)]"
          >
            Back to practice
          </button>
        </main>
    </div>
  );
}

export default function App() {
  const { state, content, contentReady, commands } = useExamApplication();
  const listeningAudio = useListeningAudio(content.listening);
  useWebMcpTools({
    commands,
    currentWritingAttemptId: state.writingSubmission?.attemptId,
    enabled: contentReady,
  });
  const section = state.currentSection;
  const mode = state.mode ?? "section";

  if (!contentReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--exam-surface-muted)] text-sm font-semibold text-[var(--exam-text-muted)]">
        Loading practice content…
      </div>
    );
  }

  if (state.view === "home" || !section) {
    return (
      <Home
        onStart={commands.start}
        listeningAudio={listeningAudio}
        onRetryListeningAudio={listeningAudio.retry}
        content={content}
      />
    );
  }

  if (state.view === "transition") {
    return (
      <Complete
        section={section}
        mode={mode}
        onHome={commands.goHome}
        onContinue={commands.continueExam}
      />
    );
  }

  if (state.view === "result") {
    return (
      <Results
        session={state}
        onHome={commands.goHome}
        onReview={commands.openReview}
      />
    );
  }

  if (section === "listening" || section === "reading") {
    const isReviewMode = state.view === "review";
    const document = content[section];
    const submission = state.objectiveSubmissions[section];
    if (isReviewMode && !submission) {
      throw new Error(`${section} review submission is unavailable.`);
    }
    const commonProps = {
      document,
      answers: isReviewMode ? submission!.answers : state.answers[section],
      currentPart: state.partBySection[section],
      secondsRemaining: state.secondsRemaining[section],
      onBack: isReviewMode ? commands.closeReview : commands.goHome,
      isReviewMode,
      onAnswerChange: (id: number, value: string) =>
        commands.setObjectiveAnswer(section, id, value),
      onPartChange: (part: number) => commands.setPart(section, part),
      onTick: () => commands.tick(section),
      onSubmit: isReviewMode
        ? undefined
        : () => commands.submitObjective(section),
    };
    return (
      <ExamUiBoundary>
        {section === "listening" ? (
          <ListeningExamRunner
            {...commonProps}
            audioSession={listeningAudio}
            listeningPlayback={state.listeningPlayback}
            onListeningPlaybackChange={
              isReviewMode ? () => undefined : commands.setListeningPlayback
            }
          />
        ) : (
          <ReadingExamRunner {...commonProps} />
        )}
      </ExamUiBoundary>
    );
  }

  if (section === "writing") {
    if (
      state.view === "review" &&
      state.writingSubmission &&
      state.writingEvaluation
    ) {
      return (
        <LocalWritingReview
          submission={state.writingSubmission}
          evaluation={state.writingEvaluation}
          currentPart={state.partBySection.writing === 2 ? 2 : 1}
          onExit={commands.closeReview}
          onPartChange={(part) => commands.setPart("writing", part)}
        />
      );
    }
    return (
      <LocalWritingExam
        document={content.writing}
        answers={state.writingDrafts}
        currentPart={state.partBySection.writing === 2 ? 2 : 1}
        secondsRemaining={state.secondsRemaining.writing}
        onExit={commands.goHome}
        onAnswerChange={commands.setWritingDraft}
        onPartChange={(part) => commands.setPart("writing", part)}
        onTick={() => commands.tick("writing")}
        onSubmit={commands.submitWriting}
      />
    );
  }

  return (
    <LocalSpeakingExam
      onExit={commands.goHome}
      onSubmit={commands.submitSpeaking}
    />
  );
}
