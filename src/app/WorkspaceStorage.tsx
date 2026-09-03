import { createContext, useCallback, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Database } from 'lucide-react';
import { useExamNativeDialog } from '@/shared/ui/exam/useExamNativeDialog';
import { draftSaves } from '@/infrastructure/saveCoordinator';
import { storageHealth } from '@/infrastructure/storageHealth';
import type { BackupSummary } from '@/infrastructure/database/backupRepository';
const backups = () => import('@/infrastructure/localBackup');
const countLabel = (count: number, label: string) => `${count} ${label}${count === 1 ? '' : 's'}`;

/** Acquire ownership before application hooks can read, migrate, or autosave. */
export function WorkspaceGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<'opening' | 'restoring' | 'restore-error' | 'owned' | 'blocked' | 'unsupported'>(() => navigator.locks ? 'opening' : 'unsupported');
  const [restoreError, setRestoreError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!navigator.locks) return;
    const controller = new AbortController();
    let release: (() => void) | undefined;
    const pending = setTimeout(() => setState('blocked'), 150);
    void navigator.locks.request('ielts-workspace-writer', { signal: controller.signal }, async () => {
      if (controller.signal.aborted) return;
      clearTimeout(pending);
      const held = new Promise<void>(resolve => { release = resolve; });
      try {
        const backup = await backups();
        if (controller.signal.aborted) return;
        if (localStorage.getItem(backup.RESTORE_PENDING_KEY)) setState('restoring');
        await backup.restorePendingBackup();
        if (!controller.signal.aborted) setState('owned');
      } catch (error) {
        if (!controller.signal.aborted) {
          setRestoreError(error instanceof Error ? error.message : 'The backup could not be imported.');
          setState('restore-error');
        }
      }
      await held;
    }).catch(error => { if (!controller.signal.aborted) { storageHealth.report(String(error)); setState('blocked'); } });
    return () => { clearTimeout(pending); controller.abort(); release?.(); };
  }, [retry]);
  if (state === 'owned') return children;
  if (state === 'restoring' || state === 'restore-error') return <main className="mx-auto max-w-lg px-6 py-24" aria-live="polite">
    <h1 className="text-2xl font-semibold">{state === 'restoring' ? 'Importing your backup…' : 'Backup import did not finish'}</h1>
    <p className="mt-4 leading-7">{state === 'restoring' ? 'Keep this tab open. Your practice will open when the import is complete.' : restoreError}</p>
    {state === 'restore-error' ? <div className="mt-6 flex flex-wrap gap-3">
      <button className="rounded-lg border px-4 py-2" onClick={() => { setState('opening'); setRetry(value => value + 1); }}>Retry import</button>
      <button className="rounded-lg border px-4 py-2" onClick={() => void backups().then(backup => backup.cancelBackupImport()).then(() => window.location.reload()).catch(error => setRestoreError(String(error)))}>Cancel import</button>
    </div> : null}
  </main>;
  return <main className="mx-auto max-w-lg px-6 py-24">
    <h1 className="text-2xl font-semibold">{state === 'opening' ? 'Opening your practice…' : state === 'unsupported' ? 'This browser does not support saved practice' : 'Practice is open in another tab'}</h1>
    <p className="mt-4 leading-7">{state === 'unsupported' ? 'Open MockNiner in an up-to-date browser with local storage enabled. Your saved data has not changed.' : 'Close the other MockNiner tab, then try again. Practice can be open in one tab at a time.'}</p>
    {state === 'blocked' ? <button className="mt-6 rounded-lg border px-4 py-2" onClick={() => { setState('opening'); setRetry(value => value + 1); }}>Try again</button> : null}
  </main>;
}

const StorageContext = createContext((_canImport: boolean) => {});
// Routine autosaves (including timer checkpoints) are not header notifications.
const getSaveError = () => draftSaves.getSnapshot().error;

export function StorageButton({ canImport = false }: { canImport?: boolean }) {
  const open = useContext(StorageContext);
  const saveError = useSyncExternalStore(draftSaves.subscribe, getSaveError, getSaveError);
  const issues = useSyncExternalStore(storageHealth.subscribe, storageHealth.getSnapshot, storageHealth.getSnapshot);
  const label = saveError ? 'Changes not saved' : issues.length ? 'Local data · recovery notice' : 'Local data';
  return <button type="button" onClick={() => open(canImport)} aria-label={label} title={label}
    className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2 py-2 text-xs ${saveError || issues.length ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-neutral-200 bg-white text-neutral-600'}`}>
    <Database size={15} aria-hidden="true" /><span className="hidden sm:inline">{label}</span>
  </button>;
}

export function StorageStatus({ children }: { children: ReactNode }) {
  const saves = useSyncExternalStore(draftSaves.subscribe, draftSaves.getSnapshot, draftSaves.getSnapshot);
  const issues = useSyncExternalStore(storageHealth.subscribe, storageHealth.getSnapshot, storageHealth.getSnapshot);
  const [persistent, setPersistent] = useState<boolean | null>(null);
  const [message, setMessage] = useState(() => {
    try { return sessionStorage.getItem('practice-restore-notice-v1') ?? ''; } catch { return ''; }
  });
  const [busy, setBusy] = useState<'export' | 'checking' | 'restore' | null>(null);
  const [open, setOpen] = useState(() => !!message);
  const [canImport, setCanImport] = useState(() => !!message);
  const [selected, setSelected] = useState<{ name: string; summary: BackupSummary } | null>(null);
  const show = useCallback((allowImport: boolean) => { setCanImport(allowImport); setOpen(true); }, []);
  const close = () => {
    if (busy) return;
    setOpen(false);
    if (selected) void backups().then(backup => backup.cancelBackupImport()).catch(() => {});
    setSelected(null);
    try { sessionStorage.removeItem('practice-restore-notice-v1'); } catch { /* Optional notice. */ }
  };
  const dialog = useExamNativeDialog({ open, onOpenChange: close, closedBy: busy ? 'none' : 'closerequest' });
  useEffect(() => {
    void backups().then(async backup => {
      setPersistent(await navigator.storage?.persisted?.() ?? false);
      if (await backup.hasArchivedDrafts()) storageHealth.report('An older unfinished attempt could not be restored. Export a backup to keep its saved data.');
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
    setBusy('export'); setMessage('');
    try {
      await (await backups()).downloadLocalBackup();
      setMessage('Backup download started. Keep the file somewhere safe; it contains private answers and recordings.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not export the backup. Please try again.'); }
    finally { setBusy(null); }
  };
  const chooseBackup = async (file: File) => {
    setSelected(null); setBusy('checking'); setMessage('Checking backup…');
    try {
      const summary = await (await backups()).prepareBackupImport(file);
      setSelected({ name: file.name, summary }); setMessage('');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not read this backup. Your current data has not been changed.'); }
    finally { setBusy(null); }
  };
  const importData = async () => {
    if (!selected) return;
    setBusy('restore'); setMessage('Opening your backup. Keep this tab open…');
    try { await (await backups()).requestBackupRestore(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not start the import.'); setBusy(null); }
  };
  return <StorageContext.Provider value={show}>{children}<dialog ref={dialog} aria-labelledby="local-data-title"
    onCancel={event => { if (busy) event.preventDefault(); }}
    className="exam-native-dialog m-auto w-[min(28rem,calc(100vw-2rem))] rounded-xl border border-neutral-200 bg-white p-0 text-sm text-neutral-800 shadow-xl backdrop:bg-black/40">
    <div className="flex items-center justify-between gap-4 border-b px-5 py-4"><h2 id="local-data-title" className="font-semibold">Local data</h2><button type="button" disabled={!!busy} onClick={close} className="rounded border px-3 py-1.5 text-xs disabled:opacity-50">Close</button></div>
    <div className="max-h-[70vh] space-y-4 overflow-y-auto p-5 leading-6 [overflow-wrap:anywhere]">
      <p role="status">{saves.error ?? (saves.pending ? 'Saving your latest changes. Keep this tab open.' : 'Changes are saved in this browser, on this device.')}</p>
      {saves.error ? <button disabled={!!busy} className="rounded border px-3 py-2 disabled:opacity-50" onClick={() => void draftSaves.flush().catch(() => {})}>Retry saving</button> : null}
      <p>Clearing browser data removes your work. Export a backup to keep it safe or move it to another browser.</p>
      <p>Your backup includes practice sets, progress, saved recordings, audio, results, and feedback. Downloaded speech models are excluded. The file stays on your device and is not encrypted.</p>
      <div className="flex flex-wrap gap-2">
        <button disabled={!!busy} className="rounded bg-neutral-900 px-3 py-2 text-white disabled:opacity-50" onClick={() => void exportData()}>{busy === 'export' ? 'Preparing backup…' : 'Export backup'}</button>
        {canImport ? <label className={`relative rounded border px-3 py-2 focus-within:outline-2 focus-within:outline-offset-2 ${busy ? 'opacity-50' : 'cursor-pointer'}`}>
          Import backup<input type="file" aria-label="Import backup" accept=".sqlite3,.sqlite,.db,application/x-sqlite3" disabled={!!busy}
            className="absolute inset-0 w-full cursor-pointer opacity-0" onChange={event => {
              const file = event.currentTarget.files?.[0]; event.currentTarget.value = '';
              if (file) void chooseBackup(file);
            }} />
        </label> : null}
      </div>
      {!canImport ? <p className="text-neutral-500">Return to the practice library to import a backup.</p> : null}
      {selected ? <section aria-labelledby="confirm-import-title" className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-4">
        <h3 id="confirm-import-title" className="font-semibold">Replace this browser's saved practice?</h3>
        <p>{selected.name}</p>
        <p>{countLabel(selected.summary.practices, 'practice set')} · {countLabel(selected.summary.drafts, 'draft')} · {countLabel(selected.summary.submissions, 'submission')} · {countLabel(selected.summary.recordings, 'recording')}</p>
        <p>Importing replaces all practice saved in this browser. Export a backup first to keep your current work. The app will reload after import.</p>
        <div className="flex flex-wrap gap-2">
          <button disabled={!!busy} className="rounded bg-neutral-900 px-3 py-2 text-white disabled:opacity-50" onClick={() => void importData()}>Replace and import</button>
          <button disabled={!!busy} className="rounded border px-3 py-2 disabled:opacity-50" onClick={() => {
            setSelected(null); setMessage('Import cancelled. Your data has not been changed.');
            void backups().then(backup => backup.cancelBackupImport()).catch(() => {});
          }}>Cancel</button>
        </div>
      </section> : null}
      {message ? <p role="status">{message}</p> : null}
      {issues.length ? <div role="alert"><p className="font-semibold">Some saved work could not be opened. Its original data is included in backups.</p><ul className="mt-2 list-disc space-y-1 pl-4">{issues.map(issue => <li key={issue}>{issue}</li>)}</ul></div> : null}
      <details className="border-t pt-3"><summary className="cursor-pointer text-neutral-500">Storage protection</summary>
      <p className="mt-2">{persistent === null ? 'Checking storage protection…' : persistent ? 'Your browser protects this saved practice from automatic cleanup. Clearing site data will still remove it.' : 'Your browser may clear saved practice when device storage runs low. Request protection or export a backup.'}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {!persistent ? <button className="rounded border px-3 py-2" onClick={() => void navigator.storage.persist().then(setPersistent).catch(error => setMessage(String(error)))}>Request storage protection</button> : null}
      </div></details>
    </div>
  </dialog></StorageContext.Provider>;
}
