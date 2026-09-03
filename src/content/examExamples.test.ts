import { describe, expect, it } from 'vitest'
import { getIeltsExample } from './ieltsExamples'
import { getAssessmentAuthoringKit } from './assessmentExamples'
import { parsePracticeContentDocument } from '@/domain/contentDocument'
import { getObjectiveBlockQuestionIds } from '@/domain/objectiveContent'
import { parseAssessmentAuthoringPackage } from '@/domain/assessment'
import { satFullLengthAssessment } from './satFullLength'
import { countWords } from '@/shared/text'

describe('complete exam-style authoring examples', () => {
  it('provides 40 ordered Listening slots, varied questions and a full speaker-separated script', () => {
    const document = parsePracticeContentDocument(getIeltsExample('listening'))
    if (document.section !== 'listening' || document.audio.type !== 'kokoro') throw new Error('Expected generated Listening')
    expect(document.parts.map(part => part.blocks.flatMap(getObjectiveBlockQuestionIds).length)).toEqual([10, 10, 10, 10])
    expect(document.parts.flatMap(part => part.blocks.flatMap(getObjectiveBlockQuestionIds))).toEqual(Array.from({ length: 40 }, (_, i) => i + 1))
    const types = document.parts.flatMap(part => part.blocks.map(block => block.type))
    expect(types).toEqual(expect.arrayContaining(['completion_questions', 'mcq_questions', 'feature_matching_questions', 'multiple_selection_question']))
    const turns = document.audio.parts.map(part => part.segments.flatMap(segment => segment.type === 'speech' ? [segment] : []))
    expect(turns.map(part => new Set(part.map(turn => turn.speakerId)).size)).toEqual([2, 1, 3, 1])
    for (const part of turns) expect(countWords(part.map(turn => turn.text).join(' '))).toBeGreaterThanOrEqual(600)
    const words = countWords(turns.flat().map(turn => turn.text).join(' '))
    expect(words).toBeGreaterThanOrEqual(3000)
    expect(words).toBeLessThanOrEqual(4000)
  })
  it('provides three sustained Academic Reading passages, 40 slots and varied response formats', () => {
    const document = parsePracticeContentDocument(getIeltsExample('reading'))
    if (document.section !== 'reading') throw new Error('Expected Reading')
    expect(document.parts.map(part => part.blocks.flatMap(getObjectiveBlockQuestionIds).length)).toEqual([13, 13, 14])
    const words = countWords(document.parts.flatMap(part => part.blocks.flatMap(block => block.type === 'passage' ? block.paragraphs : [])).join(' '))
    expect(words).toBeGreaterThanOrEqual(2150)
    expect(words).toBeLessThanOrEqual(2750)
    expect(document.parts.flatMap(part => part.blocks.map(block => block.type))).toEqual(expect.arrayContaining(['completion_questions', 'heading_matching_questions', 'true_false_not_given_questions', 'yes_no_not_given_questions', 'mcq_questions']))
  })
  it.each([
    ['sat-style', [27, 27, 22, 22], [1920, 1920, 2100, 2100]],
    ['gre-style', [1, 12, 12, 15, 15], [1800, 1080, 1260, 1380, 1560]],
  ] as const)('%s has the current full structure, timings and unique item IDs', (template, counts, times) => {
    const document = parseAssessmentAuthoringPackage(getAssessmentAuthoringKit(template).examplePackage)
    expect(document.parts.map(part => part.items.length)).toEqual(counts)
    expect(document.parts.map(part => part.durationSeconds)).toEqual(times)
    const items = document.parts.flatMap(part => part.items)
    expect(new Set(items.map(item => item.id)).size).toBe(items.length)
    expect(new Set(items.map(item => JSON.stringify([item.stimulus, item.prompt, item.interaction]))).size).toBe(items.length)
  })
  it('keeps SAT authoring keys separate from the full playable SAT test', () => {
    const example = getAssessmentAuthoringKit('sat-style').examplePackage
    const signatures = example.parts.flatMap(part => part.items).map(item => JSON.stringify([item.stimulus, item.prompt, item.interaction]))
    for (const part of satFullLengthAssessment.parts) for (const item of part.items) expect(signatures).not.toContain(JSON.stringify([item.stimulus, item.prompt, item.interaction]))
  })
  it('models GRE option counts, multi-blank scoring, data interpretation and calculator scope', () => {
    const document = getAssessmentAuthoringKit('gre-style').examplePackage
    for (const part of document.parts.filter(part => part.groupTitle === 'Verbal Reasoning')) {
      expect(part.tools.some(tool => tool.type === 'calculator')).toBe(false)
      for (const item of part.items) {
        if (item.interaction.type === 'grouped_choice') for (const group of item.interaction.groups) {
          expect(group.options.length).toBe(item.interaction.groups.length === 1 ? 5 : 3)
          expect(item.scoring.type).toBe('mapping')
        }
        if (item.skill === 'Sentence equivalence' && item.interaction.type === 'multiple_choice') {
          expect(item.interaction.options).toHaveLength(6)
          expect(item.interaction.minimumSelections).toBe(2)
          expect(item.interaction.maximumSelections).toBe(2)
        }
      }
    }
    const quant = document.parts.filter(part => part.groupTitle === 'Quantitative Reasoning')
    for (const part of quant) {
      expect(part.tools).toContainEqual({ type: 'calculator' })
      expect(part.tools.some(tool => tool.type === 'reference_document')).toBe(false)
    }
    expect(quant.flatMap(part => part.items.flatMap(item => item.stimulus)).some(block => block.type === 'table')).toBe(true)
    const essay = document.parts[0]!.items[0]!
    expect(essay.interaction).toMatchObject({ type: 'extended_text' })
    expect(essay.interaction).not.toHaveProperty('minimumWords')
    expect(essay.interaction).not.toHaveProperty('maximumWords')
  })
})
