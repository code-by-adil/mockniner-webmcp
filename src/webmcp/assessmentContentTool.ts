import { z } from 'zod';
import { assessmentContentInputSchema, readInstalledAssessment } from '@/application/assessmentContent';
import type { PracticeWorkspace } from '@/application/practiceNavigation';
import { applicationFailure, getToolExecutionSignal, throwIfCancelled, toolFailure, zodIssues } from './toolResult';

export function createAssessmentContentTool(getWorkspace: () => PracticeWorkspace): WebMCP.ModelContextTool {
  return {
    name: 'get_assessment_content', title: 'Read installed assessment for authoring',
    description: 'Retrieve an installed universal package by packageId for revision or copying. view summary lists part/item IDs; full (default) includes keys and needs the library, with no unfinished attempt for that package. Optional partId/itemId limits content; revision checks its version. Only a complete package can go to install_assessment; increment revision when replacing. Built-ins need a fresh packageId. For saved responses use get_assessment_submission.',
    inputSchema: z.toJSONSchema(assessmentContentInputSchema, { target: 'draft-07', io: 'input' }),
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute: async (raw, options) => {
      throwIfCancelled(getToolExecutionSignal(options));
      const parsed = assessmentContentInputSchema.safeParse(raw);
      if (!parsed.success) return toolFailure('INVALID_INPUT', 'Supply packageId and optional view, partId, itemId or revision.', true, zodIssues(parsed.error));
      try { return { ok: true, data: readInstalledAssessment(getWorkspace(), parsed.data) }; }
      catch (error) { return applicationFailure(error); }
    },
  };
}
