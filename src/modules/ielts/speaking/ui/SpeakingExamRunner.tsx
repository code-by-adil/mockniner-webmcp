import { useState } from 'react'
import { ExamUiBoundary } from '@/app/layouts/ExamUiBoundary'
import { Header } from '@/modules/exam-engine/ui/Header'
import type { CompleteSpeakingAttemptInput } from '@/application/attemptWriter'
import type { BindSpeakingInterview } from '@/application/speakingInterviewController'
import { SpeakingInterview } from './SpeakingInterview'
import { useExamNativeDialog } from '@/shared/ui/exam/useExamNativeDialog'
import type { SpeakingPlan } from '@/domain/speakingPlan'

export function SpeakingExamRunner({ onExit, onSubmit, bindSpeakingInterview, initialPlan, onConfigurePlan, canLeave, attemptId, attemptStartedAt }: {
  onExit: () => void
  onSubmit: (input: CompleteSpeakingAttemptInput) => Promise<unknown>
  bindSpeakingInterview: BindSpeakingInterview
  initialPlan?: SpeakingPlan
  onConfigurePlan: (plan: SpeakingPlan) => void | Promise<void>
  attemptId?: string
  attemptStartedAt?: string
  canLeave: () => boolean
}) {
  const [confirmExit, setConfirmExit] = useState(false)
  const exitDialog = useExamNativeDialog({ open: confirmExit, onOpenChange: setConfirmExit, closedBy: 'closerequest' })
  return <ExamUiBoundary>
    <div className="exam-live-speaking-shell flex h-screen flex-col overflow-hidden font-sans">
      <Header testType="speaking" position="contained" onExit={() => canLeave() ? onExit() : setConfirmExit(true)} />
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <SpeakingInterview bindSpeakingInterview={bindSpeakingInterview} onComplete={onSubmit} initialPlan={initialPlan} onConfigurePlan={onConfigurePlan} attemptId={attemptId} attemptStartedAt={attemptStartedAt} />
      </div>
      <dialog ref={exitDialog} aria-labelledby="speaking-exit-title" className="exam-native-dialog max-w-sm rounded-xl bg-[var(--exam-surface)] p-6 text-[var(--exam-text)] shadow-xl backdrop:bg-black/40">
          <h2 id="speaking-exit-title" className="text-xl font-bold">Leave this interview?</h2>
          <p className="mt-3 text-sm leading-6 text-[var(--exam-text-muted)]">Completed answers are saved on this device. An answer still being recorded or waiting to save will be lost. You can resume from the next unsaved question.</p>
          <div className="mt-6 flex flex-wrap gap-3"><button type="button" onClick={() => setConfirmExit(false)} className="rounded-lg border border-[var(--exam-border)] px-4 py-3 font-semibold">Keep practising</button><button type="button" onClick={onExit} className="rounded-lg bg-[var(--exam-accent)] px-4 py-3 font-semibold text-white">Pause and leave</button></div>
      </dialog>
    </div>
  </ExamUiBoundary>
}
