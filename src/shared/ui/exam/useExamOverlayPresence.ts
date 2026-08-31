import { useEffect, useState } from "react";

/** Keep in sync with exit durations in `index.css` (dialogs ~180ms, popovers ~120ms). */
export const EXAM_OVERLAY_EXIT_MS = 200;

/**
 * Keeps an overlay mounted briefly after `open` becomes false so CSS exit
 * transitions (`@starting-style` / `allow-discrete`) can finish.
 */
export function useExamOverlayPresence(
  open: boolean,
  exitMs: number = EXAM_OVERLAY_EXIT_MS,
): boolean {
  const [present, setPresent] = useState(open);

  useEffect(() => {
    if (open) {
      setPresent(true);
      return;
    }

    if (!present) return;

    const id = window.setTimeout(() => {
      setPresent(false);
    }, exitMs);

    return () => window.clearTimeout(id);
  }, [exitMs, open, present]);

  return open || present;
}
