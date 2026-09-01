export function reportWebHandledProductFailure(
  error: unknown,
  context?: unknown,
  metadata?: unknown,
): void {
  console.error("[Assessment Lab] handled product failure", {
    error,
    context,
    metadata,
  });
}
