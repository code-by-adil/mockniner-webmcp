import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SQLocal } from 'sqlocal';
import { readingDocument } from '@/content/objective';
import { greStyleAssessment } from '@/content/gre';
import { satPracticeAssessment } from '@/content/sat';
import { gradeObjectiveDocument } from '@/domain/objectiveScoring';
import { gradeAssessment, parseAssessmentPackage, prepareAssessmentEvaluation } from '@/domain/assessment';
import { migrateDatabase } from './migrations';
import { saveObjectiveAttempt } from './attemptRepository';
import { saveAndActivateContent } from './contentRepository';
import { saveAssessmentAttempt, saveAssessmentEvaluation } from './assessmentRepository';
import { readHistoryPage } from './historyRepository';

let database: SQLocal;
const startedAt = '2026-09-01T10:00:00.000Z';
beforeEach(async () => {
  vi.stubGlobal('Worker', class {});
  let connected!: () => void;
  const ready = new Promise<void>(resolve => { connected = resolve; });
  database = new SQLocal({ databasePath: ':memory:', onInit: sql => [sql`PRAGMA foreign_keys = ON`], onConnect: connected });
  await ready;
  await migrateDatabase(database);
});
afterEach(async () => { await database.destroy(true); vi.unstubAllGlobals(); });

describe('canonical practice history', () => {
  it('pages native and custom attempts together in submission order and keeps original content titles', async () => {
    await saveAndActivateContent(database, readingDocument);
    const saved: { attemptId: string; kind: string }[] = [];
    for (let day = 1; day <= 8; day++) {
      const attemptId = crypto.randomUUID();
      const submittedAt = `2026-09-0${day}T11:00:00.000Z`;
      if (day % 2) {
        await saveObjectiveAttempt(database, { attemptId, section: 'reading', contentKey: readingDocument.contentKey,
          answers: {}, result: gradeObjectiveDocument(readingDocument, {}), startedAt, submittedAt });
      } else {
        await saveAssessmentAttempt(database, { attemptId, assessment: satPracticeAssessment, responses: {},
          result: gradeAssessment(satPracticeAssessment, {}), startedAt, submittedAt });
      }
      saved.unshift({ attemptId, kind: day % 2 ? 'reading' : 'assessment' });
    }
    const first = await readHistoryPage(database, { limit: 6, offset: 0 });
    expect(first.items.map(({ attemptId, kind }) => ({ attemptId, kind }))).toEqual(saved.slice(0, 6));
    expect(first.items.find(row => row.kind === 'reading')?.title).toBe(readingDocument.name);
    expect(first.nextOffset).toBe(6);
    const second = await readHistoryPage(database, { limit: 6, offset: first.nextOffset! });
    expect(second.items.map(({ attemptId, kind }) => ({ attemptId, kind }))).toEqual(saved.slice(6));
    expect(second.nextOffset).toBeNull();
    const reread = await readHistoryPage(database, { limit: 6, offset: 0 });
    expect(reread).toEqual(first);
  });

  it('reads pending and completed rubric-only scores from the immutable submission', async () => {
    const assessment = parseAssessmentPackage({ ...greStyleAssessment, packageId: 'writing-only', title: 'Analytical writing',
      parts: greStyleAssessment.parts.filter(part => part.id === 'issue') });
    const responses = { 'gre-issue': 'Public evidence helps people assess policy decisions.' };
    const submission = await saveAssessmentAttempt(database, { attemptId: crypto.randomUUID(), assessment, responses,
      result: gradeAssessment(assessment, responses), startedAt, submittedAt: '2026-09-01T11:00:00.000Z' });
    expect((await readHistoryPage(database, { limit: 6, offset: 0 })).items[0]).toMatchObject({
      attemptId: submission.attemptId, evaluationStatus: 'awaiting_evaluation', rawScore: 0, maximumScore: 0,
    });
    const feedback = prepareAssessmentEvaluation(submission, {
      attemptId: submission.attemptId,
      criteria: assessment.rubric!.criteria.map(criterion => ({ criterionId: criterion.id, score: 4,
        feedback: 'Develop the example.', evidence: ['Public evidence'] })),
      summary: 'A clear position with room for more detail.', strengths: ['Clear position.'], improvements: ['Develop an example.'], annotations: [],
    });
    await saveAssessmentEvaluation(database, { ...feedback, evaluatedAt: '2026-09-01T11:10:00.000Z' });
    expect((await readHistoryPage(database, { limit: 6, offset: 0 })).items[0]).toMatchObject({
      attemptId: submission.attemptId, evaluationStatus: 'evaluated', rawScore: 0, maximumScore: 0,
      evaluationScore: 4, evaluationMaximumScore: 6,
    });
  });
});
