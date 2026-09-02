/** One ordered writer for both interfaces. A failed save stays pending for retry. */
export function createSaveCoordinator() {
  const pending = new Map<string, () => Promise<void>>();
  const listeners = new Set<() => void>();
  let running: Promise<void> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let state: { pending: boolean; error: string | null } = { pending: false, error: null };
  const publish = (error: string | null = null) => {
    state = { pending: pending.size > 0, error };
    listeners.forEach(listener => listener());
  };
  const flush = async (): Promise<void> => {
    clearTimeout(timer);
    timer = undefined;
    if (running) { await running; return flush(); }
    running = (async () => {
      while (pending.size) {
        const [key, save] = pending.entries().next().value!;
        try {
          await save();
          if (pending.get(key) === save) pending.delete(key);
          publish();
        } catch (error) {
          publish(error instanceof Error ? error.message : 'Your latest changes could not be saved.');
          throw error;
        }
      }
    })();
    try { await running; } finally { running = undefined; }
  };
  return {
    reportFailure(error: unknown) { publish(error instanceof Error ? error.message : String(error)); },
    enqueue(key: string, save: () => Promise<void>) {
      pending.set(key, save);
      publish(state.error);
      // Coalesce keystrokes and timer updates, without postponing a save forever.
      if (!timer) timer = setTimeout(() => { timer = undefined; void flush().catch(() => {}); }, 250);
    },
    flush,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    getSnapshot: () => state,
  };
}

export const draftSaves = createSaveCoordinator();
