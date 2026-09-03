// @vitest-environment happy-dom
import { act, type ComponentProps } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { writingDocument } from '@/content/writing';
import { WritingAttemptReview } from './WritingAttemptReview';
import type { WritingAnnotation } from '@/domain/types';

const layout = vi.hoisted(() => ({ mobile: false }));
vi.mock('@/hooks/useExamLayout', () => ({ useIsMobile: () => layout.mobile }));

function reviewProps(annotations: WritingAnnotation[] = []): ComponentProps<typeof WritingAttemptReview> {
  const attemptId = '11111111-1111-4111-8111-111111111111';
  const taskScore = { band: 6, taskAchievement: 6, coherenceCohesion: 6, lexicalResource: 6, grammaticalRange: 6, feedback: 'Develop both points.', annotations };
  return {
    submission: { attemptId, contentKey: writingDocument.contentKey, startedAt: '2026-09-03T10:00:00Z', submittedAt: '2026-09-03T11:00:00Z', tasks: [
      { task: writingDocument.tasks[0], response: 'First sentence. Second sentence.', wordCount: 4 },
      { task: writingDocument.tasks[1], response: 'An essay response.', wordCount: 3 },
    ] },
    evaluation: { attemptId, overallBand: 6, summary: 'Both tasks address the question.', task1: taskScore, task2: taskScore, evaluatedAt: '2026-09-03T11:01:00Z' },
    currentPart: 1,
    onPartChange: vi.fn(),
    onCorrectionSelect: vi.fn(),
    onExit: vi.fn(),
  };
}

it('focuses a requested correction and opens its feedback on desktop and mobile', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host)
  const onCorrectionSelect = vi.fn()
  const annotations = ['First sentence.', 'Second sentence.'].map((originalText, index) => ({ id: `correction-${index}`, taskNumber: 1 as const, originalText, startOffset: index ? 16 : 0, endOffset: (index ? 16 : 0) + originalText.length, suggestion: `Replacement ${index}`, explanation: `Explanation ${index}`, type: 'coherence' as const }))
  const props = reviewProps(annotations)
  const render = async (selectedCorrectionId: string) => act(async () => root.render(<WritingAttemptReview {...props} selectedCorrectionId={selectedCorrectionId} onCorrectionSelect={onCorrectionSelect} focusRequest={{ selectedCorrectionId }} />))
  try {
    await render('correction-1')
    expect(host.querySelector('button[data-active="true"]')?.textContent).toBe('Second sentence.')
    expect(document.activeElement?.textContent).toBe('Second sentence.')
    expect(host.textContent).toContain('Replacement 1')
    await act(async () => [...host.querySelectorAll('button')].find(button => button.textContent === 'First sentence.')!.click())
    expect(onCorrectionSelect).toHaveBeenCalledExactlyOnceWith('correction-0')
    expect(host.querySelector('button[data-active="true"]')?.textContent).toBe('Second sentence.')
    layout.mobile = true
    await render('correction-0')
    expect(host.querySelector('dialog')?.open).toBe(true)
    expect(host.querySelector('dialog')?.textContent).toContain('Replacement 0')
    expect(document.activeElement?.closest('dialog')).toBe(host.querySelector('dialog'))
  } finally { await act(async () => root.unmount()); host.remove(); layout.mobile = false; vi.unstubAllGlobals() }
})

it('opens and dismisses feedback after changing from desktop to mobile and back', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const props = reviewProps();
  const render = async () => act(async () => root.render(<WritingAttemptReview {...props} />));
  const drawer = () => host.querySelector('dialog')!;
  const click = async (label: string) => act(async () => host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!.click());

  try {
    await render();
    expect(host.querySelector('dialog')).toBeNull();
    layout.mobile = true;
    await render();
    expect(drawer().open).toBe(true);

    await act(async () => drawer().dispatchEvent(new Event('cancel')));
    expect(drawer().open).toBe(false);
    await click('Open agent feedback');
    expect(drawer().open).toBe(true);
    await click('Close writing review corrections');
    expect(drawer().open).toBe(false);

    layout.mobile = false;
    await render();
    layout.mobile = true;
    await render();
    expect(drawer().open).toBe(false);
    await click('Open agent feedback');
    expect(drawer().open).toBe(true);
  } finally {
    await act(async () => root.unmount());
    host.remove();
    layout.mobile = false;
    vi.unstubAllGlobals();
  }
});
