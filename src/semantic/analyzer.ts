import type { RedactedSemanticInput } from "../schemas/index.js";

export interface SemanticAnalyzer {
  readonly name: string;
  analyze(input: RedactedSemanticInput, signal: AbortSignal): Promise<unknown>;
}
