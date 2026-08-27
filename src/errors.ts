export class DecisionTraceError extends Error {
  readonly exitCode: 1 | 2;
  readonly code: string;

  constructor(message: string, options?: { code?: string; exitCode?: 1 | 2 }) {
    super(message);
    this.name = "DecisionTraceError";
    this.code = options?.code ?? "DECISIONTRACE_ERROR";
    this.exitCode = options?.exitCode ?? 2;
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
