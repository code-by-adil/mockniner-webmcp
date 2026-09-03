// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { writingDocument } from '@/content/writing';
import { WritingReviewView } from './WritingReviewView';

const layout = vi.hoisted(() => ({ mobile: false }));
vi.mock('@/hooks/useExamLayout', () => ({ useIsMobile: () => layout.mobile }));

it('focuses a requested correction and opens its feedback on desktop and mobile', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host)
  const onCorrectionSelect = vi.fn()
  const annotations = ['First sentence.', 'Second sentence.'].map((originalText, index) => ({ id: `correction-${index}`, taskNumber: 1 as const, originalText, startOffset: index ? 16 : 0, endOffset: (index ? 16 : 0) + originalText.length, suggestion: `Replacement ${index}`, explanation: `Explanation ${index}`, type: 'coherence' as const }))
  const render = async (selectedCorrectionId: string) => act(async () => root.render(<WritingReviewView submittedTask={{ task: writingDocument.tasks[0], response: 'First sentence. Second sentence.', wordCount: 4 }} scoreData={{ band: 6, taskAchievement: 6, coherenceCohesion: 6, lexicalResource: 6, grammaticalRange: 6, feedback: 'Develop both points.', annotations }} selectedCorrectionId={selectedCorrectionId} onCorrectionSelect={onCorrectionSelect} focusRequest={{ selectedCorrectionId }} onClose={vi.fn()} />))
  try {
    await render('correction-1')
    expect(host.querySelector('button[data-active="true"]')?.textContent).toBe('Second sentence.')
    expect(document.activeElement?.textContent).toBe('Second sentence.')
    expect(host.textContent).toContain('Replacement 1')
    layout.mobile = true
    await render('correction-0')
    expect(host.querySelector('dialog')?.open).toBe(true)
    expect(host.querySelector('dialog')?.textContent).toContain('Replacement 0')
  } finally { await act(async () => root.unmount()); host.remove(); layout.mobile = false; vi.unstubAllGlobals() }
})

it('opens and dismisses feedback after changing from desktop to mobile and back', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const props = {
    submittedTask: { task: writingDocument.tasks[0], response: 'Saved response.', wordCount: 2 },
    scoreData: { band: 5, taskAchievement: 5, coherenceCohesion: 5, lexicalResource: 5, grammaticalRange: 5, feedback: 'Develop the comparison.', annotations: [] },
    evaluationSummary: 'Agent evaluation of the saved responses.', overallBand: 5,
    onClose: () => undefined,
  };
  const render = async () => act(async () => root.render(<WritingReviewView {...props} />));
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
