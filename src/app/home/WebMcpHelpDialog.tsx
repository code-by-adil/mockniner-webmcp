import type { ReactElement } from 'react';
import { X } from 'lucide-react';
import { CopyButton } from '@/shared/ui/CopyButton';
import { handleExamDialogBackdropClick, useExamNativeDialog } from '@/shared/ui/exam/useExamNativeDialog';

const SITE_URL = 'https://assessment-lab.dgkhan08.workers.dev/';
const PROMPT_SUGGESTIONS = [
  { label: 'GRE-style practice', text: `Open ${SITE_URL} in your browser. Create a 20-minute GRE-style diagnostic with verbal and quantitative questions and add it to my practice library. Let me answer and submit it myself.` },
  { label: 'IELTS Reading', text: `Open ${SITE_URL} in your browser. Create a 40-question IELTS Academic Reading practice test about renewable energy and make it available for me to take. Let me answer and submit it myself.` },
  { label: 'Another subject', text: `Open ${SITE_URL} in your browser. Create a six-question biology quiz with multiple choice and one short written answer, and add it to my practice library. Let me answer and submit it myself.` },
  { label: 'After you submit', text: 'Review the completed attempt I have open in MockNiner. Explain my mistakes and suggest what to practise next. If my submitted writing needs evaluation, add your feedback to the results.' },
];

export function WebMcpHelpDialog({ open, onClose }: { open: boolean; onClose: () => void }): ReactElement {
  const dialog = useExamNativeDialog({ open, onOpenChange: next => { if (!next) onClose(); } });

  return <dialog ref={dialog} aria-labelledby="agent-help-title" onClick={handleExamDialogBackdropClick}
    className="exam-native-dialog m-auto w-[min(42rem,calc(100vw-2rem))] max-h-[88vh] open:flex flex-col rounded-2xl border border-neutral-200 bg-white p-0 shadow-2xl overflow-hidden"
    style={{ maxWidth: '42rem' }}>
    <div className="flex shrink-0 items-start justify-between gap-3 border-b border-neutral-200 p-5 sm:px-6">
      <div>
        <h2 id="agent-help-title" className="text-lg font-semibold text-neutral-950">How to use MockNiner</h2>
        <p className="mt-1 text-sm text-neutral-600">Choose a test. Complete it here. Learn from your results.</p>
      </div>
      <button type="button" onClick={onClose} aria-label="Close dialog"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-neutral-600 hover:bg-neutral-100">
        <X size={20} aria-hidden="true" />
      </button>
    </div>
    <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-5 sm:p-6">
      <ol className="list-decimal space-y-3 pl-5 text-sm leading-relaxed text-neutral-600 marker:font-semibold marker:text-neutral-900">
        <li className="pl-1"><h3 className="font-semibold text-neutral-950">Choose a test—or ask for one</h3>
          Ready-made tests work without an agent. For new practice, open this site in a compatible agent browser and ask for an exam, a topic, or a skill you want to improve.
        </li>
        <li className="pl-1"><h3 className="font-semibold text-neutral-950">Complete and submit it here</h3>
          You answer the questions and submit your work. Use Continue practice to return to an unfinished attempt. Objective answers are scored by the app.
        </li>
        <li className="pl-1"><h3 className="font-semibold text-neutral-950">Ask for feedback</h3>
          Open a completed attempt in Practice history, then ask your agent to review it. Agent feedback requires your request; it does not arrive automatically.
        </li>
      </ol>

      <section aria-labelledby="example-prompts-title" className="space-y-3 border-t border-neutral-200 pt-5">
        <div>
          <h3 id="example-prompts-title" className="text-sm font-semibold text-neutral-950">Try a prompt</h3>
          <p className="mt-1 text-sm text-neutral-600">Copy a prompt into your agent chat. Change the subject, focus, or time to suit you.</p>
        </div>
        <div className="space-y-3">
          {PROMPT_SUGGESTIONS.map(prompt => <div key={prompt.label} className="rounded-xl border border-neutral-200 bg-neutral-50/60 p-4">
            <div className="mb-2 flex items-center justify-between gap-3">
              <h4 className="text-sm font-semibold text-neutral-900">{prompt.label}</h4>
              <CopyButton text={prompt.text} ariaLabel={`Copy prompt: ${prompt.label}`}
                className="min-h-9 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100" />
            </div>
            <p className="select-text break-words text-sm leading-relaxed text-neutral-700">{prompt.text}</p>
          </div>)}
        </div>
      </section>

      <div className="space-y-2 border-t border-neutral-200 pt-4 text-xs leading-relaxed text-neutral-600">
        <p>New tests and feedback require an agent browser with WebMCP support. <a href="https://learn.chatgpt.com/docs/webmcp" target="_blank" rel="noreferrer"
          className="font-medium underline underline-offset-2">Check compatible browsers and setup</a>.</p>
        <p>Practice is saved in this browser, not synced to an account. Use Local data to export a backup. These are practice tests, not official exams or official score predictions.</p>
      </div>
    </div>
  </dialog>;
}
