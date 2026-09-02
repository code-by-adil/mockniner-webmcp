export type ValidationIssue = { path: string; message: string };

export class ApplicationError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly issues?: ValidationIssue[];
  constructor(
    code: string,
    message: string,
    retryable = false,
    issues?: ValidationIssue[],
  ) {
    super(message);
    this.name = "ApplicationError";
    this.code = code;
    this.retryable = retryable;
    this.issues = issues;
  }
}
