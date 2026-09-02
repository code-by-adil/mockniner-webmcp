import { createContext, useCallback, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Database } from 'lucide-react';
import { useExamNativeDialog } from '@/shared/ui/exam/useExamNativeDialog';
import { draftSaves } from '@/infrastructure/saveCoordinator';
import { storageHealth } from '@/infrastructure/storageHealth';
const getLocalDatabase = async () => (await import('@/infrastructure/database/client')).getLocalDatabase();

/** Acquire ownership before application hooks can read, migrate, or autosave. */
export function WorkspaceGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<'opening' | 'owned' | 'blocked' | 'unsupported'>(() => navigator.locks ? 'opening' : 'unsupported');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!navigator.locks) return;
    const controller = new AbortController();
    let release: (() => void) | undefined;
    const pending = setTimeout(() => setState('blocked'), 150);
    void navigator.locks.request('ielts-workspace-writer', { signal: controller.signal }, async () => {
      if (controller.signal.aborted) return;
      clearTimeout(pending);
      setState('owned');
      await new Promise<void>(resolve => { release = resolve; });
    }).catch(error => { if (!controller.signal.aborted) { storageHealth.report(String(error)); setState('blocked'); } });
    return () => { clearTimeout(pending); controller.abort(); release?.(); };
  }, [retry]);
  if (state === 'owned') return children;
  return <main className="mx-auto max-w-lg px-6 py-24">
    <h1 className="text-2xl font-semibold">{state === 'opening' ? 'Opening your practice…' : state === 'unsupported' ? 'This browser cannot safely edit local practice' : 'Practice is open in another tab'}</h1>
    <p className="mt-4 leading-7">{state === 'unsupported' ? 'Use a browser that supports Web Locks and local file storage. Your data has not been changed.' : 'Only one tab can edit this local workspace at a time. Close the other practice tab, then try again.'}</p>
    {state === 'blocked' ? <button className="mt-6 rounded-lg border px-4 py-2" onClick={() => { setState('opening'); setRetry(value => value + 1); }}>Try again</button> : null}
  </main>;
}

const StorageContext = createContext(() => {});

export function StorageButton() {
  const open = useContext(StorageContext);
  const saves = useSyncExternalStore(draftSaves.subscribe, draftSaves.getSnapshot, draftSaves.getSnapshot);
  const issues = useSyncExternalStore(storageHealth.subscribe, storageHealth.getSnapshot, storageHealth.getSnapshot);
  const label = saves.error ? 'Changes not saved' : saves.pending ? 'Saving…' : issues.length ? 'Local data · recovery notice' : 'Local data';
  return <button type="button" onClick={open} aria-label={label} title={label}
    className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2 py-2 text-xs ${saves.error || issues.length ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-neutral-200 bg-white text-neutral-600'}`}>
    <Database size={15} aria-hidden="true" /><span className="hidden sm:inline">{label}</span>
  </button>;
}

export function StorageStatus({ children }: { children: ReactNode }) {
  const saves = useSyncExternalStore(draftSaves.subscribe, draftSaves.getSnapshot, draftSaves.getSnapshot);
  const issues = useSyncExternalStore(storageHealth.subscribe, storageHealth.getSnapshot, storageHealth.getSnapshot);
  const [persistent, setPersistent] = useState<boolean | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const show = useCallback(() => setOpen(true), []);
  const dialog = useExamNativeDialog({ open, onOpenChange: setOpen, closedBy: 'closerequest' });
  useEffect(() => {
    void getLocalDatabase().then(async db => {
      setPersistent(await navigator.storage?.persisted?.() ?? false);
      const archived = await db.sql<{ name: string }>`SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'legacy_%'`;
      if (archived.length) storageHealth.report('Older assessment tables were preserved. They are included in your database export, but cannot be opened by this version.');
      const imports = await db.sql<{ storage_key: string }>`SELECT storage_key FROM storage_imports WHERE status = 'unavailable'`;
      for (const row of imports) storageHealth.report(`${row.storage_key}: A legacy draft could not be imported. Its original data is included in local exports.`);
    }).catch(error => setMessage(String(error)));
  }, []);
  useEffect(() => {
    if (!saves.pending) return;
    const protect = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    const flush = () => { if (document.visibilityState === 'hidden') void draftSaves.flush().catch(() => {}); };
    window.addEventListener('beforeunload', protect);
    document.addEventListener('visibilitychange', flush);
    return () => { window.removeEventListener('beforeunload', protect); document.removeEventListener('visibilitychange', flush); };
  }, [saves.pending]);
  const exportData = async () => {
    setBusy(true); setMessage('');
    try {
      await draftSaves.flush();
      const file = await (await getLocalDatabase()).getDatabaseFile();
      const url = URL.createObjectURL(file);
      const link = document.createElement('a');
      link.href = url; link.download = `practice-backup-${new Date().toISOString().slice(0, 10)}.sqlite3`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
      setMessage('Backup downloaded. It contains private answers and recordings; keep it somewhere safe.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not export the database.'); }
    finally { setBusy(false); }
  };
  return <StorageContext.Provider value={show}>{children}<dialog ref={dialog} aria-labelledby="local-data-title"
    className="exam-native-dialog m-auto w-[min(28rem,calc(100vw-2rem))] rounded-xl border border-neutral-200 bg-white p-0 text-sm text-neutral-800 shadow-xl backdrop:bg-black/40">
    <div className="flex items-center justify-between gap-4 border-b px-5 py-4"><h2 id="local-data-title" className="font-semibold">Local data</h2><button type="button" onClick={() => setOpen(false)} className="rounded border px-3 py-1.5 text-xs">Close</button></div>
    <div className="max-h-[70vh] space-y-4 overflow-y-auto p-5 leading-6 [overflow-wrap:anywhere]">
      <p role="status">{saves.error ?? (saves.pending ? 'Saving your latest changes. Keep this tab open.' : 'Changes are saved in this browser, on this device.')}</p>
      <p>{persistent === null ? 'Checking storage protection…' : persistent ? 'The browser has granted persistent storage. Clearing site data still removes your work.' : 'The browser has not granted persistent storage. It may remove local data under storage pressure. Export important work.'}</p>
      <p>The backup includes saved practice, drafts, recordings, submissions, feedback, activity and retained recovery data. Downloaded voice-model caches are separate. There is no cloud backup or in-app restore yet.</p>
      {issues.length ? <div role="alert"><p className="font-semibold">Some records need recovery; their original data has been kept.</p><ul className="mt-2 list-disc space-y-1 pl-4">{issues.map(issue => <li key={issue}>{issue}</li>)}</ul></div> : null}
      <div className="flex flex-wrap gap-2">
        {saves.error ? <button className="rounded border px-3 py-2" onClick={() => void draftSaves.flush().catch(() => {})}>Retry saving</button> : null}
        {!persistent ? <button className="rounded border px-3 py-2" onClick={() => void navigator.storage.persist().then(setPersistent).catch(error => setMessage(String(error)))}>Request storage protection</button> : null}
        <button disabled={busy} className="rounded border px-3 py-2 disabled:opacity-50" onClick={() => void exportData()}>{busy ? 'Preparing backup…' : 'Export local data'}</button>
      </div>
      {message ? <p role="status">{message}</p> : null}
    </div>
  </dialog></StorageContext.Provider>;
}
