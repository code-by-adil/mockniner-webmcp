export function reportHandledError(
  error: unknown,
  context: Record<string, unknown>,
): void {
  console.error("[Assessment Lab]", {
    error,
    context,
  });
}
