import { describe, expect, it } from 'vitest'
import { listeningDocument, readingDocument } from './objective'
import { satPracticeAssessment } from './sat'
import { getIeltsExample } from './ieltsExamples'
import { getAssessmentAuthoringKit } from './assessmentExamples'
import { parsePracticeContentDocument } from '@/domain/contentDocument'

describe('authoring examples are separate from playable built-ins', () => {
  it.each(['reading', 'listening'] as const)('%s does not reuse built-in question content or passages', section => {
    const example = parsePracticeContentDocument(getIeltsExample(section))
    if (example.section === 'writing') throw new Error('Expected objective example')
    const builtIn = section === 'reading' ? readingDocument : listeningDocument
    const exampleText = JSON.stringify(example)
    for (const part of builtIn.parts) for (const block of part.blocks) {
      if (block.type === 'passage') for (const paragraph of block.paragraphs) expect(exampleText).not.toContain(paragraph)
      if (block.type === 'completion_questions') for (const item of block.items) expect(exampleText).not.toContain(JSON.stringify(item))
      if ('questions' in block) for (const question of block.questions) expect(exampleText).not.toContain(JSON.stringify(question))
    }
    expect(example.parts).not.toEqual(builtIn.parts)
  })
  it('Reading example answers occur in their own passage, not just in a copied answer key', () => {
    const example = getIeltsExample('reading')
    if (example.section !== 'reading') throw new Error('Expected Reading example')
    for (const part of example.parts) {
      const passage = part.blocks.flatMap(block => block.type === 'passage' ? block.paragraphs : []).join(' ').toLowerCase()
      for (const block of part.blocks) if (block.type === 'completion_questions') for (const item of block.items) {
        for (const answer of [item.answer].flat()) expect(passage).toContain(answer.toLowerCase())
      }
    }
  })
  it('SAT authoring does not return the playable SAT package or any of its items', () => {
    const kit = getAssessmentAuthoringKit('sat-style')
    expect(kit.examplePackage.packageId).not.toBe(satPracticeAssessment.packageId)
    for (const part of satPracticeAssessment.parts) for (const item of part.items) {
      // Ignore IDs: renaming a question must not disguise copied content.
      const signature = ({ stimulus, prompt, interaction }: typeof item) => JSON.stringify({ stimulus, prompt, interaction })
      expect(kit.examplePackage.parts.flatMap(part => part.items).map(signature)).not.toContain(signature(item))
    }
  })
})
