import { z } from 'zod'
import { ApplicationError } from '@/domain/errors'
import { getResumableSection, type IeltsSession } from '@/domain/session'
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
  z.strictObject({ action: z.literal('result'), kind: practiceKind, attemptId: z.uuid() }),
  z.strictObject({ action: z.literal('start'), kind: z.enum(['listening', 'reading', 'writing', 'speaking', 'assessment', 'full_ielts']), contentKey: key.optional(), packageId: key.optional() })
    .superRefine((input, ctx) => {
      if ((input.kind === 'assessment') !== Boolean(input.packageId)) ctx.addIssue({ code: 'custom', path: ['packageId'], message: 'packageId is required only for an assessment.' })
      if (input.contentKey && !['listening', 'reading', 'writing'].includes(input.kind)) ctx.addIssue({ code: 'custom', path: ['contentKey'], message: 'contentKey selects a saved Listening, Reading or Writing set.' })
    }),
  z.strictObject({ action: z.literal('resume'), kind: z.enum(['ielts', 'assessment']), attemptId: z.uuid() }),
])
export type PracticeNavigationInput = z.infer<typeof navigationSchema>
export type PracticeWorkspace = { native: IeltsSession; assessment: AssessmentSession; content: ActiveContentDocuments; assessments: AssessmentPackage[]; listeningAudio: ListeningAudioStatus }

export function getResumablePractices({ native, assessment }: PracticeWorkspace) {
  const section = getResumableSection(native)
  return [
    ...(section && native.attemptId ? [{ kind: 'ielts' as const, attemptId: native.attemptId, section, mode: native.mode }] : []),
    ...(assessment.attemptId && assessment.packageId ? [{ kind: 'assessment' as const, attemptId: assessment.attemptId, packageId: assessment.packageId }] : []),
  ]
}

export function createPracticeNavigation(deps: {
  getWorkspace: () => PracticeWorkspace
  native: Pick<IeltsCommands, 'goHome' | 'openAttempt' | 'resume' | 'start' | 'installContent'>
  assessment: Pick<AssessmentApplicationCommands, 'goHome' | 'openAttempt' | 'resume' | 'start'>
  loadContent: (key: string) => Promise<PracticeContentDocument | null>
}) {
  let navigating = false
  const assertCanLeave = () => {
    const { native } = deps.getWorkspace()
    if (native.view === 'exam' && native.currentSection === 'speaking') throw new ApplicationError('SPEAKING_IN_PROGRESS', 'Finish the interview or use Exit Test before leaving. Its unfinished recordings are held in this tab.', true)
  }
  const assertNoDraft = (kind: 'ielts' | 'assessment') => {
    if (getResumablePractices(deps.getWorkspace()).some(draft => draft.kind === kind)) throw new ApplicationError('ACTIVE_ATTEMPT', 'An unfinished attempt exists in this practice family. Read get_practice_library and resume its attemptId, or let the learner finish or replace it in the interface before starting another.', true)
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
      if (input.action === 'library') { deps.native.goHome(); deps.assessment.goHome(); return { view: 'home' } }
      if (input.action === 'result') {
        if (input.kind === 'assessment') { await deps.assessment.openAttempt(input.attemptId); deps.native.goHome() }
        else { await deps.native.openAttempt(input.attemptId, input.kind); deps.assessment.goHome() }
        return { view: 'result', kind: input.kind, attemptId: input.attemptId }
      }
      if (input.action === 'resume') {
        const draft = getResumablePractices(deps.getWorkspace()).find(d => d.kind === input.kind && d.attemptId === input.attemptId)
        if (!draft) throw new ApplicationError('RESUMABLE_ATTEMPT_NOT_FOUND', 'That attempt is not the saved unfinished attempt. Read get_practice_library for its current ID.', true)
        if (draft.kind === 'ielts') { requireListening(draft.section); deps.assessment.goHome(); deps.native.goHome(); deps.native.resume() }
        else { deps.native.goHome(); deps.assessment.resume() }
        return { view: 'exam', kind: input.kind, resumedFromAttemptId: input.attemptId }
      }
      assertNoDraft(input.kind === 'assessment' ? 'assessment' : 'ielts')
      if (input.kind === 'assessment') {
        if (!deps.getWorkspace().assessments.some(p => p.packageId === input.packageId)) throw new ApplicationError('PRACTICE_NOT_FOUND', 'That assessment is not installed. Read get_practice_library.', true)
        deps.assessment.start(input.packageId!); deps.native.goHome()
      } else {
        if (input.contentKey && deps.getWorkspace().content[input.kind as keyof ActiveContentDocuments]?.contentKey !== input.contentKey) {
          const content = await deps.loadContent(input.contentKey)
          assertCanLeave(); assertNoDraft('ielts')
          if (!content || content.section !== input.kind) throw new ApplicationError('PRACTICE_NOT_FOUND', 'That content key is not a saved practice of the requested kind.', true)
          await deps.native.installContent(content)
          // A changed Listening set needs the app's audio preparation before start.
          if (input.kind === 'listening') { deps.assessment.goHome(); return { view: 'home', status: 'audio_preparing', contentKey: input.contentKey } }
        }
        requireListening(input.kind === 'full_ielts' ? 'listening' : input.kind)
        deps.native.start(input.kind === 'full_ielts' ? 'full' : 'section', input.kind === 'full_ielts' ? 'listening' : input.kind)
        deps.assessment.goHome()
      }
      return { view: 'exam', kind: input.kind, status: 'started' }
    } finally { navigating = false }
  }
}
