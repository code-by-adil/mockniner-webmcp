import type { SQLocal } from 'sqlocal';
import { z } from 'zod';
import { SECTION_META } from '@/domain/sections';
import { parseStoredObjectiveResult, parseStoredSpeakingEvaluation, parseStoredWritingEvaluation } from '@/domain/attemptValidation';
import { assessmentResultSchema, assessmentEvaluationSchema, parseAssessmentPackage } from '@/domain/assessment';
import type { ObjectiveResult, SectionKey, WritingEvaluation } from '@/domain/types';
import type { WritingCriteriaSummary } from '@/domain/learningSummary';
import { storageHealth } from '../storageHealth';

export type HistoryKind = SectionKey | 'assessment';
export type HistoryEntry = {
  attemptId: string; kind: HistoryKind; submittedAt: string; title: string;
  contentKey?: string; packageId?: string;
  evaluationStatus: 'not_required' | 'awaiting_evaluation' | 'evaluated' | 'insufficient_evidence';
  rawScore?: number; maximumScore?: number; band?: number; answered?: number;
  domains?: ReturnType<typeof assessmentResultSchema.parse>['domains']; evaluationScore?: number;
  criteria?: WritingCriteriaSummary;
};
type Row = { attemptId: string; kind: HistoryKind; contentKey: string | null; packageId: string | null; submittedAt: string; definitionJson: string | null; resultJson: string | null; evaluationJson: string | null };

function criteria(evaluation: WritingEvaluation): WritingCriteriaSummary {
  return {
    taskAchievement: (evaluation.task1.taskAchievement + evaluation.task2.taskAchievement) / 2,
    coherenceCohesion: (evaluation.task1.coherenceCohesion + evaluation.task2.coherenceCohesion) / 2,
    lexicalResource: (evaluation.task1.lexicalResource + evaluation.task2.lexicalResource) / 2,
    grammaticalRange: (evaluation.task1.grammaticalRange + evaluation.task2.grammaticalRange) / 2,
  };
}

function parseRow(row: Row): HistoryEntry {
  z.uuid().parse(row.attemptId);
  z.iso.datetime({ offset: true }).parse(row.submittedAt);
  const common = { attemptId: row.attemptId, kind: row.kind, submittedAt: row.submittedAt,
    ...(row.packageId ? { packageId: row.packageId } : { contentKey: row.contentKey! }),
    title: row.kind === 'assessment' ? '' : `${SECTION_META[row.kind].label} Practice` };
  if (row.kind === 'reading' || row.kind === 'listening') {
    const result: ObjectiveResult = parseStoredObjectiveResult(row.resultJson!);
    if (result.section !== row.kind) throw new Error('Objective result section does not match its attempt.');
    return { ...common, evaluationStatus: 'not_required', rawScore: result.raw, maximumScore: result.total, band: result.band, answered: result.answered };
  }
  if (row.kind === 'assessment') {
    const assessment = parseAssessmentPackage(JSON.parse(row.definitionJson!));
    if (assessment.packageId !== row.packageId) throw new Error('Package identity does not match its attempt.');
    const result = assessmentResultSchema.parse(JSON.parse(row.resultJson!));
    const evaluation = row.evaluationJson ? assessmentEvaluationSchema.parse(JSON.parse(row.evaluationJson)) : null;
    if (evaluation && evaluation.attemptId !== row.attemptId) throw new Error('Evaluation identity does not match its attempt.');
    return { ...common, title: assessment.title,
      evaluationStatus: evaluation ? 'evaluated' : result.awaitingEvaluationCount ? 'awaiting_evaluation' : 'not_required',
      rawScore: result.rawScore, maximumScore: result.maximumScore, domains: result.domains,
      ...(evaluation ? { evaluationScore: evaluation.overallScore } : {}) };
  }
  const evaluation = row.evaluationJson ? (row.kind === 'writing' ? parseStoredWritingEvaluation : parseStoredSpeakingEvaluation)(row.evaluationJson) : null;
  if (evaluation && evaluation.attemptId !== row.attemptId) throw new Error('Evaluation identity does not match its attempt.');
  return { ...common,
    evaluationStatus: evaluation && 'status' in evaluation && evaluation.status === 'insufficient_evidence' ? 'insufficient_evidence' : evaluation ? 'evaluated' : 'awaiting_evaluation',
    ...(evaluation && 'overallBand' in evaluation ? { band: evaluation.overallBand } : {}),
    ...(evaluation && 'task1' in evaluation ? { criteria: criteria(evaluation) } : {}) };
}

/** UI and tools use one summary parser. Invalid rows stay in SQLite and in pagination. */
export async function readHistoryPage(database: Pick<SQLocal, 'sql'>, input: { kind?: HistoryKind; limit: number; offset: number }) {
  const limit = Math.max(1, Math.min(50, Math.trunc(input.limit)));
  const offset = Math.max(0, Math.trunc(input.offset));
  const rows = await database.sql<Row>`SELECT * FROM (
    SELECT a.id AS attemptId, a.section AS kind, a.content_key AS contentKey, NULL AS packageId,
      a.submitted_at AS submittedAt, NULL AS definitionJson, o.result_json AS resultJson,
      COALESCE(w.evaluation_json, s.evaluation_json) AS evaluationJson
    FROM attempts a LEFT JOIN objective_submissions o ON o.attempt_id = a.id
      LEFT JOIN writing_evaluations w ON w.attempt_id = a.id LEFT JOIN speaking_evaluations s ON s.attempt_id = a.id
    UNION ALL
    SELECT a.id, 'assessment', NULL, a.package_id, a.submitted_at, a.package_snapshot_json, a.result_json, e.evaluation_json
    FROM assessment_attempts a LEFT JOIN assessment_evaluations e ON e.attempt_id = a.id
  ) WHERE (${input.kind ?? null} IS NULL OR kind = ${input.kind ?? null})
  ORDER BY submittedAt DESC, kind, attemptId DESC LIMIT ${limit + 1} OFFSET ${offset}`;
  const items: HistoryEntry[] = [];
  const unavailable: { attemptId: string; kind: HistoryKind; message: string }[] = [];
  for (const row of rows.slice(0, limit)) {
    try { items.push(parseRow(row)); }
    catch {
      const message = 'Stored record failed validation. Its original data has been kept for recovery.';
      unavailable.push({ attemptId: row.attemptId, kind: row.kind, message });
      storageHealth.report(`History ${row.attemptId} could not be read. Its original data has been kept.`);
    }
  }
  return { items, unavailable, nextOffset: rows.length > limit ? offset + limit : null };
}

export async function readRecentHistory(database: Pick<SQLocal, 'sql'>, kind: HistoryKind, limit: number) {
  const recent: HistoryEntry[] = [];
  const unavailable: Awaited<ReturnType<typeof readHistoryPage>>['unavailable'] = [];
  let offset: number | null = 0;
  // Bound work even if an old database contains many unreadable rows.
  while (offset !== null && offset < 500 && recent.length < limit) {
    const page = await readHistoryPage(database, { kind, limit: 50, offset });
    recent.push(...page.items); unavailable.push(...page.unavailable); offset = page.nextOffset;
  }
  return { items: recent.slice(0, limit), unavailable };
}
