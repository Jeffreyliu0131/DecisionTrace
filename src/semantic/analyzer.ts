import type { RedactedSemanticInput, SemanticCost } from "../schemas/index.js";

export class SemanticAnalyzerAbstentionError extends Error {
  readonly code: string;
  readonly recovery: string;

  constructor(code: string, message: string, recovery: string) {
    super(message);
    this.name = "SemanticAnalyzerAbstentionError";
    this.code = code;
    this.recovery = recovery;
  }
}

export interface SemanticAnalyzer {
  readonly name: string;
  analyze(input: RedactedSemanticInput, signal: AbortSignal): Promise<unknown>;
  costSnapshot?(): SemanticCost;
}
