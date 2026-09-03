import { z } from 'zod';
import { assessmentOutline, assessmentReadFields, selectAssessmentContent } from '@/domain/assessmentRead';
import { ApplicationError } from '@/domain/errors';
import { getDraftAssessmentPackageId } from '@/domain/assessmentSession';
import type { PracticeWorkspace } from './practiceNavigation';

export const assessmentContentInputSchema = z.strictObject({
  packageId: z.string().min(1).max(100),
  revision: z.number().int().positive().max(10_000).optional().describe('Optional version check when reading multiple parts. A changed installed revision returns an error.'),
  ...assessmentReadFields,
});

export function readInstalledAssessment(workspace: PracticeWorkspace, raw: z.input<typeof assessmentContentInputSchema>) {
  const input = assessmentContentInputSchema.parse(raw);
  const assessment = workspace.assessments.find(assessment => assessment.packageId === input.packageId);
  if (!assessment) throw new ApplicationError('PRACTICE_NOT_FOUND', 'That assessment is not installed. Read get_practice_library for its packageId.', true);
  if (input.revision !== undefined && input.revision !== assessment.revision) {
    throw new ApplicationError('ASSESSMENT_REVISION_CHANGED', `The installed package is now revision ${assessment.revision}. Read it again before preparing a revision.`, true);
  }
  const blockingReason = getDraftAssessmentPackageId(workspace.assessment) === input.packageId
    ? { code: 'ACTIVE_ATTEMPT', message: 'An unfinished attempt uses this package. Its authoring content includes answer keys; finish the attempt before reading it. A summary or unrelated package is available.' }
    : workspace.native.view !== 'home' || workspace.assessment.view !== 'home'
      ? { code: 'TOOL_NOT_AVAILABLE', message: 'Use open_practice with action library before reading answer-bearing authoring content. For submitted work, use get_assessment_submission.' } : null;
  if (input.view === 'full' && blockingReason) throw new ApplicationError(blockingReason.code, blockingReason.message, true);
  const complete = input.view === 'full' && !input.partId && !input.itemId;
  const content = complete ? assessment : selectAssessmentContent(assessment, input);
  const { source, ...authoringPackage } = content;
  // A fragment must not validate as a replacement for the complete package.
  const { schemaVersion: _schemaVersion, ...fragment } = authoringPackage;
  return structuredClone({ package: input.view === 'summary' ? assessmentOutline(content) : complete ? authoringPackage : fragment,
    source, scope: { view: input.view, partId: input.partId, itemId: input.itemId, completePackage: complete },
    revision: assessment.revision, canReplace: source === 'agent' && !blockingReason,
    authoringAccess: { allowed: !blockingReason, blockingReason },
    revisionGuidance: source === 'agent'
      ? 'Read the complete package, edit it, increase revision by one, then pass only package to install_assessment. Partial reads are not installable. Saved attempts keep their original snapshot.'
      : 'Built-in packages cannot be replaced. Read the complete package, choose a fresh packageId and revision 1, then pass only package to install_assessment.',
  });
}
