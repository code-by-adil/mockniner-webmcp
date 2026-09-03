import { parseAssessmentPackage } from '@/domain/assessment'
import { verbalExample } from './greExample/verbal'
import { quantitativeExample } from './greExample/quantitative'

export const greStyleAssessment = parseAssessmentPackage({
  schemaVersion: 4, packageId: 'example-gre-full-practice', revision: 1, source: 'built-in',
  title: 'GRE-style full practice example',
  description: 'One Issue essay, 27 Verbal questions and 27 Quantitative questions in five timed parts.',
  metadata: { subject: 'Graduate admissions practice', difficulty: 'mixed', locale: 'en-US', shortLabel: 'GRE',
    disclaimer: 'Independent GRE-style practice with a fixed sequence. Accuracy and advisory rubric feedback are not ETS scores or percentiles. Not affiliated with ETS.' },
  presentation: { accent: 'violet', density: 'comfortable' }, resources: [], review: { mode: 'answers' },
  rubric: { title: 'Issue essay practice feedback', scale: { minimum: 0, maximum: 6, step: 0.5 },
    criteria: [
      { id: 'reasoning', label: 'Reasoning', description: 'Develop a clear position and examine relevant qualifications and counterarguments.', weight: 0.4 },
      { id: 'development', label: 'Development', description: 'Support the position with relevant, explained reasons and examples.', weight: 0.3 },
      { id: 'communication', label: 'Organization and language', description: 'Organize the argument coherently and communicate it precisely.', weight: 0.3 },
    ], requireEvidence: true, allowAnnotations: true },
  parts: [
    { id: 'issue', groupTitle: 'Analytical Writing', title: 'Analyze an Issue', durationSeconds: 1800, navigation: 'free', defaultLayout: 'single', tools: [],
      items: [{ id: 'gre-issue', domain: 'Analytical Writing', skill: 'Issue analysis', stimulus: [], prompt: [
        { type: 'text', text: 'Public institutions should publish the evidence behind major policy decisions before those decisions take effect.' },
        { type: 'text', text: 'Develop a response explaining how far you agree or disagree. Support your position with reasons and examples, and consider circumstances in which the proposed policy would be helpful or harmful.' },
      ], interaction: { type: 'extended_text' }, scoring: { type: 'agent' } }] },
    ...([0, 1] as const).flatMap(module => [
      { id: `verbal-${module + 1}`, groupTitle: 'Verbal Reasoning', title: `Section ${module + 1}`, durationSeconds: module === 0 ? 1080 : 1380,
        description: 'Follow each question\'s instructions. Complete every blank in Text Completion. Choose exactly two equivalent answers for Sentence Equivalence.',
        navigation: 'free', defaultLayout: 'single', tools: [{ type: 'mark_for_review' }, { type: 'option_eliminator' }], items: verbalExample(module) },
      { id: `quant-${module + 1}`, groupTitle: 'Quantitative Reasoning', title: `Section ${module + 1}`, durationSeconds: module === 0 ? 1260 : 1560,
        description: 'Use the calculator if needed. For multiple-answer questions, select all correct choices. A formula reference is not supplied.',
        navigation: 'free', defaultLayout: 'single', tools: [{ type: 'mark_for_review' }, { type: 'calculator' }], items: quantitativeExample(module) },
    ]),
  ],
})
