import { SQLocal } from 'sqlocal';
import { getLocalDatabase } from './database/client';
import { BackupValidationError, inspectBackup, restoreBackup } from './database/backupRepository';
import { draftSaves } from './saveCoordinator';

const STAGING_PATH = 'practice-import.sqlite3';
export const RESTORE_PENDING_KEY = 'practice-restore-pending-v1';
export const RESTORE_NOTICE_KEY = 'practice-restore-notice-v1';
const LEGACY_KEYS = ['ielts-practice-session-v4', 'assessment-runtime-session-v3'];
const MAX_BACKUP_BYTES = 256 * 1024 * 1024;
// Closing the dialog and immediately choosing another file must not race cleanup.
let stagingWork: Promise<unknown> = Promise.resolve();
function queueStaging<T>(work: () => Promise<T>): Promise<T> {
  const next = stagingWork.then(work, work);
  stagingWork = next.catch(() => {});
  return next;
}

async function openStaging() {
  let connected!: () => void;
  const ready = new Promise<void>(resolve => { connected = resolve; });
  const db = new SQLocal({ databasePath: STAGING_PATH,
    onInit: sql => [sql`PRAGMA trusted_schema = OFF`, sql`PRAGMA foreign_keys = ON`], onConnect: connected });
  // sql also surfaces initialization failures instead of waiting forever for onConnect.
  try {
    await db.sql`SELECT 1`;
    await ready;
    return db;
  } catch (error) {
    await db.destroy(true).catch(() => {});
    throw error;
  }
}

async function prepare(file: File) {
  if (file.size > MAX_BACKUP_BYTES) throw new Error('This backup is larger than the 256 MB import limit. Your current data has not been changed.');
  const header = new TextDecoder().decode(await file.slice(0, 16).arrayBuffer());
  if (header !== 'SQLite format 3\0') throw new Error('Choose a practice backup (.sqlite3 file). This file is not a SQLite backup.');
  const staging = await openStaging();
  try {
    await staging.overwriteDatabaseFile(file);
    return await inspectBackup(staging, await getLocalDatabase());
  } catch (error) {
    await staging.deleteDatabaseFile(undefined, true).catch(() => {});
    throw error instanceof BackupValidationError ? error
      : new Error('This backup could not be read. It may be damaged or there may not be enough free storage. Your current data has not been changed.');
  } finally { await staging.destroy(true).catch(() => {}); }
}

export const prepareBackupImport = (file: File) => queueStaging(() => prepare(file));

export async function downloadLocalBackup() {
  await draftSaves.flush();
  const file = await (await getLocalDatabase()).getDatabaseFile();
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = `practice-backup-${new Date().toISOString().replaceAll(':', '-').replace(/\.\d{3}Z$/, 'Z')}.sqlite3`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export async function requestBackupRestore() {
  await draftSaves.flush();
  localStorage.setItem(RESTORE_PENDING_KEY, 'pending');
  window.location.reload();
}

/** Runs under the workspace lock, before React practice hooks or WebMCP mount. */
export async function restorePendingBackup() {
  if (localStorage.getItem(RESTORE_PENDING_KEY) !== 'pending') return;
  const staging = await openStaging();
  try {
    try {
      await restoreBackup(staging, await getLocalDatabase());
    } catch (error) {
      throw error instanceof BackupValidationError ? error
        : new Error('The backup could not be saved. Your current data is unchanged. Check available storage, then retry or cancel.');
    }
    // Do not let a previous browser's legacy drafts reappear after replacement.
    for (const key of LEGACY_KEYS) localStorage.removeItem(key);
    localStorage.removeItem(RESTORE_PENDING_KEY);
    try { sessionStorage.setItem(RESTORE_NOTICE_KEY, 'Backup imported. Your saved practice is ready.'); } catch { /* Restoration does not depend on a notice. */ }
    await staging.deleteDatabaseFile(undefined, true).catch(() => {});
  } finally { await staging.destroy(true).catch(() => {}); }
}

export const cancelBackupImport = () => queueStaging(async () => {
  localStorage.removeItem(RESTORE_PENDING_KEY);
  const staging = await openStaging();
  try { await staging.deleteDatabaseFile(undefined, true); }
  finally { await staging.destroy(true).catch(() => {}); }
});
