// @vitest-environment happy-dom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readingDocument } from '@/content/objective';
import { gradeObjectiveDocument } from '@/domain/objectiveScoring';
import type { AnswerMap, ObjectiveSubmission } from '@/domain/types';
import { ReadingAttemptReview } from './ReadingAttemptReview';

function submittedAnswers(withMistakes = true): ObjectiveSubmission {
  const answers: AnswerMap = {};
  for (const part of readingDocument.parts) for (const block of part.blocks) {
    if (block.type === 'multiple_selection_question') {
      block.questionIds.forEach((id, index) => { answers[id] = block.answers[index]!; });
    } else {
      const questions = block.type === 'completion_questions' ? block.items : 'questions' in block ? block.questions : [];
      questions.forEach(question => { answers[question.questionId] = Array.isArray(question.answer) ? question.answer[0]! : question.answer; });
    }
  }
  if (withMistakes) {
    answers[2] = 'TRUE';
    delete answers[14];
    answers[28] = 'incorrect';
  }
  return { attemptId: 'reading-review', contentKey: readingDocument.contentKey, section: 'reading', answers,
    result: gradeObjectiveDocument(readingDocument, answers), startedAt: '2026-09-03T10:00:00Z', submittedAt: '2026-09-03T11:00:00Z' };
}

describe('saved Reading review', () => {
  let container: HTMLDivElement;
  let root: Root;
  const onExit = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    onExit.mockClear();
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  async function render(submission = submittedAnswers(), backLabel = 'Back to practice') {
    function Review() {
      const [part, setPart] = useState(1);
      return <ReadingAttemptReview document={readingDocument} submission={submission} currentPart={part} onPartChange={setPart} onExit={onExit} backLabel={backLabel} />;
    }
    await act(async () => root.render(<Review />));
  }

  async function click(label: string) {
    const button = [...container.querySelectorAll('button')].find(button => button.getAttribute('aria-label') === label || button.textContent === label)!;
    expect(button, label).toBeDefined();
    await act(async () => button.click());
  }

  it('shows the saved score and read-only answers without live exam controls', async () => {
    const submission = submittedAnswers();
    await render(submission);
    expect(container.textContent).toContain('37/40 correct');
    expect(container.textContent).toContain('Estimated band 8.5');
    expect(container.textContent).toContain('2 incorrect · 1 unanswered');
    expect(container.textContent).toContain('Small forests, fast change');
    expect(container.textContent).not.toMatch(/Time Left|60:00|Exit Test|Submit/);
    expect(container.querySelectorAll('input:not(:disabled), textarea:not(:disabled), select:not(:disabled)')).toHaveLength(0);
    expect(container.querySelector('[aria-label="Question 1, correct"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="Question 2, incorrect"]')).not.toBeNull();
  });

  it('skips correct answers, changes passages and focuses each selected mistake', async () => {
    const submission = submittedAnswers();
    const original = JSON.stringify(submission);
    await render(submission);
    for (const [question, part, label] of [[2, 1, 'Incorrect'], [14, 2, 'Unanswered'], [28, 3, 'Incorrect'], [2, 1, 'Incorrect']] as const) {
      await click('Next mistake');
      expect(container.querySelector('[role="status"]')?.textContent).toBe(`Question ${question} · ${label}`);
      expect(container.querySelector('[aria-label="Reading passages"] [aria-current="page"]')?.textContent).toBe(`Passage ${part}`);
      expect(document.activeElement?.id).toBe(`question-${question}`);
    }
    await click('Previous mistake');
    expect(container.querySelector('[role="status"]')?.textContent).toBe('Question 28 · Incorrect');
    expect(JSON.stringify(submission)).toBe(original);
  });

  it('navigates directly to any question and starts mistake navigation in the selected passage', async () => {
    await render();
    await click('Passage 2');
    await click('Question 15, correct');
    expect(container.querySelector('[role="status"]')?.textContent).toBe('Question 15 · Correct');
    await click('Previous mistake');
    expect(container.querySelector('[role="status"]')?.textContent).toBe('Question 14 · Unanswered');
    await click('Passage 3');
    await click('Next mistake');
    expect(container.querySelector('[role="status"]')?.textContent).toBe('Question 28 · Incorrect');
  });

  it('disables mistake navigation for a perfect result', async () => {
    await render(submittedAnswers(false));
    expect(container.textContent).toContain('All answers correct.');
    const buttons = [...container.querySelectorAll('button')].filter(button => button.textContent?.includes('mistake'));
    expect(buttons).toHaveLength(2);
    expect(buttons.every(button => button.disabled)).toBe(true);
  });

  it.each(['Back to practice', 'Back to results'])('uses the actual return destination: %s', async label => {
    await render(submittedAnswers(), label);
    await click(label);
    expect(onExit).toHaveBeenCalledOnce();
  });
});
