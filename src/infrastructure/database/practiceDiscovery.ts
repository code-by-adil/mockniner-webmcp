import type { SQLocal } from 'sqlocal'
import { parsePracticeContentDocument } from '@/domain/contentDocument'
import { listeningDocument, readingDocument } from '@/content/objective'
import { writingDocument } from '@/content/writing'
import { defaultSpeakingPlan } from '@/domain/speakingPlan'
import { getResumablePractices, getPracticeStartability, type PracticeWorkspace } from '@/application/practiceNavigation'
import { getObjectiveBlockQuestionIds } from '@/domain/objectiveContent'
import { getAssessmentItemCount, getAssessmentDurationSeconds } from '@/domain/assessmentScoring'
import { SECTION_META } from '@/domain/sections'

export type DiscoveryPage = { kind?: 'listening' | 'reading' | 'writing' | 'speaking' | 'assessment'; limit: number; offset: number }
const page = <T>(items: T[], input: DiscoveryPage) => ({ items: items.slice(input.offset, input.offset + input.limit), nextOffset: items.length > input.offset + input.limit ? input.offset + input.limit : null })

export async function readPracticeLibrary(database: Pick<SQLocal, 'sql'>, workspace: PracticeWorkspace, input: DiscoveryPage) {
  const rows = await database.sql<{ documentJson: string; contentKey: string; section: string }>`SELECT document_json AS documentJson, content_key AS contentKey, section FROM content_documents ORDER BY installed_at DESC, content_key`
  const unavailableContentKeys: string[] = []
  const saved = rows.flatMap(row => {
    try {
      const document = parsePracticeContentDocument(JSON.parse(row.documentJson))
      if (document.contentKey !== row.contentKey || document.section !== row.section) throw new Error('Stored content identity mismatch')
      return [document]
    } catch { unavailableContentKeys.push(row.contentKey); return [] }
  })
  const documents = new Map([listeningDocument, readingDocument, writingDocument, ...saved, ...Object.values(workspace.content)]
    .map(document => [document.contentKey, document]))
  const items = [
    ...[...documents.values()].map(document => ({ kind: document.section, contentKey: document.contentKey, title: document.name,
      durationSeconds: SECTION_META[document.section].durationSeconds, durationKind: 'time_limit',
      itemCount: document.section === 'writing' ? document.tasks.length : document.parts.flatMap(p => p.blocks.flatMap(getObjectiveBlockQuestionIds)).length,
      partCount: document.section === 'writing' ? 2 : document.parts.length,
      subject: 'English', difficulty: null,
      startability: getPracticeStartability(workspace, document.section, document.contentKey),
      active: workspace.content[document.section].contentKey === document.contentKey })),
    { kind: 'speaking', title: defaultSpeakingPlan.title, active: true, durationSeconds: SECTION_META.speaking.durationSeconds,
      durationKind: 'estimate', itemCount: defaultSpeakingPlan.questions.length, partCount: 3, subject: 'English', difficulty: null,
      startability: getPracticeStartability(workspace, 'speaking') },
    ...workspace.assessments.map(assessment => ({ kind: 'assessment', packageId: assessment.packageId, revision: assessment.revision,
      title: assessment.title, source: assessment.source, itemCount: getAssessmentItemCount(assessment), partCount: assessment.parts.length,
      durationSeconds: assessment.parts.every(part => part.durationSeconds !== undefined) ? getAssessmentDurationSeconds(assessment) : null,
      durationKind: assessment.parts.every(part => part.durationSeconds !== undefined) ? 'time_limit' : 'untimed_or_partial',
      subject: assessment.metadata.subject ?? null, difficulty: assessment.metadata.difficulty ?? null,
      startability: getPracticeStartability(workspace, 'assessment') })),
  ].filter(item => !input.kind || item.kind === input.kind)
  return { ...page(items, input), unavailableContentKeys, resumable: getResumablePractices(workspace), listeningAudio: workspace.listeningAudio,
    fullIelts: { kind: 'full_ielts', title: 'Full IELTS Simulation',
      durationSeconds: Object.values(SECTION_META).reduce((sum, section) => sum + section.durationSeconds, 0), durationKind: 'estimate',
      startability: getPracticeStartability(workspace, 'full_ielts') } }
}

export { readHistoryPage as readPracticeHistory } from './historyRepository'
