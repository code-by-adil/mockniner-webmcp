import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { satPracticeAssessment } from '@/content/sat';
import type { AssessmentItem } from '@/domain/assessment';
import { AssessmentReviewAnswer } from './AssessmentReviewAnswer';

const base = satPracticeAssessment.parts[0].items[0];
describe('review answer types', () => {
  it('marks both selected and missed correct options for multiple selection', () => {
    const item: AssessmentItem = { ...base, interaction: { type: 'multiple_choice', options: [{ id: 'a', label: 'Apple' }, { id: 'b', label: 'Banana' }, { id: 'c', label: 'Carrot' }] }, scoring: { type: 'set', answers: ['a', 'b'] } };
    const html = renderToStaticMarkup(<AssessmentReviewAnswer item={item} response={['a', 'c']} showAnswers correct={false} />);
    expect(html).toContain('Your answer · Correct');
    expect(html).toContain('Correct answer');
    expect(html).toContain('Carrot');
    expect(html.match(/Your answer/g)).toHaveLength(2);
  });
  it('resolves reused option IDs within each grouped-choice group', () => {
    const item: AssessmentItem = { ...base, interaction: { type: 'grouped_choice', groups: [
      { id: 'first', label: 'First blank', options: [{ id: 'a', label: 'Careful' }, { id: 'b', label: 'Hasty' }] },
      { id: 'second', label: 'Second blank', options: [{ id: 'a', label: 'Supported' }, { id: 'b', label: 'Unfounded' }] },
    ] }, scoring: { type: 'mapping', answers: { first: 'a', second: 'b' } } };
    const html = renderToStaticMarkup(<AssessmentReviewAnswer item={item} response={{ first: 'a', second: 'a' }} showAnswers correct={false} />);
    expect(html).toContain('First blank'); expect(html).toContain('Second blank');
    expect(html.match(/Your answer · Correct/g)).toHaveLength(1);
    expect(html.match(/Correct answer/g)).toHaveLength(1);
  });
  it('shows matching prompts, selected choices, and omitted mappings', () => {
    const item: AssessmentItem = { ...base, interaction: { type: 'matching', prompts: [{ id: 'one', label: 'First city' }, { id: 'two', label: 'Second city' }], options: [{ id: 'a', label: 'Dhaka' }, { id: 'b', label: 'London' }] }, scoring: { type: 'mapping', answers: { one: 'a', two: 'b' } } };
    const html = renderToStaticMarkup(<AssessmentReviewAnswer item={item} response={{ one: 'b' }} showAnswers correct={false} />);
    expect(html).toContain('First city'); expect(html).toContain('Second city');
    expect(html.match(/Correct answer/g)).toHaveLength(2);
    expect(html.match(/Your answer/g)).toHaveLength(1);
  });
  it('shows accepted text aliases and hides them under responses-only policy', () => {
    const item: AssessmentItem = { ...base, interaction: { type: 'text_entry' }, scoring: { type: 'aliases', answers: ['twelve', '12'] } };
    expect(renderToStaticMarkup(<AssessmentReviewAnswer item={item} response="13" showAnswers correct={false} />)).toContain('twelve / 12');
    const restricted = renderToStaticMarkup(<AssessmentReviewAnswer item={item} response="13" showAnswers={false} correct={false} />);
    expect(restricted).not.toContain('twelve'); expect(restricted).not.toContain('Correct answer');
  });
});
