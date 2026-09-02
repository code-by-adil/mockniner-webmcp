import type { SQLocal } from 'sqlocal'
import { z } from 'zod'
import { parsePracticeContentDocument } from '@/domain/contentDocument'
import { listeningDocument, readingDocument } from '@/content/objective'
import { writingDocument } from '@/content/writing'
import { defaultSpeakingPlan } from '@/domain/speakingPlan'
import { getResumablePractices, getPracticeStartability, type PracticeWorkspace } from '@/application/practiceNavigation'
import { getObjectiveBlockQuestionIds } from '@/domain/objectiveContent'
import { getAssessmentItemCount, getAssessmentDurationSeconds } from '@/domain/assessmentScoring'
import { SECTION_META } from '@/domain/sections'
import { parseStoredObjectiveResult, parseStoredSpeakingEvaluation, parseStoredWritingEvaluation } from '@/domain/attemptValidation'
import { assessmentResultSchema } from '@/domain/assessmentScoring'
import { assessmentEvaluationSchema } from '@/domain/assessment'

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

export async function readPracticeHistory(database: Pick<SQLocal, 'sql'>, input: DiscoveryPage) {
  type Row = { attemptId: string; kind: DiscoveryPage['kind']; contentKey: string | null; packageId: string | null; submittedAt: string; definitionJson: string | null; resultJson: string | null; evaluationJson: string | null }
  const rows = await database.sql<Row>`
    SELECT * FROM (
      SELECT a.id AS attemptId, a.section AS kind, a.content_key AS contentKey, NULL AS packageId,
        a.submitted_at AS submittedAt, NULL AS definitionJson, o.result_json AS resultJson,
        COALESCE(w.evaluation_json, s.evaluation_json) AS evaluationJson
      FROM attempts a LEFT JOIN objective_submissions o ON o.attempt_id = a.id
        LEFT JOIN writing_evaluations w ON w.attempt_id = a.id LEFT JOIN speaking_evaluations s ON s.attempt_id = a.id
      UNION ALL
      SELECT a.id, 'assessment', NULL, a.package_id, a.submitted_at, a.package_snapshot_json, a.result_json, e.evaluation_json
      FROM assessment_attempts a LEFT JOIN assessment_evaluations e ON e.attempt_id = a.id
    ) WHERE (${input.kind ?? null} IS NULL OR kind = ${input.kind ?? null})
    ORDER BY submittedAt DESC, kind, attemptId DESC LIMIT ${input.limit + 1} OFFSET ${input.offset}
  `
  const items = rows.slice(0, input.limit).map(row => {
    const objective = row.kind === 'listening' || row.kind === 'reading'
    const common = {
      attemptId: row.attemptId, kind: row.kind, submittedAt: row.submittedAt,
      ...(row.packageId ? { packageId: row.packageId } : { contentKey: row.contentKey }),
      title: row.definitionJson ? z.object({ title: z.string() }).parse(JSON.parse(row.definitionJson)).title : `${SECTION_META[row.kind as keyof typeof SECTION_META].label} Practice`,
    }
    if (objective) {
      const result = parseStoredObjectiveResult(row.resultJson!)
      return { ...common, evaluationStatus: 'not_required', rawScore: result.raw, maximumScore: result.total, band: result.band }
    }
    if (row.kind === 'assessment') {
      const result = assessmentResultSchema.parse(JSON.parse(row.resultJson!))
      const evaluation = row.evaluationJson ? assessmentEvaluationSchema.parse(JSON.parse(row.evaluationJson)) : null
      return { ...common, evaluationStatus: evaluation ? 'evaluated' : result.awaitingEvaluationCount === 0 ? 'not_required' : 'awaiting_evaluation',
        rawScore: result.rawScore, maximumScore: result.maximumScore, domains: result.domains,
        ...(evaluation ? { evaluationScore: evaluation.overallScore } : {}) }
    }
    const evaluation = row.evaluationJson ? (row.kind === 'writing' ? parseStoredWritingEvaluation : parseStoredSpeakingEvaluation)(row.evaluationJson) : null
    const unscored = evaluation && 'status' in evaluation && evaluation.status === 'insufficient_evidence'
    return { ...common, evaluationStatus: unscored ? 'insufficient_evidence' : evaluation ? 'evaluated' : 'awaiting_evaluation',
      ...(evaluation && 'overallBand' in evaluation ? { band: evaluation.overallBand } : {}) }
  })
  return { items, nextOffset: rows.length > input.limit ? input.offset + input.limit : null }
}
