import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { listeningDocument, readingDocument } from "@/content/objective";
import { writingDocument } from "@/content/writing";
import { initialAssessmentSession } from "@/domain/assessmentSession";
import { initialSession, sessionReducer, type IeltsSession } from "@/domain/session";
import { defaultSpeakingPlan } from '@/domain/speakingPlan';
import { Home } from "./Home";
import type { ActiveContentDocuments } from '@/domain/contentDocument';
import type { ListeningAudioSession } from '@/application/useListeningAudio';

const noOp = () => undefined;
const noOpAsync = async () => undefined;

function renderHome(session: IeltsSession = initialSession, content: ActiveContentDocuments = { listening: listeningDocument, reading: readingDocument, writing: writingDocument }, audio: Partial<ListeningAudioSession> = {}) {
  return renderToStaticMarkup(
    <Home
      assessmentLibrary={{
        assessments: [],
        assessmentSession: initialAssessmentSession,
        onStartAssessment: noOp,
        onResumeAssessment: noOp,
        onRestartAssessment: noOp,
        onDiscardAssessment: noOp,
        onDeleteAssessment: noOpAsync,
      }}
      onStart={noOp}
      onResume={noOp}
      session={session}
      listeningAudio={{
        phase: "ready", hydrated: true, chunks: [], totalChunks: 1,
        error: null, completedChunks: 0, readyToPlay: true, retry: noOp,
        ...audio,
      }}
      onRetryListeningAudio={noOp}
      content={content}
      historyRevision="initial"
      onReviewAttempt={noOpAsync}
    />,
  );
}

describe("native IELTS home metadata", () => {
  it('shows MockNiner branding and the broader exam-practice scope', () => {
    const html = renderHome();
    expect(html).toContain('/mockniner-logo.svg');
    expect(html).toContain('>Mock</span>');
    expect(html).toContain('>Niner</span>');
    expect(html).toContain('SAT, GRE, IELTS, and more');
    expect(html.match(/How to use</g)).toHaveLength(2);
    expect(html).toContain('href="#practice-history"');
    expect(html).not.toContain('continue-practice-title');
  });
  it('shows independent resume actions for every parked section and full exam', () => {
    let session = initialSession;
    for (const [index, section] of (['speaking', 'reading', 'writing', 'listening', 'listening'] as const).entries()) {
      session = sessionReducer(session, { type: 'START', mode: index === 4 ? 'full' : 'section', section, attemptId: crypto.randomUUID(), startedAt: '2026-09-03T00:00:00.000Z' });
      if (section === 'speaking') session = sessionReducer(session, { type: 'SET_SPEAKING_PLAN', plan: { ...defaultSpeakingPlan, title: 'Saved local places interview' } });
    }
    const html = renderHome(session);
    for (const section of ['Speaking', 'Reading', 'Writing', 'Listening']) expect(html).toContain(`Resume ${section}`);
    expect(html).toContain('Resume test (Listening)');
    expect(html).toContain('Saved local places interview');
    expect(html.indexOf('continue-practice-title')).toBeLessThan(html.indexOf('practice-library-title'));
  });
  it('shows the full active set names and escapes agent-authored markup', () => {
    const html = renderHome(initialSession, { listening: { ...listeningDocument, name: 'QA Harbour Listening', source: 'agent' },
      reading: { ...readingDocument, name: 'Reading <script>unsafe</script>', source: 'agent' }, writing: { ...writingDocument, name: 'QA Sports Writing', source: 'agent' } })
    expect(html).toContain('QA Harbour Listening')
    expect(html).toContain('QA Sports Writing')
    expect(html).toContain('Reading &lt;script&gt;unsafe&lt;/script&gt;')
    expect(html).not.toContain('<script>unsafe</script>')
  })
  it('explains playable buffering and shows actionable failure details', () => {
    expect(renderHome(initialSession, undefined, { phase: 'generating', readyToPlay: true, completedChunks: 2, totalChunks: 10 })).toContain('Ready to start. Preparing remaining audio. 2 of 10 audio segments ready.')
    const failed = renderHome(initialSession, undefined, { phase: 'error', readyToPlay: false, error: 'WebGPU unavailable.' })
    expect(failed).toContain('WebGPU unavailable.')
    expect(failed).toContain('Retry audio')
  })
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
      attemptId: '11111111-1111-4111-8111-111111111111',
      currentSection: "reading",
      completedSections: ["listening"],
    })).toContain("Resume test (Reading)");
  });
});
