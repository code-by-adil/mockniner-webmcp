import type { AssessmentSession } from "@/domain/assessmentSession";
import type { IeltsSession } from "@/domain/session";
import { getPracticeContext } from '@/application/practiceContext';
import type { AssessmentToolSurface } from "./assessmentTools";
import type { SpeakingToolSurface } from "./speakingTools";
import type { WritingToolSurface } from "./writingTools";

export function getAssessmentToolSurface(
  nativeHome: boolean,
  session: AssessmentSession,
): AssessmentToolSurface {
  if (session.view === "result") {
    return session.submission?.result.awaitingEvaluationCount && !session.evaluation
      ? "evaluation"
      : "results";
  }
  return nativeHome && session.view === "home" ? "authoring" : "none";
}

export type NativeToolSurfaces = {
  authoringEnabled: boolean;
  writing: WritingToolSurface;
  speaking: SpeakingToolSurface;
};

export function getNativeToolSurfaces(
  session: IeltsSession,
  assessmentSession: AssessmentSession,
): NativeToolSurfaces {
  if (assessmentSession.view !== "home") {
    return { authoringEnabled: false, writing: "none", speaking: "none" };
  }

  const context = getPracticeContext(session, assessmentSession);
  const surface = (kind: 'writing' | 'speaking'): WritingToolSurface => {
    const submission = context.submissions.find(candidate => candidate.kind === kind);
    return !submission ? 'none' : submission.evaluationStatus === 'awaiting_evaluation' ? 'evaluation' : 'results';
  };
  return { authoringEnabled: session.view === 'home', writing: surface('writing'), speaking: surface('speaking') };
}
