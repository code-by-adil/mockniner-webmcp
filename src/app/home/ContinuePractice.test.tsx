// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { listeningDocument, readingDocument } from '@/content/objective';
import { writingDocument } from '@/content/writing';
import { satPracticeAssessment } from '@/content/sat';
import { assessmentSessionReducer, initialAssessmentSession } from '@/domain/assessmentSession';
import { initialSession, sessionReducer, type IeltsSession } from '@/domain/session';
import { defaultSpeakingPlan } from '@/domain/speakingPlan';
import { ContinuePractice } from './ContinuePractice';
import type { AssessmentLibraryProps } from './AssessmentLibrary';

const content = { listening: listeningDocument, reading: readingDocument, writing: writingDocument };
const noOp = () => {};
const library: AssessmentLibraryProps = {
  assessments: [satPracticeAssessment], assessmentSession: initialAssessmentSession,
  onStartAssessment: noOp, onResumeAssessment: noOp, onRestartAssessment: noOp,
  onDiscardAssessment: noOp, onDeleteAssessment: async () => {},
};
const reading = sessionReducer(initialSession, { type: 'START', mode: 'section', section: 'reading',
  attemptId: '11111111-1111-4111-8111-111111111111', startedAt: '2026-08-01T10:00:00Z', contentKeys: { reading: readingDocument.contentKey } });
const assessment = assessmentSessionReducer(initialAssessmentSession, { type: 'START', assessment: satPracticeAssessment,
  attemptId: '22222222-2222-4222-8222-222222222222', startedAt: '2026-09-01T10:00:00Z', nowMs: Date.parse('2026-09-01T10:00:00Z') });

afterEach(() => vi.unstubAllGlobals());

describe('continue practice', () => {
  it('shows no continuation for a fresh workspace or completed native attempts', () => {
    for (const session of [initialSession, { ...reading, completedSections: ['reading'] } as IeltsSession]) {
      expect(renderToStaticMarkup(<ContinuePractice session={session} content={content} listeningReady onResume={noOp} assessmentLibrary={library} />)).toBe('');
    }
  });

  it('orders by actual start date without dropping older unfinished work or exposing answers', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const element = document.createElement('div');
    const root = createRoot(element);
    const onResume = vi.fn();
    const onResumeAssessment = vi.fn();
    const session = { ...reading, answers: { ...reading.answers, reading: { 1: 'private answer' } } };
    try {
      await act(async () => root.render(<ContinuePractice session={session} content={content} listeningReady onResume={onResume}
        assessmentLibrary={{ ...library, assessmentSession: assessment, onResumeAssessment }} />));
      expect([...element.querySelectorAll('[data-resume-attempt-id]')].map(row => row.getAttribute('data-resume-attempt-id')))
        .toEqual([assessment.attemptId, reading.attemptId]);
      expect(element.textContent).toContain('Started');
      expect(element.textContent).not.toMatch(/Last edited|private answer/);
      const buttons = element.querySelectorAll<HTMLButtonElement>('button');
      await act(async () => { buttons[0].click(); buttons[1].click(); });
      expect(onResumeAssessment).toHaveBeenCalledOnce();
      expect(onResume).toHaveBeenCalledWith(reading.attemptId);
      expect(session.answers.reading[1]).toBe('private answer');
    } finally { await act(async () => root.unmount()); }
  });

  it('uses pinned custom content and progress even when the catalog changes or loses the package', () => {
    for (const assessments of [[], [{ ...satPracticeAssessment, title: 'Replacement title', parts: [] }]]) {
      const html = renderToStaticMarkup(<ContinuePractice session={initialSession} content={content} listeningReady onResume={noOp}
        assessmentLibrary={{ ...library, assessments, assessmentSession: { ...assessment,
          responses: { [satPracticeAssessment.parts[0]!.items[0]!.id]: 'answered', [satPracticeAssessment.parts[0]!.items[1]!.id]: '   ' } } }} />);
      expect(html).toContain(satPracticeAssessment.title);
      expect(html).toContain('Part 1 of 4 · 1 of 12 questions answered');
      expect(html).not.toContain('Replacement title');
    }
  });

  it('keeps a full IELTS test resumable at the next section and gates only Listening audio', () => {
    const full = sessionReducer(initialSession, { type: 'START', mode: 'full', section: 'listening',
      attemptId: crypto.randomUUID(), startedAt: '2026-09-03T10:00:00Z' });
    const waiting = renderToStaticMarkup(<ContinuePractice session={full} content={content} listeningReady={false} onResume={noOp} assessmentLibrary={library} />);
    expect(waiting).toContain('disabled=""');
    expect(waiting).toContain('Listening audio is not ready');
    const next = renderToStaticMarkup(<ContinuePractice session={{ ...full, completedSections: ['listening'] }} content={content} listeningReady={false} onResume={noOp} assessmentLibrary={library} />);
    expect(next).toContain('Reading · 1 of 4 sections completed');
    expect(next).not.toContain('disabled=""');
  });

  it('does not borrow the name of a different active IELTS content set', () => {
    const html = renderToStaticMarkup(<ContinuePractice session={reading}
      content={{ ...content, reading: { ...readingDocument, contentKey: 'different-set', name: 'Different test' } }}
      listeningReady onResume={noOp} assessmentLibrary={library} />);
    expect(html).toContain('IELTS Reading practice');
    expect(html).not.toContain('Different test');
  });

  it('uses the saved Speaking plan and does not invent a started date for old drafts', () => {
    const html = renderToStaticMarkup(<ContinuePractice session={{ ...initialSession, attemptId: crypto.randomUUID(), mode: 'section', currentSection: 'speaking',
      speakingPlan: { ...defaultSpeakingPlan, title: 'My saved interview' } }} content={content} listeningReady onResume={noOp} assessmentLibrary={library} />);
    expect(html).toContain('My saved interview');
    expect(html).toContain('Speaking interview · In progress');
    expect(html).not.toMatch(/Started|Invalid Date/);
  });
});
