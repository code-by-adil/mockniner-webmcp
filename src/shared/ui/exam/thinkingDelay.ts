export const THINKING_LOADER_STEP_DURATION_MS = 2000;
const THINKING_LOADER_STEP_COUNT = 4;
const THINKING_LOADER_FINAL_HOLD_MS = 1000;

// Keep the loader visible long enough to advance through every step
// and briefly hold on the last one before transitioning to results.
const MIN_THINKING_OVERLAY_MS =
  (THINKING_LOADER_STEP_COUNT - 1) * THINKING_LOADER_STEP_DURATION_MS +
  THINKING_LOADER_FINAL_HOLD_MS;

export async function waitForMinimumThinkingTime(
  startedAtMs: number,
  minMs = MIN_THINKING_OVERLAY_MS,
): Promise<void> {
  const elapsed = Date.now() - startedAtMs;
  const remaining = minMs - elapsed;
  if (remaining <= 0) return;
  await new Promise<void>((resolve) => {
    window.setTimeout(resolve, remaining);
  });
}
