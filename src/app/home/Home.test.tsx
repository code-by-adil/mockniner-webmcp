import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { listeningDocument, readingDocument } from "@/content/objective";
import { writingDocument } from "@/content/writing";
import { initialAssessmentSession } from "@/domain/assessmentSession";
import { initialSession, type ExamSession } from "@/domain/session";
import { Home } from "./Home";

const noOp = () => undefined;
const noOpAsync = async () => undefined;

function renderHome(session: ExamSession = initialSession) {
  return renderToStaticMarkup(
    <Home
      assessmentLibrary={{
        assessments: [],
        assessmentSession: initialAssessmentSession,
        assessmentHistory: [],
        onStartAssessment: noOp,
        onResumeAssessment: noOp,
        onRestartAssessment: noOp,
        onDiscardAssessment: noOp,
        onDeleteAssessment: noOpAsync,
        onReviewAssessment: noOpAsync,
      }}
      onStart={noOp}
      onResume={noOp}
      session={session}
      listeningAudio={{
        phase: "ready", hydrated: true, chunks: [], totalChunks: 1,
        error: null, completedChunks: 0, readyToPlay: true, retry: noOp,
      }}
      onRetryListeningAudio={noOp}
      content={{ listening: listeningDocument, reading: readingDocument, writing: writingDocument }}
      learningSummary={null}
      onReviewAttempt={noOpAsync}
    />,
  );
}

describe("native IELTS home metadata", () => {
  it("preserves timing, structure, and section action labels", () => {
    const html = renderHome();
    expect(html).toContain("~2 hrs 45 mins · 4 sections");
    expect(html).toContain("Listening (30m) → Reading (60m) → Writing (60m) → Speaking (14m)");
    expect(html).toContain("30 mins");
    expect(html.match(/60 mins/g)).toHaveLength(2);
    expect(html).toContain("11–14 mins");
    expect(html).toContain("2 tasks · 150 &amp; 250 words");
    expect(html).toContain("3 parts · interview");
    for (const label of ["Listening", "Reading", "Writing", "Speaking"]) {
      expect(html).toContain(`Practice ${label}`);
    }
  });

  it("uses the canonical label for a resumable full exam", () => {
    expect(renderHome({
      ...initialSession,
      mode: "full",
      currentSection: "reading",
      completedSections: ["listening"],
    })).toContain("Resume Exam (Reading)");
  });
});
