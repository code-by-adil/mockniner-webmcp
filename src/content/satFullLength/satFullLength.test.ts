import { describe, expect, it } from 'vitest';
import { gradeAssessment, parseAssessmentPackage } from '@/domain/assessment';
import { satFullLengthAssessment as assessment } from './index';
import { mergeAssessmentPackages } from '@/application/assessmentCommands';

const items = assessment.parts.flatMap(part => part.items);
describe('full-length original SAT-style set', () => {
  it('validates all 98 unique questions with the standard module lengths and timings', () => {
    expect(() => parseAssessmentPackage(assessment)).not.toThrow();
    expect(assessment.parts.map(part => part.items.length)).toEqual([27, 27, 22, 22]);
    expect(assessment.parts.map(part => part.durationSeconds)).toEqual([1920, 1920, 2100, 2100]);
    expect(new Set(items.map(item => item.id)).size).toBe(98);
    const text = items.map(item => JSON.stringify([item.stimulus, item.prompt]));
    expect(new Set(text).size).toBe(98);
    expect(items.filter(item => item.interaction.type === 'numeric_entry')).toHaveLength(11);
    expect(items.filter(item => item.interaction.type === 'single_choice')).toHaveLength(87);
  });
  it('covers all four domains in every module and supplies substantive original reading passages', () => {
    for (const part of assessment.parts) expect(new Set(part.items.map(item => item.domain)).size).toBe(4);
    for (const item of assessment.parts.slice(0, 2).flatMap(part => part.items)) {
      const passage = item.stimulus.flatMap(block => block.type === 'passage' ? block.paragraphs : []).join(' ');
      const words = passage.trim().split(/\s+/).length;
      expect(words, item.id).toBeGreaterThanOrEqual(25);
      expect(words, item.id).toBeLessThanOrEqual(150);
      expect(item.interaction.type).toBe('single_choice');
      if (item.interaction.type === 'single_choice') expect(item.interaction.options).toHaveLength(4);
    }
  });
  it('checks every math key against separately solved answers', () => {
    const solutions: (string | number)[][] = [
      ['9', '3', 67, '8', '15', 'The initial volume of water in the tank', 12, 3, '3 and 4', '50%', 'x − 3', '7', 4, '122.88', 12, '3.8', '$66', 0.7, '21 to 27 minutes', '10', '72π', '9π'],
      ['5', 4, 'Each additional minute of use adds $0.18 to the charge.', 'x > 6', '21', '9', '−1', '150', '7', '(x + 4)/(x + 2)', 9, 'f(x) = 81(1/3)ˣ', '9', 12, 'f(x) = 2(x + 2)(x − 5)', '75', '8', 0.6, 'Students were randomly assigned to the two groups.', '150', 5, '15/17'],
    ];
    assessment.parts.slice(2).forEach((part, moduleIndex) => part.items.forEach((item, index) => {
      const expected = solutions[moduleIndex][index];
      const scoring = item.scoring;
      if (scoring.type === 'numeric') expect(scoring.answer, item.id).toBe(expected);
      else if (scoring.type === 'exact' && item.interaction.type === 'single_choice') expect(item.interaction.options.find(option => option.id === scoring.answer)?.label, item.id).toBe(expected);
      else throw new Error(`Unexpected math question type: ${item.id}`);
    }));
  });
  it('grades the entire set and includes it first in the built-in library', () => {
    const responses = Object.fromEntries(items.map(item => [item.id, item.scoring.type === 'exact' ? item.scoring.answer : item.scoring.type === 'numeric' ? String(item.scoring.answer) : '']));
    const result = gradeAssessment(assessment, responses);
    expect(result).toMatchObject({ rawScore: 98, maximumScore: 98, totalItems: 98, answeredCount: 98 });
    expect(gradeAssessment(assessment, {}).answeredCount).toBe(0);
    expect(mergeAssessmentPackages([])[0]).toEqual(assessment);
    expect(mergeAssessmentPackages([{ ...assessment, source: 'agent', title: 'Invalid built-in replacement' }])[0].title).toBe(assessment.title);
  });
});
