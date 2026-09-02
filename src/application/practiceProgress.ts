import { getObjectiveBlockQuestionIds } from '@/domain/objectiveContent'
import { hasAssessmentResponse } from '@/domain/assessmentScoring'
import { countWords } from '@/shared/text'
import type { PracticeWorkspace } from './practiceNavigation'
import type { SpeakingProgress } from './speakingInterviewController'

// Counts and navigation only. Never spread a draft, question or response here.
export function getPracticeProgress({ native, assessment, content, assessments }: PracticeWorkspace, speaking?: SpeakingProgress) {
  if (assessment.view === 'assessment') {
    const definition = assessments.find(p => p.packageId === assessment.packageId)
    const part = definition?.parts.find(p => p.id === assessment.partId)
    if (!definition || !part) return null
    const items = definition.parts.flatMap(p => p.items)
    return { kind: 'assessment', partId: part.id, partIndex: definition.parts.indexOf(part) + 1,
      totalParts: definition.parts.length, itemId: assessment.itemId,
      itemIndex: part.items.findIndex(item => item.id === assessment.itemId) + 1,
      totalItems: items.length, answeredCount: items.filter(item => hasAssessmentResponse(assessment.responses[item.id])).length,
      partItemCount: part.items.length, partAnsweredCount: part.items.filter(item => hasAssessmentResponse(assessment.responses[item.id])).length,
      secondsRemaining: assessment.secondsRemaining, timerScope: 'part' }
  }
  if (assessment.view !== 'home' || native.view !== 'exam' || !native.currentSection) return null
  const section = native.currentSection
  if (section === 'speaking') return speaking ? { kind: section, ...speaking } : null
  const common = { kind: section, part: native.partBySection[section], secondsRemaining: native.secondsRemaining[section], timerScope: 'section' }
  if (section === 'writing') return { ...common, totalParts: 2, totalItems: 2,
    answeredCount: [1, 2].filter(id => Boolean(native.writingDrafts[id as 1 | 2].trim())).length,
    wordCounts: { 1: countWords(native.writingDrafts[1]), 2: countWords(native.writingDrafts[2]) } }
  const document = content[section]
  const ids = document.parts.flatMap(p => p.blocks.flatMap(getObjectiveBlockQuestionIds))
  const questionIds = document.parts.find(p => p.id === common.part)?.blocks.flatMap(getObjectiveBlockQuestionIds) ?? []
  return { ...common, totalParts: document.parts.length, questionIds, totalItems: ids.length,
    answeredCount: ids.filter(id => Boolean(native.answers[section][id]?.trim())).length,
    partAnsweredCount: questionIds.filter(id => Boolean(native.answers[section][id]?.trim())).length }
}
