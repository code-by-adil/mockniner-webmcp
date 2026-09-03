import { z } from 'zod';
import { ApplicationError } from './errors';

export const expectedEvaluationRevisionSchema = z.number().int().nonnegative().optional()
  .describe('Omit for first feedback or an identical retry. To change feedback, read the submission and supply its current evaluationRevision.');

type VersionedEvaluation = { evaluatedAt: string; revision?: number };

function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, entry) =>
    entry && typeof entry === 'object' && !Array.isArray(entry)
      ? Object.fromEntries(Object.entries(entry).sort(([a], [b]) => a.localeCompare(b)))
      : entry);
}

function content(evaluation: VersionedEvaluation): unknown {
  const { evaluatedAt: _evaluatedAt, revision: _revision, ...feedback } = evaluation;
  return feedback;
}

/** Must run inside the transaction that reads and writes the evaluation. */
export function prepareEvaluationWrite<T extends VersionedEvaluation>(
  candidate: T, current: T | null, expectedRevision?: number,
): T {
  if (current && canonicalJson(content(candidate)) === canonicalJson(content(current))) return current;
  const revision = current ? current.revision ?? 1 : 0;
  if (current && expectedRevision === undefined) {
    throw new ApplicationError('EVALUATION_REVISION_REQUIRED',
      `Feedback already exists at revision ${revision}. Read the submission, then supply expectedRevision to correct it. Identical retries are safe.`, true,
      [{ path: 'expectedRevision', message: `Current evaluation revision: ${revision}.` }]);
  }
  if (expectedRevision !== undefined && expectedRevision !== revision) {
    throw new ApplicationError('EVALUATION_REVISION_CONFLICT',
      `Feedback is at revision ${revision}, not ${expectedRevision}. Read the submission again and reconsider the correction before retrying.`, true,
      [{ path: 'expectedRevision', message: `Current evaluation revision: ${revision}.` }]);
  }
  return { ...candidate, revision: revision + 1 };
}
