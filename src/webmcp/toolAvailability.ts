import { getPracticeLeaveBlocker, getResumablePractices } from '@/application/practiceNavigation';
import type { SpeakingProgress } from '@/application/speakingInterviewController';
import { findContentBlockingDraft } from '@/domain/session';
import type { WebMcpToolOptions } from './useWebMcpTools';

type Availability = { status: 'available' } | { status: 'conditional'; requirement: string }
  | { status: 'blocked'; code: string; message: string };
const available: Availability = { status: 'available' };
const conditional = (requirement: string): Availability => ({ status: 'conditional', requirement });
const blocked = (code: string, message: string): Availability => ({ status: 'blocked', code, message });

// Whole-tool eligibility is shared by discovery and execution. Conditional
// entries still validate the requested ID, mode, revision and payload in their
// domain command; discovery never reads a draft's answers or answer keys.
export function getToolAvailability(
  state: Pick<WebMcpToolOptions, 'context' | 'workspace' | 'nativeAuthoringEnabled' | 'assessmentToolSurface'>,
  speaking: SpeakingProgress | { active: boolean; phase: string },
  canLeaveSpeaking: boolean,
): Record<string, Availability> {
  const { context, workspace } = state;
  const home = state.nativeAuthoringEnabled && state.assessmentToolSurface === 'authoring';
  const submission = (kind: string) => context.submissions.find(item => item.kind === kind);
  const readSubmission = (kind: string) => submission(kind) ? available
    : conditional('No visible submission of this kind. Supply attemptId from get_practice_history or explicitly request latest.');
  const feedback = (kind: string): Availability => submission(kind)
    ? conditional('Use the visible submission attemptId. Read its feedback contract first; identical retries are safe, corrections require expectedRevision.')
    : blocked('TOOL_NOT_AVAILABLE', `Open a submitted ${kind === 'assessment' ? 'universal assessment' : 'IELTS Writing attempt'} with open_practice action result before attaching or revising feedback.`);
  const leaveBlocker = getPracticeLeaveBlocker({ ...workspace, canLeaveSpeaking });
  const objective = context.view === 'review' && context.reviewLocation
    && ['reading', 'listening'].includes(context.reviewLocation.kind);
  const speakingSubmission = submission('speaking');
  const authoringSections = ['listening', 'reading', 'writing'] as const;
  const blockedSections = authoringSections.filter(section => findContentBlockingDraft(workspace.native, section));
  const unlockedSections = authoringSections.filter(section => !blockedSections.includes(section));
  return {
    get_practice_context: available,
    get_practice_library: available,
    get_practice_history: available,
    get_practice_activity: available,
    get_ielts_learning_summary: available,
    get_ielts_authoring_kit: available,
    get_assessment_authoring_kit: available,
    get_ielts_speaking_progress: available,
    open_practice: leaveBlocker ? blocked(leaveBlocker.code, speaking.phase === 'loading'
      ? 'The saved Speaking draft is loading. Wait for loading to finish, then read get_practice_context before navigating.'
      : leaveBlocker.message)
      : conditional('library and saved results are available. For start/resume, read get_practice_library for target IDs, startability, drafts and audio readiness.'),
    install_ielts_practice_set: home
      ? !unlockedSections.length
        ? blocked('ACTIVE_ATTEMPT', 'Unfinished practice locks content installation for Listening, Reading and Writing. Finish the blocking drafts first; get_practice_library lists their resume IDs. Authoring schemas remain available.')
        : blockedSections.length
          ? conditional(`Available sections: ${unlockedSections.join(', ')}. Drafts block installation for: ${blockedSections.join(', ')}. Read get_practice_library for resume IDs.`)
          : available
      : blocked('TOOL_NOT_AVAILABLE', 'Use open_practice with action library before installing practice.'),
    install_assessment: home
      ? conditional('Use a new packageId, or increase the installed revision. An unfinished attempt for that package blocks replacement; built-ins cannot be replaced.')
      : blocked('TOOL_NOT_AVAILABLE', 'Use open_practice with action library before installing practice.'),
    get_assessment_content: conditional(workspace.native.view === 'home' && workspace.assessment.view === 'home'
      ? 'summary is available. full requires no unfinished attempt for that package; summary returns its authoringAccess and revision.'
      : 'Only view summary is available here. Open the library for full content; a draft for that package also blocks full reads.'),
    get_ielts_objective_review: conditional('Supply section reading/listening. Omit attemptId only for a visible submitted section; otherwise use an ID from get_practice_history.'),
    get_ielts_writing_submission: readSubmission('writing'),
    get_ielts_speaking_submission: readSubmission('speaking'),
    get_assessment_submission: readSubmission('assessment'),
    attach_ielts_writing_evaluation: feedback('writing'),
    attach_assessment_evaluation: submission('assessment')?.evaluationStatus === 'not_required'
      ? blocked('EVALUATION_NOT_REQUIRED', 'This submission has no responses awaiting agent evaluation. Read get_assessment_submission for its objective results.')
      : feedback('assessment'),
    attach_ielts_speaking_evaluation: !speakingSubmission
      ? blocked('TOOL_NOT_AVAILABLE', 'Open a submitted IELTS Speaking attempt with open_practice action result before attaching feedback.')
      : speakingSubmission.evaluationStatus !== 'awaiting_evaluation'
        ? blocked('EVALUATION_EXISTS', 'This Speaking attempt already has feedback. Read get_ielts_speaking_submission to retrieve it; Speaking feedback cannot currently be revised.')
        : conditional('Use the visible attemptId and transcript evidence from get_ielts_speaking_submission. Without transcript evidence use status insufficient_evidence and omit bands.'),
    save_ielts_objective_explanation: objective
      ? conditional('Use the visible review attemptId and section, plus questionId from get_ielts_objective_review. Revisions require the saved explanation revision.')
      : blocked('ATTEMPT_NOT_CURRENT', 'Open a submitted Reading/Listening review with open_practice action result before saving an explanation.'),
    set_ielts_speaking_interview: !('currentQuestion' in speaking)
      ? blocked('SPEAKING_NOT_OPEN', 'Open Speaking practice before installing an interview.')
      : ['loading', 'preparing'].includes(speaking.phase)
        ? blocked('SPEAKING_NOT_READY', 'Speaking is loading or preparing. Read progress.preparationStage and recoveryAction in get_practice_context. Configure only after phase setup with no recorded or skipped answers.')
      : speaking.phase !== 'setup' || speaking.recordedAnswers + speaking.skippedAnswers > 0
        ? blocked('SPEAKING_ALREADY_STARTED', 'The question set is locked. Finish or exit this interview before installing another.') : available,
    retry_ielts_listening_audio: workspace.listeningAudio.canRetry
      ? conditional('Supply listeningAudio.contentKey. Starts preparation; read listeningAudio for completion before starting practice.')
      : blocked('AUDIO_RETRY_NOT_AVAILABLE', 'Audio is not in a failed generation state. Read listeningAudio for current progress.'),
  };
}

export function summarizeToolAvailability(availability: Record<string, Availability>, includeExamples: boolean) {
  const result = {
    available: [] as string[],
    conditional: {} as Record<string, string>,
    blocked: {} as Record<string, { code: string; message: string }>,
    authoringExamplesIncluded: includeExamples,
  };
  for (const [name, entry] of Object.entries(availability)) {
    if (entry.status === 'available') result.available.push(name);
    else if (entry.status === 'conditional') result.conditional[name] = entry.requirement;
    else result.blocked[name] = { code: entry.code, message: entry.message };
  }
  return result;
}

export const includeAuthoringExamples = (workspace: WebMcpToolOptions['workspace']) => getResumablePractices(workspace).length === 0;
