let issues: string[] = [];
const listeners = new Set<() => void>();
export const storageHealth = {
  report(message: string) {
    if (issues.includes(message)) return;
    issues = [...issues, message];
    listeners.forEach(listener => listener());
  },
  getSnapshot: () => issues,
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
};
