import { z } from 'zod';
import { objectiveExplanationInputSchema } from '@/domain/objectiveExplanation';
import type { IeltsCommands } from '@/application/ieltsCommands';
import { applicationFailure, getToolExecutionSignal, throwIfCancelled, toolFailure, zodIssues } from './toolResult';

export function createObjectiveExplanationTool(save: IeltsCommands['saveObjectiveExplanation']): WebMCP.ModelContextTool {
  return {
    name: 'save_ielts_objective_explanation', title: 'Save a submitted question explanation',
    description: 'Save and show an agent explanation for one submitted Reading/Listening question. Open its review first; read get_ielts_objective_review for original content, response and grading. Does not alter the response, key or score. Identical retries are safe. To revise existing feedback, send expectedRevision from that question’s explanation.revision. Explanations persist with the attempt.',
    inputSchema: z.toJSONSchema(objectiveExplanationInputSchema, { target: 'draft-07', io: 'input' }),
    annotations: { readOnlyHint: false, untrustedContentHint: true },
    execute: async (input, options) => {
      const signal = getToolExecutionSignal(options); throwIfCancelled(signal);
      const parsed = objectiveExplanationInputSchema.safeParse(input);
      if (!parsed.success) return toolFailure('INVALID_EXPLANATION', 'Supply a submitted attempt, section, questionId and explanation text.', true, zodIssues(parsed.error));
      try {
        const explanation = await save(parsed.data);
        return { ok: true, data: { status: 'saved', explanation }, sideEffect: { type: 'objective_explanation_saved', visibleView: 'review' } };
      } catch (error) { return applicationFailure(error); }
    },
  };
}
