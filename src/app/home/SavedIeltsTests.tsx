import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { PracticeContentDocument } from '@/domain/contentDocument';
import { getIeltsDrafts, type IeltsSession } from '@/domain/session';
import { SECTION_META } from '@/domain/sections';
import { DeletePracticeDialog } from './DeletePracticeDialog';

export function SavedIeltsTests({ documents, session, onStart, onDelete }: {
  documents: PracticeContentDocument[];
  session: IeltsSession;
  onStart: (document: PracticeContentDocument) => void;
  onDelete: (contentKey: string) => Promise<void>;
}) {
  const [deleting, setDeleting] = useState<PracticeContentDocument | null>(null);
  const saved = documents.filter(document => document.source === 'agent');
  if (!saved.length) return null;
  const count = deleting ? getIeltsDrafts(session).filter(draft => Object.values(draft.contentKeys ?? {}).includes(deleting.contentKey)).length : 0;
  return <section aria-label="Saved IELTS tests" className="space-y-3">
    <h3 className="text-sm font-semibold text-neutral-700">Saved IELTS tests</h3>
    <div className="divide-y rounded-xl border border-neutral-200 bg-white">
      {saved.map(document => <article key={document.contentKey} className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="min-w-0 flex-1"><h4 className="break-words text-sm font-semibold">{document.name}</h4><p className="mt-1 text-xs text-neutral-600">IELTS {SECTION_META[document.section].label}</p></div>
        <button type="button" onClick={() => onStart(document)} className="min-h-10 rounded-lg border px-3 text-sm font-semibold">Start new attempt</button>
        <button type="button" onClick={() => setDeleting(document)} aria-label={`Delete saved test ${document.name}`} className="min-h-10 rounded-lg p-2 text-neutral-500 hover:bg-red-50 hover:text-red-700"><Trash2 size={17} aria-hidden="true" /></button>
      </article>)}
    </div>
    {deleting && <DeletePracticeDialog action={{ title: deleting.name,
      description: `This test and its generated audio will be removed from your library. ${count ? `${count} unfinished ${count === 1 ? 'attempt uses' : 'attempts use'} it and will also be deleted, including any full IELTS attempt containing this test. ` : ''}Submitted results and their questions remain in history.`,
      remove: () => onDelete(deleting.contentKey),
    }} onClose={() => setDeleting(null)} />}
  </section>;
}
