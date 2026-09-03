import { z } from 'zod';
import { expectedEvaluationRevisionSchema } from './evaluationRevision';

export const objectiveExplanationInputSchema = z.strictObject({
  attemptId: z.uuid(),
  section: z.enum(['reading', 'listening']),
  questionId: z.number().int().min(1).max(40),
  explanation: z.string().trim().min(1).max(4_000).describe('Base feedback on the original content and saved grading. Plain text; this does not change the answer key or score.'),
  expectedRevision: expectedEvaluationRevisionSchema.describe('Omit for first feedback or an identical retry. To correct an explanation, supply its current explanation.revision from get_ielts_objective_review.'),
});
export const objectiveExplanationSchema = objectiveExplanationInputSchema.omit({ expectedRevision: true }).extend({
  revision: z.number().int().positive(),
  evaluatedAt: z.iso.datetime({ offset: true }),
});
export type ObjectiveExplanationInput = z.infer<typeof objectiveExplanationInputSchema>;
export type ObjectiveExplanation = z.infer<typeof objectiveExplanationSchema>;
