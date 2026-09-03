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
import { ListeningExamRunner } from "@/modules/ielts/listening/ui/ListeningExamRunner";
import { ReadingExamRunner } from "@/modules/ielts/reading/ui/ReadingExamRunner";
import { ReadingAttemptReview } from "@/modules/ielts/reading/ui/ReadingAttemptReview";
import { WritingExamRunner } from "@/modules/ielts/writing/ui/WritingExamRunner";
import { WritingAttemptReview } from "@/modules/ielts/writing/ui/WritingAttemptReview";
import { PendingAttemptReview } from '@/app/PendingAttemptReview';
import { PendingWritingReview } from '@/modules/ielts/writing/ui/PendingWritingReview';
import { PracticeHeader } from '@/app/layouts/PracticeHeader';
import { ObjectiveResults } from '@/app/ObjectiveResults';
import type { ObjectiveContentDocument } from '@/domain/objectiveContent';
import { getListeningAudioStatus } from '@/application/listeningAudioStatus';
import { SpeakingExamRunner } from "@/modules/ielts/speaking/ui/SpeakingExamRunner";
import { SpeakingAttemptReview } from "@/modules/ielts/speaking/ui/SpeakingAttemptReview";
import { SpeakingEvaluationPrompt } from "@/modules/ielts/speaking/ui/SpeakingEvaluationPrompt";
import { SECTION_META, SECTION_ORDER } from "@/domain/sections";
import type { IeltsMode, IeltsSession } from "@/domain/session";
import type { SectionKey } from "@/domain/types";
import { useIeltsApplication } from "@/application/useIeltsApplication";
import { WorkspaceGate, StorageStatus, StorageButton } from '@/app/WorkspaceStorage';
import { draftSaves } from '@/infrastructure/saveCoordinator';
import { useListeningAudio } from "@/application/useListeningAudio";
import { useWebMcpTools } from "@/webmcp/useWebMcpTools";
import { useAssessmentApplication } from "@/application/useAssessmentApplication";
import { AssessmentRunner } from "@/modules/assessment-engine/ui/AssessmentRunner";
import { AssessmentResults } from "@/modules/assessment-engine/ui/AssessmentResults";
import { getAssessmentToolSurface, getNativeToolSurfaces } from "@/webmcp/toolSurfaces";
import { getPracticeContext } from '@/application/practiceContext';

type Section = SectionKey;
type Mode = IeltsMode;

const SECTION_ICONS = {
  listening: Headphones,
  reading: BookOpen,
  writing: FileText,
  speaking: Mic,
} as const;

export function Complete({
  section,
  mode,
  speakingAttemptId,
  onContinue,
  onHome,
}: {
  section: Section;
  mode: Mode;
  speakingAttemptId?: string;
  onContinue: () => void;
  onHome: () => void;
}) {
  const isFinal = mode === "section" || section === "speaking";
  return (
    <div className="min-h-screen bg-[var(--exam-surface-muted)] text-[var(--exam-text)]">
      <PracticeHeader />
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
              Ask your agent to grade this IELTS Writing submission.
              It can read your saved response and return feedback here.
            </p>
          </div>
        ) : section === "speaking" && speakingAttemptId ? (
          <SpeakingEvaluationPrompt key={speakingAttemptId} attemptId={speakingAttemptId} />
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

export function Results({
  session,
  onHome,
  onReview,
  objectiveContent,
}: {
  session: IeltsSession;
  onHome: () => void;
  onReview: (section: Section) => void;
  objectiveContent?: Partial<Record<'reading' | 'listening', ObjectiveContentDocument>>;
}) {
  const completedObjective = session.mode === 'section' && session.completedSections.length === 1
    ? session.completedSections[0] : undefined;
  if (completedObjective === 'reading' || completedObjective === 'listening') {
    const submission = session.objectiveSubmissions[completedObjective];
    if (submission) return <ObjectiveResults submission={submission} document={objectiveContent?.[completedObjective]} onHome={onHome} onReview={() => onReview(completedObjective)} />;
  }
  if (
    session.mode === 'section' &&
    session.completedSections.length === 1 &&
    session.completedSections[0] === 'writing' &&
    session.writingSubmission &&
    !session.writingEvaluation
  ) {
    return <PendingWritingReview submission={session.writingSubmission} onExit={onHome} />;
  }
  return (
    <div className="min-h-screen bg-[var(--exam-surface-muted)] text-[var(--exam-text)]">
      <PracticeHeader />
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
              (section === "writing" && Boolean(session.writingSubmission)) ||
              (section === "speaking" && Boolean(session.speakingEvaluation));
            return (
              <article
                key={section}
                className={`rounded-lg border border-[var(--exam-border-muted)] bg-[var(--exam-surface)] px-6 py-6 shadow-sm ${section === 'speaking' && !session.speakingEvaluation ? 'md:col-span-2' : ''}`}
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
                              ? session.speakingEvaluation.status === 'insufficient_evidence'
                                ? 'Insufficient evidence · Feedback ready · No band assigned'
                                : `Estimated overall band ${session.speakingEvaluation.overallBand} · Evaluation ready`
                              : `${session.speakingSubmission.responses.filter(r => r.status === 'answered').length} answers recorded · ${session.speakingSubmission.responses.filter(r => r.status === 'skipped').length} skipped · Awaiting evaluation`
                            : section === 'writing' && session.writingSubmission
                              ? `Task 1: ${session.writingSubmission.tasks[0].wordCount} words · Task 2: ${session.writingSubmission.tasks[1].wordCount} words · Awaiting evaluation`
                              : "Submission ready for evaluation"}
                    </p>
                    {canReview ? (
                      <button
                        type="button"
                        onClick={() => onReview(section)}
                        className="mt-4 inline-flex items-center gap-2 rounded border border-[var(--exam-accent-border)] bg-[var(--exam-surface)] px-3.5 py-2 text-xs font-bold text-[var(--exam-accent)] transition-colors hover:bg-[var(--exam-control-hover-bg)]"
                      >
                        <ClipboardCheck size={15} />
                        {section === 'writing' && !session.writingEvaluation ? 'View submission' : 'Review answers'}
                      </button>
                    ) : null}
                  </div>
                </div>
                {section === 'speaking' && session.speakingSubmission && !session.speakingEvaluation ? (
                  <SpeakingEvaluationPrompt key={session.speakingSubmission.attemptId} attemptId={session.speakingSubmission.attemptId} />
                ) : null}
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
  return <WorkspaceGate><StorageStatus><PracticeApp /></StorageStatus></WorkspaceGate>;
}

function PracticeApp() {
  const { state, content, contentReady, loadError, learningSummary, commands, loadPracticeContent } = useIeltsApplication();
  const assessmentApplication = useAssessmentApplication();
  const uiCommands = {
    start: (...args: Parameters<typeof commands.start>) => { void Promise.resolve().then(() => commands.start(...args)).catch(draftSaves.reportFailure); },
    resume: (...args: Parameters<typeof commands.resume>) => { void Promise.resolve().then(() => commands.resume(...args)).catch(draftSaves.reportFailure); },
    goHome: () => { void Promise.resolve().then(() => commands.goHome()).catch(draftSaves.reportFailure); },
  };
  const listeningAudio = useListeningAudio(content.listening);
  const assessmentToolSurface = getAssessmentToolSurface(
    state.view === "home",
    assessmentApplication.state,
  );
  const nativeToolSurfaces = getNativeToolSurfaces(state, assessmentApplication.state);
  const webMcp = useWebMcpTools({
    commands,
    assessmentCommands: assessmentApplication.commands,
    context: getPracticeContext(state, assessmentApplication.state),
    workspace: { native: state, assessment: assessmentApplication.state, content, assessments: assessmentApplication.assessments, listeningAudio: getListeningAudioStatus(content.listening, listeningAudio) },
    retryListeningAudio: listeningAudio.retry,
    loadPracticeContent,
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

  const storageError = loadError ?? assessmentApplication.loadError;
  if (storageError) {
    return <main className="mx-auto max-w-lg p-8" role="alert">
      <h1 className="text-xl font-semibold">Could not load saved practice</h1>
      <p className="mt-3">{storageError}</p>
      <div className="mt-4"><StorageButton /></div>
      <button className="mt-5 rounded border px-4 py-2" onClick={() => window.location.reload()}>Retry loading</button>
    </main>;
  }

  if (!contentReady || !assessmentApplication.assessmentReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--exam-surface-muted)] text-sm font-semibold text-[var(--exam-text-muted)]">
        Loading saved practice…
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
        review={assessmentApplication.state.review ?? null}
        onReviewChange={assessmentApplication.commands.setReview}
      />
    );
  }

  if (state.view === "home" || !section) {
    return (
      <Home
        onStart={uiCommands.start}
        onResume={uiCommands.resume}
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
        speakingAttemptId={state.speakingSubmission?.attemptId}
        onHome={uiCommands.goHome}
        onContinue={commands.continueExam}
      />
    );
  }

  if (state.view === "result") {
    return <Results session={state} objectiveContent={content} onHome={uiCommands.goHome} onReview={(section) => {
      void commands.openReview(section).catch(draftSaves.reportFailure);
    }} />;
  }

  if (section === "listening" || section === "reading") {
    const review = state.review?.kind === "objective" && state.review.section === section
      ? state.review
      : null;
    const isReviewMode = state.view === "review";
    if (isReviewMode && !review) {
      throw new Error(`${section} review snapshot is unavailable.`);
    }
    if (review && isReviewMode && section === 'reading') {
      return <ExamUiBoundary><ReadingAttemptReview
        key={review.submission.attemptId}
        document={review.document}
        submission={review.submission}
        currentPart={review.part}
        selectedQuestionId={review.selectedQuestionId}
        onQuestionSelect={questionId => commands.setReviewLocation({ questionId })}
        explanations={review.explanations}
        focusRequest={review}
        onPartChange={(part) => commands.setPart('reading', part)}
        onExit={commands.closeReview}
        backLabel={review.returnTo === 'home' ? 'Back to practice' : 'Back to results'}
      /></ExamUiBoundary>;
    }
    const document = review?.document ?? content[section];
    const submission = review?.submission;
    const commonProps = {
      document,
      answers: isReviewMode ? submission!.answers : state.answers[section],
      currentPart: review?.part ?? state.partBySection[section],
      secondsRemaining: state.secondsRemaining[section],
      onBack: isReviewMode ? commands.closeReview : uiCommands.goHome,
      isReviewMode,
      onAnswerChange: (id: number, value: string) =>
        commands.setObjectiveAnswer(section, id, value),
      onPartChange: (part: number) => commands.setPart(section, part),
      selectedReviewQuestionId: review?.selectedQuestionId,
      onReviewQuestionSelect: isReviewMode ? (questionId: number) => commands.setReviewLocation({ questionId }) : undefined,
      reviewExplanations: review?.explanations,
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
      if (!state.review.evaluation) return <PendingAttemptReview review={state.review} onExit={commands.closeReview} />;
      return (
        <WritingAttemptReview
          backLabel={state.review.returnTo === 'home' ? 'Back to practice' : 'Back to results'}
          submission={state.review.submission}
          evaluation={state.review.evaluation}
          currentPart={state.review.part === 2 ? 2 : 1}
          selectedCorrectionId={state.review.selectedCorrectionId}
          focusRequest={state.review}
          onCorrectionSelect={correctionId => commands.setReviewLocation({ taskNumber: state.review?.part === 2 ? 2 : 1, correctionId })}
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
        onExit={uiCommands.goHome}
        onAnswerChange={commands.setWritingDraft}
        onPartChange={(part) => commands.setPart("writing", part)}
        onTick={() => commands.tick("writing")}
        onSubmit={commands.submitWriting}
      />
    );
  }

  if (state.view === "review" && state.review?.kind === "speaking") {
    if (!state.review.evaluation) return <PendingAttemptReview review={state.review} onExit={commands.closeReview} />;
    return (
      <SpeakingAttemptReview
        backLabel={state.review.returnTo === 'home' ? 'Back to practice' : 'Back to results'}
        submission={state.review.submission}
        evaluation={state.review.evaluation}
        onExit={commands.closeReview}
      />
    );
  }

  return <SpeakingExamRunner key={state.attemptId} onExit={uiCommands.goHome} onSubmit={commands.submitSpeaking}
    attemptId={state.attemptId ?? undefined} attemptStartedAt={state.startedAtBySection.speaking}
    initialPlan={state.speakingPlan} onConfigurePlan={commands.configureSpeakingPlan} canLeave={webMcp.canLeaveSpeaking}
    bindSpeakingInterview={webMcp.bindSpeakingInterview} />;
}
