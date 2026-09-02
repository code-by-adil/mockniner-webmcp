import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ClipboardCheck,
  FileText,
  Headphones,
  Mic,
} from "lucide-react";
import { ExamUiBoundary } from "@/app/layouts/ExamUiBoundary";
import { Home } from "@/app/home/Home";
import { ListeningExamRunner } from "@/modules/section-packs/listening/ui/ListeningExamRunner";
import { ReadingExamRunner } from "@/modules/section-packs/reading/ui/ReadingExamRunner";
import { WritingExamRunner } from "@/modules/section-packs/writing/ui/WritingExamRunner";
import { WritingAttemptReview } from "@/modules/section-packs/writing/ui/WritingAttemptReview";
import { SpeakingExamRunner } from "@/modules/section-packs/speaking/ui/SpeakingExamRunner";
import { SpeakingAttemptReview } from "@/modules/section-packs/speaking/ui/SpeakingAttemptReview";
import { SECTION_META, SECTION_ORDER } from "@/domain/sections";
import type { ExamMode, ExamSession } from "@/domain/session";
import type { SectionKey } from "@/domain/types";
import { useExamApplication } from "@/application/useExamApplication";
import { useListeningAudio } from "@/application/useListeningAudio";
import { useWebMcpTools } from "@/webmcp/useWebMcpTools";
import { useAssessmentApplication } from "@/application/useAssessmentApplication";
import { AssessmentRunner } from "@/modules/assessment-engine/ui/AssessmentRunner";
import { AssessmentResults } from "@/modules/assessment-engine/ui/AssessmentResults";
import { AssessmentLabBrand } from "@/shared/ui/global/AssessmentLabBrand";
import { getAssessmentToolSurface, getNativeToolSurfaces } from "@/webmcp/toolSurfaces";

type Section = SectionKey;
type Mode = ExamMode;

const SECTION_ICONS = {
  listening: Headphones,
  reading: BookOpen,
  writing: FileText,
  speaking: Mic,
} as const;

function AppHeader() {
  return (
    <header className="w-full border-b border-neutral-200/80 bg-white sticky top-0 z-30">
      <div className="max-w-[1400px] mx-auto flex h-[60px] items-center justify-between px-4 sm:px-8">
        <div className="flex items-center gap-2 sm:gap-6 min-w-0">
          <AssessmentLabBrand />
          <div className="hidden sm:flex flex-col text-xs border-l pl-6 h-8 justify-center min-w-0">
            <span className="font-bold text-neutral-900 leading-tight">
              Assessment Practice Workspace
            </span>
            <span className="text-neutral-500 text-[11px] truncate leading-tight">
              Practice &amp; Evaluation Workspace
            </span>
          </div>
        </div>
        <div className="inline-flex items-center gap-1.5 text-neutral-500 text-[11px]">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          <span>Saved on this device</span>
        </div>
      </div>
    </header>
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
          {SECTION_META[section].label} is complete
        </h1>
        <p className="mt-3 max-w-xl leading-7 text-[var(--exam-text-muted)]">
          Your answers are locked and retained locally for this practice attempt.
        </p>
        {section === "writing" ? (
          <div className="mt-6 w-full max-w-xl rounded-lg border border-[var(--exam-accent-border)] bg-[var(--exam-surface)] px-5 py-4 text-left shadow-sm">
            <p className="text-sm font-bold text-[var(--exam-text)]">Ready for agent evaluation</p>
            <p className="mt-1 text-sm leading-6 text-[var(--exam-text-muted)]">
              Ask your agent: “Grade my latest IELTS Writing submission.” It can read this immutable
              submission and return structured feedback here.
            </p>
          </div>
        ) : section === "speaking" ? (
          <div className="mt-6 w-full max-w-xl rounded-lg border border-[var(--exam-accent-border)] bg-[var(--exam-surface)] px-5 py-4 text-left shadow-sm">
            <p className="text-sm font-bold text-[var(--exam-text)]">
              Ready for transcript evaluation
            </p>
            <p className="mt-1 text-sm leading-6 text-[var(--exam-text-muted)]">
              Ask your agent: “Evaluate my latest IELTS Speaking transcript.” It can score fluency,
              vocabulary, and grammar, then return the review here.
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
            {isFinal
              ? "View results"
              : `Continue to ${SECTION_META[SECTION_ORDER[SECTION_ORDER.indexOf(section) + 1]!].label}`}
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
          <h1 className="text-3xl font-extrabold tracking-tight">Practice results</h1>
          <p className="mt-2 text-[var(--exam-text-muted)]">
            Objective answers are graded locally. Writing and Speaking remain available for agent
            evaluation.
          </p>
        </div>
        <div className="grid gap-5 md:grid-cols-2">
          {session.completedSections.map((section) => {
            const meta = SECTION_META[section];
            const Icon = SECTION_ICONS[section];
            const result =
              section === "listening" || section === "reading"
                ? session.objectiveSubmissions[section]?.result
                : null;
            const canReview =
              section === "listening" ||
              section === "reading" ||
              (section === "writing" && Boolean(session.writingEvaluation)) ||
              (section === "speaking" && Boolean(session.speakingEvaluation));
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
                    <h2 className="text-xl font-semibold">{meta.label}</h2>
                    <p className="mt-1 text-sm text-[var(--exam-text-muted)]">
                      {result
                        ? `${result.raw} of 40 correct · Band ${result.band}`
                        : section === "writing" && session.writingEvaluation
                          ? `Estimated overall band ${session.writingEvaluation.overallBand} · Evaluation ready`
                          : section === "speaking" && session.speakingSubmission
                            ? session.speakingEvaluation
                              ? `Estimated overall band ${session.speakingEvaluation.overallBand} · Evaluation ready`
                              : `${session.speakingSubmission.responses.length} recordings saved locally · Awaiting evaluation`
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
  const { state, content, contentReady, learningSummary, commands } = useExamApplication();
  const assessmentApplication = useAssessmentApplication();
  const listeningAudio = useListeningAudio(content.listening);
  const assessmentToolSurface = getAssessmentToolSurface(
    state.view === "home",
    assessmentApplication.state,
  );
  const nativeToolSurfaces = getNativeToolSurfaces(state, assessmentApplication.state);
  useWebMcpTools({
    commands,
    assessmentCommands: assessmentApplication.commands,
    currentWritingAttemptId: state.writingSubmission?.attemptId,
    currentSpeakingAttemptId: state.speakingSubmission?.attemptId,
    currentAssessmentAttemptId:
      assessmentApplication.state.view === "result"
        ? assessmentApplication.state.submission?.attemptId
        : undefined,
    assessmentToolSurface,
    nativeAuthoringEnabled: nativeToolSurfaces.authoringEnabled,
    writingToolSurface: nativeToolSurfaces.writing,
    speakingToolSurface: nativeToolSurfaces.speaking,
    enabled: contentReady && assessmentApplication.assessmentReady,
  });
  const section = state.view === "review"
    ? state.review?.section ?? null
    : state.currentSection;
  const mode = state.mode ?? "section";

  if (!contentReady || !assessmentApplication.assessmentReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--exam-surface-muted)] text-sm font-semibold text-[var(--exam-text-muted)]">
        Loading assessment workspace…
      </div>
    );
  }

  if (assessmentApplication.state.view === "assessment" && assessmentApplication.currentAssessment) {
    return (
      <ExamUiBoundary className="h-screen w-full overflow-hidden">
        <AssessmentRunner
          key={assessmentApplication.state.partId}
          assessment={assessmentApplication.currentAssessment}
          session={assessmentApplication.state}
          onExit={assessmentApplication.commands.goHome}
          onResponse={assessmentApplication.commands.setResponse}
          onToggleMark={assessmentApplication.commands.toggleMark}
          onToggleElimination={assessmentApplication.commands.toggleElimination}
          onSetTimerHidden={assessmentApplication.commands.setTimerHidden}
          onSetItem={assessmentApplication.commands.setItem}
          onTick={assessmentApplication.commands.tick}
          onAdvanceItem={assessmentApplication.commands.advanceItem}
          onCompletePart={assessmentApplication.commands.completePart}
          onExpirePart={assessmentApplication.commands.expirePart}
          onSubmit={assessmentApplication.commands.submit}
        />
      </ExamUiBoundary>
    );
  }

  if (assessmentApplication.state.view === "result" && assessmentApplication.state.submission) {
    return (
      <AssessmentResults
        submission={assessmentApplication.state.submission}
        evaluation={assessmentApplication.state.evaluation}
        onHome={assessmentApplication.commands.goHome}
      />
    );
  }

  if (state.view === "home" || !section) {
    return (
      <Home
        onStart={commands.start}
        onResume={commands.resume}
        session={state}
        listeningAudio={listeningAudio}
        onRetryListeningAudio={listeningAudio.retry}
        content={content}
        learningSummary={learningSummary}
        onReviewAttempt={commands.openAttempt}
        assessmentLibrary={{
          assessments: assessmentApplication.assessments,
          assessmentSession: assessmentApplication.state,
          assessmentHistory: assessmentApplication.history,
          onStartAssessment: assessmentApplication.commands.start,
          onResumeAssessment: assessmentApplication.commands.resume,
          onRestartAssessment: assessmentApplication.commands.restart,
          onDiscardAssessment: assessmentApplication.commands.discard,
          onDeleteAssessment: assessmentApplication.commands.deleteAssessment,
          onReviewAssessment: assessmentApplication.commands.openAttempt,
        }}
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
    return <Results session={state} onHome={commands.goHome} onReview={commands.openReview} />;
  }

  if (section === "listening" || section === "reading") {
    const review = state.review?.kind === "objective" && state.review.section === section
      ? state.review
      : null;
    const isReviewMode = state.view === "review";
    if (isReviewMode && !review) {
      throw new Error(`${section} review snapshot is unavailable.`);
    }
    const document = review?.document ?? content[section];
    const submission = review?.submission;
    const commonProps = {
      document,
      answers: isReviewMode ? submission!.answers : state.answers[section],
      currentPart: review?.part ?? state.partBySection[section],
      secondsRemaining: state.secondsRemaining[section],
      onBack: isReviewMode ? commands.closeReview : commands.goHome,
      isReviewMode,
      onAnswerChange: (id: number, value: string) =>
        commands.setObjectiveAnswer(section, id, value),
      onPartChange: (part: number) => commands.setPart(section, part),
      onTick: () => commands.tick(section),
      onSubmit: isReviewMode ? undefined : () => commands.submitObjective(section),
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
    if (state.view === "review" && state.review?.kind === "writing") {
      return (
        <WritingAttemptReview
          submission={state.review.submission}
          evaluation={state.review.evaluation}
          currentPart={state.review.part === 2 ? 2 : 1}
          onExit={commands.closeReview}
          onPartChange={(part) => commands.setPart("writing", part)}
        />
      );
    }
    return (
      <WritingExamRunner
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

  if (state.view === "review" && state.review?.kind === "speaking") {
    return (
      <SpeakingAttemptReview
        submission={state.review.submission}
        evaluation={state.review.evaluation}
        onExit={commands.closeReview}
      />
    );
  }

  return <SpeakingExamRunner onExit={commands.goHome} onSubmit={commands.submitSpeaking} />;
}
