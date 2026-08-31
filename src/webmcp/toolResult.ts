import type { z } from 'zod'

export type ToolIssue = {
  path: string
  message: string
}

export type ToolError = {
  code: string
  message: string
  retryable: boolean
  issues?: ToolIssue[]
}

export type ToolSuccess<T> = {
  ok: true
  data: T
  sideEffect?: {
    type: string
    visibleView?: string
  }
}

export type ToolFailure = {
  ok: false
  error: ToolError
}

export function toolFailure(
  code: string,
  message: string,
  retryable: boolean,
  issues?: ToolIssue[],
): ToolFailure {
  return {
    ok: false,
    error: {
      code,
      message,
      retryable,
      ...(issues?.length ? { issues } : {}),
    },
  }
}

export function zodIssues(error: z.ZodError): ToolIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.join('.') || 'input',
    message: issue.message,
  }))
}

export function throwIfCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw signal.reason ?? new DOMException('Tool execution was cancelled.', 'AbortError')
  }
}
