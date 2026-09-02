import { ArrowLeft, CheckCircle2, Mic, Volume2 } from 'lucide-react'
import type { SpeakingEvaluation, SpeakingSubmission } from '@/domain/types'
import { ExamUiBoundary } from '@/app/layouts/ExamUiBoundary'
import { Header } from '@/modules/exam-engine/ui/Header'

type Props = {
  submission: SpeakingSubmission
  evaluation: SpeakingEvaluation
  onExit: () => void
}

const criteria = [
  ['Fluency & coherence', 'fluencyCoherence'],
  ['Lexical resource', 'lexicalResource'],
  ['Grammar range & accuracy', 'grammaticalRangeAccuracy'],
] as const

export function SpeakingAttemptReview({ submission, evaluation, onExit }: Props) {
  return (
    <ExamUiBoundary>
      <div className="min-h-screen bg-[var(--exam-surface-muted)] text-[var(--exam-text)]">
        <Header testType="speaking" position="contained" onExit={onExit} />
        <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
          <button type="button" onClick={onExit} className="mb-6 inline-flex items-center gap-2 text-sm font-bold text-[var(--exam-accent)]">
            <ArrowLeft size={16} /> Back to results
          </button>
          <div className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
            <section className="rounded-xl border border-[var(--exam-border-muted)] bg-[var(--exam-surface)] p-6 shadow-sm">
              <div className="text-xs font-bold uppercase tracking-widest text-[var(--exam-text-muted)]">Transcript-based estimate</div>
              <div className="mt-3 flex items-end gap-3">
                <span className="text-6xl font-extrabold text-[var(--exam-accent)]">{evaluation.overallBand}</span>
                <span className="pb-2 text-sm font-bold text-[var(--exam-text-muted)]">Overall band</span>
              </div>
              <p className="mt-5 leading-7 text-[var(--exam-text-muted)]">{evaluation.summary}</p>
              <div className="mt-7 grid gap-3">
                {criteria.map(([label, key]) => (
                  <div key={key} className="flex items-center justify-between rounded border border-[var(--exam-border-muted)] px-4 py-3">
                    <span className="text-sm font-semibold">{label}</span>
                    <span className="text-lg font-extrabold text-[var(--exam-accent)]">{evaluation[key]}</span>
                  </div>
                ))}
                <div className="rounded border border-[var(--exam-border-muted)] bg-[var(--exam-surface-muted)] px-4 py-3">
                  <div className="flex items-center gap-2 text-sm font-semibold"><Volume2 size={16} /> Pronunciation not scored</div>
                  <p className="mt-1 text-xs leading-5 text-[var(--exam-text-muted)]">The agent evaluated the approved transcript and did not receive your locally stored audio.</p>
                </div>
              </div>

              <div className="mt-8">
                <h2 className="font-bold">Strengths</h2>
                <ul className="mt-3 space-y-2">
                  {evaluation.strengths.map((strength) => (
                    <li key={strength} className="flex gap-2 text-sm leading-6"><CheckCircle2 size={17} className="mt-1 shrink-0 text-emerald-600" />{strength}</li>
                  ))}
                </ul>
              </div>
              <div className="mt-7">
                <h2 className="font-bold">What to improve</h2>
                <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-[var(--exam-text-muted)]">
                  {evaluation.improvements.map((improvement) => <li key={improvement}>{improvement}</li>)}
                </ul>
              </div>
            </section>

            <section className="rounded-xl border border-[var(--exam-border-muted)] bg-[var(--exam-surface)] p-6 shadow-sm">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded bg-gray-900 text-white"><Mic size={19} /></span>
                <div>
                  <h2 className="text-xl font-bold">Interview transcript</h2>
                  <p className="text-sm text-[var(--exam-text-muted)]">{submission.responses.length} answers · saved locally</p>
                </div>
              </div>
              <ol className="mt-7 space-y-6">
                {submission.responses.map((response) => (
                  <li key={response.recordingId} className="border-l-2 border-[var(--exam-accent-border)] pl-5">
                    <div className="text-xs font-bold uppercase tracking-widest text-[var(--exam-accent)]">{response.partLabel} · {Math.round(response.durationMs / 1000)}s</div>
                    <p className="mt-2 font-semibold leading-6">{response.promptText}</p>
                    <div className="mt-3 rounded bg-[var(--exam-surface-muted)] px-4 py-3 text-sm leading-6 text-[var(--exam-text-muted)]">
                      {response.transcript || 'No transcript was captured for this recording.'}
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          </div>
        </main>
      </div>
    </ExamUiBoundary>
  )
}
