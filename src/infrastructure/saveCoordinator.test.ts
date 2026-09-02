import { describe, expect, it, vi } from 'vitest';
import { createSaveCoordinator } from './saveCoordinator';

describe('shared save coordinator', () => {
  it('coalesces edits but drains newer writes arriving during a save', async () => {
    const queue = createSaveCoordinator();
    const calls: string[] = [];
    queue.enqueue('native', async () => { calls.push('obsolete'); });
    queue.enqueue('native', async () => { calls.push('latest'); queue.enqueue('native', async () => { calls.push('newer'); }); });
    queue.enqueue('assessment', async () => { calls.push('assessment'); });
    await queue.flush();
    expect(calls).toEqual(['latest', 'newer', 'assessment']);
    expect(queue.getSnapshot()).toEqual({ pending: false, error: null });
  });
  it('retains a failed write for an explicit retry without reporting saved', async () => {
    const queue = createSaveCoordinator();
    const save = vi.fn().mockRejectedValueOnce(new Error('Quota exceeded')).mockResolvedValue(undefined);
    queue.enqueue('draft', save);
    await expect(queue.flush()).rejects.toThrow('Quota');
    expect(queue.getSnapshot()).toEqual({ pending: true, error: 'Quota exceeded' });
    await queue.flush();
    expect(save).toHaveBeenCalledTimes(2);
    expect(queue.getSnapshot().pending).toBe(false);
  });
});
