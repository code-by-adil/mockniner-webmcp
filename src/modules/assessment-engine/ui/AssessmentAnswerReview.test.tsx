// @vitest-environment happy-dom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getAssessmentAuthoringKit } from '@/content/assessmentExamples';
import { satPracticeAssessment } from '@/content/sat';
import { greStyleAssessment } from '@/content/gre';
import { gradeAssessment, type AssessmentEvaluation, type AssessmentPackage, type AssessmentResponseMap, type AssessmentSubmission } from '@/domain/assessment';
import { AssessmentAnswerReview } from './AssessmentAnswerReview';
import { AssessmentResults } from './AssessmentResults';
import { resolveAssessmentReview, type AssessmentReviewSelection } from '@/domain/assessmentReview';

function submissionFor(assessment: AssessmentPackage, responses: AssessmentResponseMap = {}): AssessmentSubmission {
  return { attemptId: '33333333-3333-4333-8333-333333333333', packageId: assessment.packageId, package: assessment,
    responses, result: gradeAssessment(assessment, responses), startedAt: '2026-09-03T10:00:00.000Z', submittedAt: '2026-09-03T10:05:00.000Z' };
}
function example(template: 'minimal-objective' | 'writing-with-rubric'): AssessmentPackage {
  return { ...getAssessmentAuthoringKit(template).examplePackage, source: 'built-in' };
}

function ReviewHost({ submission, evaluation }: { submission: AssessmentSubmission; evaluation?: AssessmentEvaluation }) {
  const [selection, setSelection] = useState<AssessmentReviewSelection>({ filter: 'all' });
  return <AssessmentAnswerReview submission={submission} evaluation={evaluation} selection={selection}
    onSelectionChange={next => setSelection(resolveAssessmentReview(submission, next))} />;
}

function ResultsHost({ submission }: { submission: AssessmentSubmission }) {
  const [review, setReview] = useState<AssessmentReviewSelection | null>(null);
  return <AssessmentResults submission={submission} onHome={() => undefined} review={review}
    onReviewChange={next => setReview(next ? resolveAssessmentReview(submission, next) : null)} />;
}

describe('focused assessment answer review', () => {
  let container: HTMLDivElement;
  let root: Root;
  let currentSubmission: AssessmentSubmission;
  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    container = document.createElement('div'); document.body.append(container); root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
  const question = () => container.querySelector('article[aria-label^="Question "]')!;
  const filterButton = (label: string) => [...container.querySelectorAll<HTMLButtonElement>('[aria-label="Filter questions"] button')].find(button => button.textContent?.startsWith(label))!;
  const button = (label: string) => [...container.querySelectorAll<HTMLButtonElement>('button')].find(button => (button.getAttribute('aria-label') ?? button.textContent) === label)!;
  async function click(element: HTMLButtonElement) { await act(async () => element.click()); }
  async function select(number: number) {
    const entry = currentSubmission.package.parts.flatMap(part => part.items.map((item, index) => ({ part, item, number: index + 1 })))[number - 1];
    const moduleSelect = container.querySelector<HTMLSelectElement>('select')!;
    if (moduleSelect.value !== entry.part.id) await act(async () => { moduleSelect.value = entry.part.id; moduleSelect.dispatchEvent(new Event('change', { bubbles: true })); });
    await click(container.querySelector<HTMLButtonElement>(`button[aria-label^="Question ${entry.number},"]`)!);
  }
  async function render(submission: AssessmentSubmission, evaluation?: AssessmentEvaluation) { currentSubmission = submission; await act(async () => root.render(<ReviewHost submission={submission} evaluation={evaluation} />)); }

  it('shows one question with its saved material and inline answer choices', async () => {
    await render(submissionFor(satPracticeAssessment, { 'rw-1': 'b', 'math-1': '5' }));
    expect(container.querySelectorAll('article[aria-label^="Question "]')).toHaveLength(1);
    expect(question().textContent).toContain('Researchers studying rooftop gardens');
    expect(question().textContent).toContain('Which choice best states the main idea');
    expect(question().querySelectorAll('[aria-label="Answer choices"] li')).toHaveLength(4);
    expect(question().textContent).toContain('Your answer · Correct');
    expect(question().textContent).toContain('Single-species gardens produce the most consistent harvests.');
    expect(question().querySelector('details')?.textContent).toContain('Short passages testing comprehension');
    await select(7);
    expect(question().textContent).toContain('3x + 7 = 25');
    expect(question().textContent).toContain('Your response5');
    expect(question().textContent).toContain('Correct answer6');
    expect(question().textContent).toContain('Math formulas');
    await select(4);
    expect(question().querySelector('table caption')?.textContent).toContain('Average weekly bicycle trips');
    await select(12);
    expect(question().querySelector('figcaption')?.textContent).toBe('Pages read during one week');
    expect(container.querySelectorAll('input, textarea')).toHaveLength(0);
    expect(container.querySelector('select')?.getAttribute('id')).toBeTruthy();
  });

  it('filters questions without confusing incorrect and unanswered, and preserves the submission', async () => {
    const submission = submissionFor(satPracticeAssessment, { 'rw-1': 'b', 'math-1': '5' });
    const original = JSON.stringify(submission);
    await render(submission);
    expect(filterButton('All').textContent).toBe('All12');
    expect(filterButton('Incorrect').textContent).toBe('Incorrect1');
    expect(filterButton('Unanswered').textContent).toBe('Unanswered10');
    await click(filterButton('Incorrect'));
    expect(filterButton('Incorrect').getAttribute('aria-pressed')).toBe('true');
    expect(question().getAttribute('data-item-id')).toBe('math-1');
    expect(container.querySelector('[role="status"]')?.textContent).toBe('1 of 12 questions');
    expect(button('Next').disabled).toBe(true);
    await click(filterButton('Unanswered'));
    expect(question().getAttribute('aria-label')).toBe('Question 2');
    await click(button('Next'));
    expect(question().getAttribute('aria-label')).toBe('Question 3');
    await click(filterButton('All'));
    expect(question().getAttribute('aria-label')).toBe('Question 1');
    expect(JSON.stringify(submission)).toBe(original);
  });

  it('navigates across parts and exposes selected question and keyboard focus', async () => {
    await render(submissionFor(satPracticeAssessment));
    await select(3); await click(button('Next'));
    expect(question().getAttribute('data-item-id')).toBe('rw-4');
    expect(question().getAttribute('aria-label')).toBe('Question 1');
    expect(container.querySelector('button[aria-label="Question 1, unanswered"]')?.getAttribute('aria-current')).toBe('true');
    expect(document.activeElement).toBe(question().querySelector('h2'));
    await click(button('Previous'));
    expect(question().getAttribute('aria-label')).toBe('Question 3');
  });

  it('follows externally controlled review selection and moves focus to that question', async () => {
    const submission = submissionFor(satPracticeAssessment);
    const onSelectionChange = vi.fn();
    await act(async () => root.render(<AssessmentAnswerReview submission={submission} selection={{ filter: 'all', itemId: 'rw-3' }} onSelectionChange={onSelectionChange} />));
    expect(question().getAttribute('data-item-id')).toBe('rw-3');
    await act(async () => root.render(<AssessmentAnswerReview submission={submission} selection={{ filter: 'all', itemId: 'math-1' }} onSelectionChange={onSelectionChange} />));
    expect(question().getAttribute('data-item-id')).toBe('math-1');
    expect(document.activeElement).toBe(question().querySelector('h2'));
    expect(onSelectionChange).not.toHaveBeenCalled();
  });

  it('exposes each answer status as text and keeps its icon decorative', async () => {
    await render(submissionFor(satPracticeAssessment, { 'rw-1': 'b', 'math-1': '5' }));
    for (const [number, label] of [[1, 'Correct'], [7, 'Incorrect'], [2, 'Unanswered']] as const) {
      await select(number);
      const status = [...question().querySelectorAll('span')].find(element => element.textContent === label);
      expect(status, `Question ${number} must name its answer status`).toBeDefined();
      expect(status!.closest('[aria-hidden="true"], [hidden]')).toBeNull();
      expect(status!.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    }
  });

  it('shows clear empty states', async () => {
    await render(submissionFor(example('minimal-objective'), { 'water-formula': 'b', 'half-of-seven': '3.5' }));
    await click(filterButton('Incorrect'));
    expect(question()).toBeNull(); expect(container.querySelector('[role="status"]')?.textContent).toBe('No incorrect answers.');
    await click(filterButton('Unanswered'));
    expect(container.querySelector('[role="status"]')?.textContent).toBe('No unanswered questions.');
    await click(filterButton('All')); expect(question()).not.toBeNull();
  });

  it('preserves response-only review without keys, correctness or incorrect counts', async () => {
    const assessment = { ...example('minimal-objective'), review: { mode: 'responses' as const } };
    await render(submissionFor(assessment, { 'water-formula': 'a' }));
    expect(question().textContent).toContain('CO2Your answer');
    expect(filterButton('Incorrect')).toBeUndefined();
    expect(container.textContent).not.toContain('Correct answer');
    expect(container.textContent).not.toContain('3.5');
    expect(container.textContent).not.toContain('Incorrect');
    await click(filterButton('Unanswered'));
    expect(question().getAttribute('aria-label')).toBe('Question 2');
    expect(question().textContent).not.toContain('3.5');
  });

  it('does not render item content when review is disabled', async () => {
    await render(submissionFor({ ...satPracticeAssessment, review: { mode: 'none' } })); expect(container.innerHTML).toBe('');
  });

  it('keeps the full original passage visible alongside the selected question', async () => {
    const assessment = structuredClone(satPracticeAssessment);
    const longText = 'This is part of the original saved passage. '.repeat(30);
    assessment.parts[0].items[0].stimulus = [{ type: 'passage', title: 'A longer passage', paragraphs: [longText] }];
    await render(submissionFor(assessment));
    const material = question().querySelector('[aria-label="Question material"]')!;
    expect(material.textContent).toContain(longText);
    expect(material.querySelector('details')).toBeNull();
    expect(question().textContent).toContain('Which choice best states the main idea');
  });

  it('preserves paragraphs and keeps agent-scored responses out of the incorrect filter', async () => {
    const assessment = { ...example('writing-with-rubric'), review: { mode: 'answers' as const } };
    await render(submissionFor(assessment, { [assessment.parts[0].items[0].id]: 'A saved response.\n\nA second paragraph.' }));
    expect(question().textContent).toContain('Response saved');
    expect(question().textContent).toContain('A saved response.\n\nA second paragraph.');
    expect(filterButton('Incorrect').textContent).toBe('Incorrect0');
    expect(question().textContent).toContain('Not yet evaluated');
  });

  it('shows GRE grouped choices within their own blanks without internal IDs', async () => {
    await render(submissionFor(greStyleAssessment, { 'gre-v1-completion-3': { 'blank-1': 'b1-b', 'blank-2': 'b2-a' } }));
    const number = greStyleAssessment.parts.flatMap(part => part.items).findIndex(item => item.id === 'gre-v1-completion-3') + 1;
    await select(number);
    expect(question().querySelector('[aria-label="Blank 1"]')?.textContent).toContain('circumspectYour answer');
    expect(question().querySelector('[aria-label="Blank 2"]')?.textContent).toContain('unequivocalYour answer');
    expect(question().textContent).not.toContain('b1-b');
  });

  it('opens review mistakes directly, returns to overview, and resets for another attempt', async () => {
    const first = submissionFor(satPracticeAssessment, { 'math-1': '5' });
    await act(async () => root.render(<ResultsHost key={first.attemptId} submission={first} />));
    expect(question()).toBeNull(); await click(button('Review mistakes'));
    expect(question().getAttribute('data-item-id')).toBe('math-1');
    await click(button('Back to results')); expect(question()).toBeNull();
    await click(button('Review Math · Module 2')); expect(question().getAttribute('data-item-id')).toBe('math-4');
    const second = { ...submissionFor(example('minimal-objective')), attemptId: '44444444-4444-4444-8444-444444444444' };
    await act(async () => root.render(<ResultsHost key={second.attemptId} submission={second} />));
    expect(question()).toBeNull(); await click(button('Review answers'));
    expect(filterButton('All').getAttribute('aria-pressed')).toBe('true');
    expect(question().getAttribute('aria-label')).toBe('Question 1');
  });
});
