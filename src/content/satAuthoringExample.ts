import { parseAssessmentPackage } from '@/domain/assessment'
import { readingWritingExample } from './satExample/readingWriting'
import { mathExample } from './satExample/math'

// Original authoring content, separate from both playable SAT sets.
export const satAuthoringExample = parseAssessmentPackage({
  schemaVersion: 4, packageId: 'example-sat-full-practice', revision: 1,
  title: 'SAT-style full practice example', source: 'built-in',
  description: '98 original questions in four timed modules. Fixed practice sequence; no automatic inter-section break.',
  metadata: { subject: 'College readiness', difficulty: 'mixed', locale: 'en-US', shortLabel: 'SAT',
    disclaimer: 'Independent SAT-style practice. Accuracy is not an official or predicted SAT score. Not affiliated with College Board.' },
  presentation: { accent: 'red', density: 'comfortable' }, review: { mode: 'answers' },
  resources: [{ id: 'math-reference', type: 'document', title: 'Math reference', content: [
    { type: 'math', expression: 'Circle: A = πr², C = 2πr\nTriangle: A = bh/2\nRight triangle: a² + b² = c²\nRectangular prism: V = lwh\nCylinder: V = πr²h\nSphere: V = 4πr³/3\nCone: V = πr²h/3\nPyramid: V = Bh/3' },
    { type: 'math', expression: '30°-60°-90° sides: x, x√3, 2x\n45°-45°-90° sides: x, x, x√2\nFull circle: 360° = 2π radians\nTriangle angles sum to 180°' },
  ] }],
  parts: [
    ...([0, 1] as const).map(module => ({ id: `rw-${module + 1}`, groupTitle: 'Reading and Writing', title: `Module ${module + 1}`,
      description: 'Choose the best answer for each passage or passage pair. You may revisit questions in this module until you finish it.',
      durationSeconds: 1920, navigation: 'free', defaultLayout: 'split', tools: [{ type: 'mark_for_review' }, { type: 'option_eliminator' }], items: readingWritingExample(module) })),
    ...([0, 1] as const).map(module => ({ id: `math-${module + 1}`, groupTitle: 'Math', title: `Module ${module + 1}`,
      description: 'Choose one answer or enter a number as directed. A calculator and math reference are available throughout this module.',
      durationSeconds: 2100, navigation: 'free', defaultLayout: 'single', tools: [{ type: 'mark_for_review' }, { type: 'option_eliminator' }, { type: 'calculator' }, { type: 'reference_document', resourceId: 'math-reference' }], items: mathExample(module) })),
  ],
})
