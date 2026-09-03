import type { SQLocal } from 'sqlocal';
import { objectiveExplanationInputSchema, objectiveExplanationSchema, type ObjectiveExplanationInput, type ObjectiveExplanation } from '@/domain/objectiveExplanation';
import { prepareEvaluationWrite } from '@/domain/evaluationRevision';
import { ApplicationError } from '@/domain/errors';
import { recordNativeAttemptActivity } from './practiceActivity';

export async function readObjectiveExplanations(database: SQLocal, attemptId: string): Promise<ObjectiveExplanation[]> {
  const rows = await database.sql<{ questionId: number; explanationJson: string }>`
    SELECT question_id AS questionId, explanation_json AS explanationJson FROM objective_explanations
    WHERE attempt_id = ${attemptId} ORDER BY question_id
  `;
  return rows.map(row => {
    const explanation = objectiveExplanationSchema.parse(JSON.parse(row.explanationJson));
    if (explanation.attemptId !== attemptId || explanation.questionId !== row.questionId) throw new Error('The saved explanation does not match its submitted question.');
    return explanation;
  });
}

export async function saveObjectiveExplanation(database: SQLocal, input: ObjectiveExplanationInput): Promise<ObjectiveExplanation> {
  const { expectedRevision, ...feedback } = objectiveExplanationInputSchema.parse(input);
  return database.transaction(async transaction => {
    const [attempt] = await transaction.sql<{ section: string }>`
      SELECT section FROM attempts JOIN objective_submissions ON attempts.id = objective_submissions.attempt_id
      WHERE attempts.id = ${feedback.attemptId}
    `;
    if (!attempt || attempt.section !== feedback.section) throw new ApplicationError('OBJECTIVE_SUBMISSION_NOT_FOUND', 'Choose a submitted attempt of the requested section.', true);
    const [row] = await transaction.sql<{ explanationJson: string }>`
      SELECT explanation_json AS explanationJson FROM objective_explanations
      WHERE attempt_id = ${feedback.attemptId} AND question_id = ${feedback.questionId}
    `;
    const current = row ? objectiveExplanationSchema.parse(JSON.parse(row.explanationJson)) : null;
    const explanation = prepareEvaluationWrite({ ...feedback, revision: 1, evaluatedAt: new Date().toISOString() }, current, expectedRevision);
    if (explanation === current) return explanation;
    await transaction.sql`
      INSERT INTO objective_explanations (attempt_id, question_id, explanation_json)
      VALUES (${feedback.attemptId}, ${feedback.questionId}, ${JSON.stringify(explanation)})
      ON CONFLICT(attempt_id, question_id) DO UPDATE SET explanation_json = excluded.explanation_json
    `;
    await recordNativeAttemptActivity(transaction, feedback.attemptId, 'feedback_attached', 'evaluated');
    return explanation;
  });
}
