// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  live: { getDatabaseFile: vi.fn(), sql: vi.fn() },
  stage: { sql: vi.fn(async () => []), overwriteDatabaseFile: vi.fn(), destroy: vi.fn(), deleteDatabaseFile: vi.fn() },
  inspect: vi.fn(), restore: vi.fn(), flush: vi.fn(),
}));
vi.mock('sqlocal', () => ({ SQLocal: class {
  constructor(config: { onConnect: () => void }) { config.onConnect(); return mocks.stage; }
} }));
vi.mock('./database/client', () => ({ getLocalDatabase: async () => mocks.live }));
vi.mock('./database/backupRepository', () => ({ BackupValidationError: class extends Error {}, inspectBackup: mocks.inspect, restoreBackup: mocks.restore }));
vi.mock('./saveCoordinator', () => ({ draftSaves: { flush: mocks.flush } }));
import { cancelBackupImport, downloadLocalBackup, hasArchivedDrafts, prepareBackupImport, requestBackupRestore, restorePendingBackup, RESTORE_PENDING_KEY, RESTORE_NOTICE_KEY } from './localBackup';

const file = () => new File(['SQLite format 3\0fixture'], 'practice.sqlite3');
beforeEach(() => {
  vi.resetAllMocks(); localStorage.clear(); sessionStorage.clear();
  mocks.stage.sql.mockResolvedValue([]);
  mocks.stage.destroy.mockResolvedValue(undefined);
  mocks.stage.deleteDatabaseFile.mockResolvedValue(undefined);
  mocks.live.getDatabaseFile.mockResolvedValue(file());
  mocks.inspect.mockResolvedValue({ practices: 1, submissions: 2, drafts: 3, recordings: 4 });
});

describe('learner-controlled backups', () => {
  it('reports retained recovery data without exposing storage keys or saved answers', async () => {
    mocks.live.sql.mockResolvedValueOnce([]).mockResolvedValueOnce([{ 1: 1 }]);
    expect(await hasArchivedDrafts()).toBe(false);
    expect(await hasArchivedDrafts()).toBe(true);
  });
  it('rejects non-SQLite and oversized files before touching storage', async () => {
    await expect(prepareBackupImport(new File(['not a database'], 'fake.sqlite3'))).rejects.toThrow('Choose a practice backup');
    const large = file(); Object.defineProperty(large, 'size', { value: 256 * 1024 * 1024 + 1 });
    await expect(prepareBackupImport(large)).rejects.toThrow('256 MB');
    expect(mocks.stage.overwriteDatabaseFile).not.toHaveBeenCalled();
  });
  it('inspects a separate staging database without requesting a restore', async () => {
    expect(await prepareBackupImport(file())).toEqual({ practices: 1, submissions: 2, drafts: 3, recordings: 4 });
    expect(mocks.inspect).toHaveBeenCalledWith(mocks.stage, mocks.live);
    expect(mocks.restore).not.toHaveBeenCalled();
    expect(localStorage.getItem(RESTORE_PENDING_KEY)).toBeNull();
    expect(mocks.stage.destroy).toHaveBeenCalled();
  });
  it('cleans a rejected staging file', async () => {
    mocks.inspect.mockRejectedValue(new Error('Invalid backup'));
    await expect(prepareBackupImport(file())).rejects.toThrow('could not be read');
    expect(mocks.stage.deleteDatabaseFile).toHaveBeenCalledWith(undefined, true);
  });
  it('does not race cancellation cleanup with a newly selected file', async () => {
    let finish!: () => void;
    mocks.stage.deleteDatabaseFile.mockReturnValueOnce(new Promise<void>(resolve => { finish = resolve; }));
    const cancel = cancelBackupImport();
    const prepare = prepareBackupImport(file());
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    expect(mocks.stage.overwriteDatabaseFile).not.toHaveBeenCalled();
    finish(); await cancel; await prepare;
    expect(mocks.stage.overwriteDatabaseFile).toHaveBeenCalledOnce();
  });
  it('does not request replacement when current work cannot be saved', async () => {
    mocks.flush.mockRejectedValue(new Error('Save failed'));
    await expect(requestBackupRestore()).rejects.toThrow('Save failed');
    expect(localStorage.getItem(RESTORE_PENDING_KEY)).toBeNull();
  });
  it('does not create a backup that silently omits pending failed saves', async () => {
    mocks.flush.mockRejectedValue(new Error('Save failed'));
    await expect(downloadLocalBackup()).rejects.toThrow('Save failed');
    expect(mocks.live.getDatabaseFile).not.toHaveBeenCalled();
  });
  it('does nothing on an ordinary startup', async () => {
    await restorePendingBackup();
    expect(mocks.restore).not.toHaveBeenCalled();
  });
  it('keeps confirmed intent on failure so a reload can retry without touching other local settings', async () => {
    localStorage.setItem(RESTORE_PENDING_KEY, 'pending');
    localStorage.setItem('preferred-volume', '0.6');
    mocks.restore.mockRejectedValueOnce(new Error('Storage full'));
    await expect(restorePendingBackup()).rejects.toThrow('current data is unchanged');
    expect(localStorage.getItem(RESTORE_PENDING_KEY)).toBe('pending');
    expect(localStorage.getItem('preferred-volume')).toBe('0.6');
    expect(mocks.stage.deleteDatabaseFile).not.toHaveBeenCalled();
    await restorePendingBackup();
    expect(localStorage.getItem(RESTORE_PENDING_KEY)).toBeNull();
    expect(localStorage.getItem('preferred-volume')).toBe('0.6');
    expect(sessionStorage.getItem(RESTORE_NOTICE_KEY)).toMatch(/Backup imported/);
  });
  it('cancels an unsuccessful restore without changing the live database', async () => {
    localStorage.setItem(RESTORE_PENDING_KEY, 'pending');
    await cancelBackupImport();
    expect(localStorage.getItem(RESTORE_PENDING_KEY)).toBeNull();
    expect(mocks.restore).not.toHaveBeenCalled();
  });
});
