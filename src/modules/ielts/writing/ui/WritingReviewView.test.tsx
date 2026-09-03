// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { writingDocument } from '@/content/writing';
import { WritingReviewView } from './WritingReviewView';

const layout = vi.hoisted(() => ({ mobile: false }));
vi.mock('@/hooks/useExamLayout', () => ({ useIsMobile: () => layout.mobile }));

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
