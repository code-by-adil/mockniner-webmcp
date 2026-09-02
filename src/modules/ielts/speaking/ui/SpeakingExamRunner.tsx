import { useState } from 'react'
import { ExamUiBoundary } from '@/app/layouts/ExamUiBoundary'
import { Header } from '@/modules/exam-engine/ui/Header'
import type { CompleteSpeakingAttemptInput } from '@/application/attemptWriter'
import type { BindSpeakingInterview } from '@/application/speakingInterviewController'
import { SpeakingInterview } from './SpeakingInterview'
import { useExamNativeDialog } from '@/shared/ui/exam/useExamNativeDialog'

export function SpeakingExamRunner({ onExit, onSubmit, bindSpeakingInterview }: {
  onExit: () => void
  onSubmit: (input: CompleteSpeakingAttemptInput) => Promise<unknown>
  bindSpeakingInterview: BindSpeakingInterview
}) {
  const [confirmExit, setConfirmExit] = useState(false)
  const exitDialog = useExamNativeDialog({ open: confirmExit, onOpenChange: setConfirmExit, closedBy: 'closerequest' })
  return <ExamUiBoundary>
    <div className="exam-live-speaking-shell flex h-screen flex-col overflow-hidden font-sans">
      <Header testType="speaking" position="contained" onExit={() => setConfirmExit(true)} />
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <SpeakingInterview bindSpeakingInterview={bindSpeakingInterview} onComplete={onSubmit} />
      </div>
      <dialog ref={exitDialog} aria-labelledby="speaking-exit-title" className="exam-native-dialog max-w-sm rounded-xl bg-[var(--exam-surface)] p-6 text-[var(--exam-text)] shadow-xl backdrop:bg-black/40">
          <h2 id="speaking-exit-title" className="text-xl font-bold">Leave this interview?</h2>
          <p className="mt-3 text-sm leading-6 text-[var(--exam-text-muted)]">This unfinished interview is held in this tab. Leaving discards its recordings. Completed attempts are unchanged.</p>
          <div className="mt-6 flex flex-wrap gap-3"><button type="button" onClick={() => setConfirmExit(false)} className="rounded-lg border border-[var(--exam-border)] px-4 py-3 font-semibold">Keep practising</button><button type="button" onClick={onExit} className="rounded-lg bg-[var(--exam-accent)] px-4 py-3 font-semibold text-white">Discard and leave</button></div>
      </dialog>
    </div>
  </ExamUiBoundary>
}
