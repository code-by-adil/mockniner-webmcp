import { z } from 'zod'
import { ApplicationError } from '@/domain/errors'
import { reviewLocationSchema } from '@/domain/reviewLocation'
import { getIeltsDrafts, getResumableSection, findIeltsDraft, findContentBlockingDraft, type IeltsSession } from '@/domain/session'
import type { AssessmentSession } from '@/domain/assessmentSession'
import type { AssessmentPackage } from '@/domain/assessment'
import type { ActiveContentDocuments, PracticeContentDocument } from '@/domain/contentDocument'
import type { IeltsCommands } from './ieltsCommands'
import type { AssessmentApplicationCommands } from './assessmentCommands'
import type { ListeningAudioStatus } from './listeningAudioStatus'

export const practiceKind = z.enum(['listening', 'reading', 'writing', 'speaking', 'assessment'])
const key = z.string().min(1).max(100)
export const navigationSchema = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('library') }),
  z.strictObject({ action: z.literal('result'), kind: practiceKind, attemptId: z.uuid(), location: reviewLocationSchema.optional() })
    .superRefine((input, ctx) => {
      const location = input.location
      if (!location) return
      const valid = input.kind === 'assessment' ? 'itemId' in location
        : input.kind === 'writing' ? 'taskNumber' in location || 'correctionId' in location
        : input.kind === 'reading' || input.kind === 'listening' ? 'questionId' in location : false
      if (!valid) ctx.addIssue({ code: 'custom', path: ['location'], message: 'Use questionId for Reading/Listening, taskNumber/correctionId for Writing, or itemId for assessments.' })
    }),
  z.strictObject({ action: z.literal('start'), kind: z.enum(['listening', 'reading', 'writing', 'speaking', 'assessment', 'full_ielts']), contentKey: key.optional(), packageId: key.optional() })
    .superRefine((input, ctx) => {
      if ((input.kind === 'assessment') !== Boolean(input.packageId)) ctx.addIssue({ code: 'custom', path: ['packageId'], message: 'packageId is required only for an assessment.' })
      if (input.contentKey && !['listening', 'reading', 'writing'].includes(input.kind)) ctx.addIssue({ code: 'custom', path: ['contentKey'], message: 'contentKey selects a saved Listening, Reading or Writing set.' })
    }),
  z.strictObject({ action: z.literal('resume'), kind: z.enum(['ielts', 'assessment']), attemptId: z.uuid() }),
])
export type PracticeNavigationInput = z.infer<typeof navigationSchema>
export type PracticeWorkspace = { native: IeltsSession; assessment: AssessmentSession; content: ActiveContentDocuments; assessments: AssessmentPackage[]; listeningAudio: ListeningAudioStatus; canLeaveSpeaking?: boolean }

type StartKind = 'assessment' | 'listening' | 'reading' | 'writing' | 'speaking' | 'full_ielts'
export function getPracticeLeaveBlocker(workspace: PracticeWorkspace) {
  return workspace.native.view === 'exam' && workspace.native.currentSection === 'speaking' && !workspace.canLeaveSpeaking
    ? { code: 'SPEAKING_IN_PROGRESS', message: 'The interview is running or has unsaved responses. Finish it or use Exit Test before leaving. Empty setup can be paused safely.' } : null
}

export function getPracticeDraftBlocker(workspace: PracticeWorkspace, kind: StartKind) {
  const existing = kind === 'assessment' ? workspace.assessment.attemptId
    : findIeltsDraft(workspace.native, kind === 'full_ielts' ? 'full' : 'section', kind === 'full_ielts' ? 'listening' : kind)?.attemptId
  return existing ? { code: 'ACTIVE_ATTEMPT', attemptId: existing,
    message: 'An unfinished attempt exists for this practice. Resume its attemptId, or let the learner finish or replace it in the interface. Other IELTS sections can be practised without discarding it.' } : null
}

export function getPracticeStartability(workspace: PracticeWorkspace, kind: StartKind, contentKey?: string) {
  const blocked = getPracticeLeaveBlocker(workspace) ?? getPracticeDraftBlocker(workspace, kind)
  if (blocked) return { canStart: false, blockingReason: blocked }
  if (contentKey && (kind === 'reading' || kind === 'listening' || kind === 'writing') && workspace.content[kind].contentKey !== contentKey) {
    const draft = findContentBlockingDraft(workspace.native, kind)
    if (draft) return { canStart: false, blockingReason: { code: 'ACTIVE_ATTEMPT', attemptId: draft.attemptId,
      message: 'An unfinished practice uses this section. It can use the active set, but cannot activate a different set until that practice is finished.' } }
  }
  if (kind === 'listening' && contentKey && contentKey !== workspace.content.listening.contentKey) return {
    canStart: false, blockingReason: { code: 'LISTENING_ACTIVATION_REQUIRED', message: 'Use open_practice start with this contentKey to activate it, then wait for listeningAudio.readyToPlay and start again.' },
  }
  if ((kind === 'listening' || kind === 'full_ielts') && !workspace.listeningAudio.readyToPlay) return {
    canStart: false, blockingReason: { code: 'LISTENING_AUDIO_NOT_READY', message: 'Wait for listeningAudio.readyToPlay. If canRetry is true, use retry_ielts_listening_audio.' },
  }
  return { canStart: true, blockingReason: null }
}

export function getResumablePractices({ native, assessment }: PracticeWorkspace) {
  return [
    ...getIeltsDrafts(native).map(draft => ({ kind: 'ielts' as const, attemptId: draft.attemptId!, section: getResumableSection(draft)!, mode: draft.mode })),
    ...(assessment.attemptId && assessment.packageId ? [{ kind: 'assessment' as const, attemptId: assessment.attemptId, packageId: assessment.packageId }] : []),
  ]
}

export function createPracticeNavigation(deps: {
  getWorkspace: () => PracticeWorkspace
  native: Pick<IeltsCommands, 'goHome' | 'openAttempt' | 'resume' | 'start' | 'installContent'>
  assessment: Pick<AssessmentApplicationCommands, 'goHome' | 'openAttempt' | 'resume' | 'start'>
  loadContent: (key: string) => Promise<PracticeContentDocument | null>
  canLeaveSpeaking?: () => boolean
}) {
  let navigating = false
  const assertCanLeave = () => {
    const blocker = getPracticeLeaveBlocker({ ...deps.getWorkspace(), canLeaveSpeaking: deps.canLeaveSpeaking?.() })
    if (blocker) throw new ApplicationError(blocker.code, blocker.message, true)
  }
  const assertNoDraft = (kind: 'assessment' | 'listening' | 'reading' | 'writing' | 'speaking' | 'full_ielts') => {
    const blocker = getPracticeDraftBlocker(deps.getWorkspace(), kind)
    if (blocker) throw new ApplicationError(blocker.code, blocker.message, true)
  }
  const requireListening = (section: string) => {
    if (section === 'listening' && !deps.getWorkspace().listeningAudio.readyToPlay) throw new ApplicationError('LISTENING_AUDIO_NOT_READY', 'Listening audio is not ready to play. Read listeningAudio in get_practice_context; if canRetry is true, use retry_ielts_listening_audio with its contentKey.', true)
  }
  return async (raw: PracticeNavigationInput) => {
    const input = navigationSchema.parse(raw)
    if (navigating) throw new ApplicationError('NAVIGATION_BUSY', 'Another navigation is in progress. Wait for it to finish.', true)
    navigating = true
    try {
      assertCanLeave()
      if (input.action === 'library') { await deps.native.goHome(); deps.assessment.goHome(); return { view: 'home' } }
      if (input.action === 'result') {
        if (input.kind === 'assessment') { await deps.assessment.openAttempt(input.attemptId, input.location && 'itemId' in input.location ? input.location.itemId : undefined); await deps.native.goHome() }
        else { await deps.native.openAttempt(input.attemptId, input.kind, input.location); deps.assessment.goHome() }
        return { view: 'result', kind: input.kind, attemptId: input.attemptId, ...(input.location ? { location: input.location } : {}) }
      }
      if (input.action === 'resume') {
        const draft = getResumablePractices(deps.getWorkspace()).find(d => d.kind === input.kind && d.attemptId === input.attemptId)
        if (!draft) throw new ApplicationError('RESUMABLE_ATTEMPT_NOT_FOUND', 'That attempt is not the saved unfinished attempt. Read get_practice_library for its current ID.', true)
        if (draft.kind === 'ielts') { requireListening(draft.section); deps.assessment.goHome(); await deps.native.goHome(); await deps.native.resume(draft.attemptId) }
        else { await deps.native.goHome(); deps.assessment.resume() }
        return { view: 'exam', kind: input.kind, resumedFromAttemptId: input.attemptId }
      }
      assertNoDraft(input.kind)
      if (input.kind === 'assessment') {
        if (!deps.getWorkspace().assessments.some(p => p.packageId === input.packageId)) throw new ApplicationError('PRACTICE_NOT_FOUND', 'That assessment is not installed. Read get_practice_library.', true)
        deps.assessment.start(input.packageId!); await deps.native.goHome()
      } else {
        if (input.contentKey && deps.getWorkspace().content[input.kind as keyof ActiveContentDocuments]?.contentKey !== input.contentKey) {
          const content = await deps.loadContent(input.contentKey)
          assertCanLeave(); assertNoDraft(input.kind)
          if (!content || content.section !== input.kind) throw new ApplicationError('PRACTICE_NOT_FOUND', 'That content key is not a saved practice of the requested kind.', true)
          await deps.native.installContent(content)
          // A changed Listening set needs the app's audio preparation before start.
          if (input.kind === 'listening') { deps.assessment.goHome(); return { view: 'home', status: 'audio_preparing', contentKey: input.contentKey } }
        }
        requireListening(input.kind === 'full_ielts' ? 'listening' : input.kind)
        await deps.native.start(input.kind === 'full_ielts' ? 'full' : 'section', input.kind === 'full_ielts' ? 'listening' : input.kind)
        deps.assessment.goHome()
      }
      return { view: 'exam', kind: input.kind, status: 'started' }
    } finally { navigating = false }
  }
}
