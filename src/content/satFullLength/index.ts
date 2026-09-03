import { parseAssessmentPackage } from '@/domain/assessment';
import { readingWriting1 } from './readingWriting1';
import { readingWriting2 } from './readingWriting2';
import { math1 } from './math1';
import { math2 } from './math2';

export const satFullLengthAssessment = parseAssessmentPackage({
  schemaVersion: 3, packageId: 'local-sat-full-length-1', revision: 1,
  title: 'SAT-Style Practice Test 1', source: 'built-in',
  description: '98 original questions across four timed modules. Reading and Writing: 54 questions in 64 minutes. Math: 44 questions in 70 minutes. This is fixed-form practice, with raw-score review.',
  metadata: { subject: 'College readiness', difficulty: 'mixed', locale: 'en-US', shortLabel: 'SAT · Full length',
    disclaimer: 'Original, independent SAT-style practice. This fixed-form set does not use adaptive routing or predict an official SAT score. SAT is a registered trademark of College Board, which is not affiliated with or endorsing this application.' },
  presentation: { accent: 'red', density: 'comfortable' }, review: { mode: 'answers' }, rubrics: [],
  resources: [{ id: 'sat-math-reference', type: 'document', title: 'Math reference', content: [
    { type: 'text', variant: 'subtitle', text: 'Circles and angles' }, { type: 'math', expression: 'A = πr²     C = 2πr\nA full circle measures 360° or 2π radians.' },
    { type: 'text', variant: 'subtitle', text: 'Triangles' }, { type: 'math', expression: 'A = ½bh\na² + b² = c² for a right triangle with hypotenuse c.' },
    { type: 'text', variant: 'subtitle', text: 'Solids' }, { type: 'math', expression: 'Rectangular prism: V = lwh\nCylinder: V = πr²h\nSphere: V = (4/3)πr³\nCone: V = (1/3)πr²h\nPyramid: V = (1/3)Bh' },
    { type: 'text', text: 'Use the information in each question. Figures and values in tables are supplied for that question only.' },
  ] }],
  parts: [
    ...[readingWriting1, readingWriting2].map((items, index) => ({ id: `sat-rw-module-${index + 1}`, groupTitle: 'Reading and Writing', title: `Module ${index + 1}`, durationSeconds: 32 * 60,
      description: 'Choose the best answer to each question. Each passage or passage pair is followed by one question. You may revisit any question within this module before finishing it.',
      navigation: 'free', defaultLayout: 'split', tools: [{ type: 'mark_for_review' }, { type: 'option_eliminator' }], items })),
    ...[math1, math2].map((items, index) => ({ id: `sat-math-module-${index + 1}`, groupTitle: 'Math', title: `Module ${index + 1}`, durationSeconds: 35 * 60,
      description: 'For multiple-choice questions, choose the best answer. For numeric-entry questions, enter a number or fraction. A calculator and math reference are available. You may revisit any question within this module before finishing it.',
      navigation: 'free', defaultLayout: 'single', tools: [{ type: 'mark_for_review' }, { type: 'option_eliminator' }, { type: 'calculator' }, { type: 'reference_document', resourceId: 'sat-math-reference' }], items })),
  ],
});
