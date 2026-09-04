import { useState } from 'react';
import { handleExamDialogBackdropClick, useExamNativeDialog } from '@/shared/ui/exam/useExamNativeDialog';

export type DeletePracticeAction = { title: string; description: string; remove: () => void | Promise<void> };

export function DeletePracticeDialog({ action, onClose }: { action: DeletePracticeAction; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useExamNativeDialog({ open: true, onOpenChange: open => { if (!open && !busy) onClose(); }, closedBy: busy ? 'none' : 'any' });
  const remove = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try { await action.remove(); onClose(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not delete this test. Try again.'); setBusy(false); }
  };
  return <dialog ref={ref} onClick={handleExamDialogBackdropClick} aria-labelledby="delete-practice-title"
    className="m-auto w-[min(92vw,28rem)] rounded-2xl border border-neutral-200 bg-white p-6 text-neutral-950 shadow-2xl backdrop:bg-black/55">
    <h2 id="delete-practice-title" className="text-lg font-bold">Delete {action.title}?</h2>
    <p className="mt-3 text-sm leading-6 text-neutral-600">{action.description}</p>
    {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
    <div className="mt-6 flex justify-end gap-2">
      <button type="button" disabled={busy} onClick={onClose} className="rounded-lg border px-4 py-2 text-sm font-semibold disabled:opacity-50">Cancel</button>
      <button type="button" disabled={busy} onClick={() => void remove()} className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50">{busy ? 'Deleting…' : 'Delete'}</button>
    </div>
  </dialog>;
}
