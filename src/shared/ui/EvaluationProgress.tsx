import { LoaderCircle, MessageSquareText, X } from 'lucide-react'
import { useEvaluationActivity } from '@/application/evaluationActivityContext'
import { CopyButton } from './CopyButton'

export function EvaluationProgress() {
  const state = useEvaluationActivity()
  const activity = state?.activity
  if (!activity) return null
  const working = activity.status === 'working'
  const subject = activity.kind === 'writing' ? 'writing' : activity.kind === 'speaking' ? 'Speaking transcript' : 'submission'
  const retryRequest = `Continue evaluating my ${activity.kind === 'assessment' ? 'practice' : `IELTS ${activity.kind}`} submission with attempt ID ${activity.attemptId}. Check whether feedback was saved, then add any missing feedback to that same attempt.`
  return <aside aria-label="Evaluation progress" className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-md rounded-xl border border-neutral-200 bg-white p-5 text-neutral-950 shadow-lg sm:left-auto sm:right-6 sm:mx-0 sm:w-96">
    <div className="flex items-start gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-700">
        {working ? <LoaderCircle aria-hidden="true" size={22} className="motion-safe:animate-spin" /> : <MessageSquareText aria-hidden="true" size={22} />}
      </div>
      <div role="status" className="min-w-0 flex-1">
        <h2 className="font-semibold">{working ? `Evaluating your ${subject}` : activity.status === 'failed' ? 'Feedback could not be saved' : 'Still waiting for feedback'}</h2>
        <p className="mt-1 text-sm leading-6 text-neutral-600">{working
          ? 'Your agent has started reviewing your responses. Feedback will appear when it is saved.'
          : activity.status === 'failed' ? 'Your submission is safe. Ask your agent to check the error and finish saving its feedback.'
          : 'Feedback has not arrived yet. Check your agent chat, or ask it to continue. Your submission is safe.'}</p>
      </div>
      <button type="button" aria-label="Dismiss evaluation notice" title="Hide this notice. This does not stop your agent." onClick={state.dismiss} className="rounded p-1 text-neutral-500 hover:bg-neutral-100"><X size={16} /></button>
    </div>
    {!working ? <CopyButton text={retryRequest} label="Copy follow-up request" className="mt-4 rounded bg-neutral-950 px-3 py-2 text-sm font-semibold text-white" /> : null}
  </aside>
}
