import type { AssessmentSession } from "@/domain/assessmentSession";
import type { IeltsSession } from "@/domain/session";
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

  const authoringEnabled = session.view === "home";
  let writing: WritingToolSurface = "none";
  let speaking: SpeakingToolSurface = "none";

  if (session.writingSubmission && session.view !== "home") {
    const writingIsVisible = session.currentSection === "writing" || session.view === "result";
    if (writingIsVisible) writing = session.writingEvaluation ? "results" : "evaluation";
  }

  if (session.speakingSubmission && session.view !== "home") {
    const speakingIsVisible = session.currentSection === "speaking" || session.view === "result";
    if (speakingIsVisible) speaking = session.speakingEvaluation ? "results" : "evaluation";
  }

  return { authoringEnabled, writing, speaking };
}
