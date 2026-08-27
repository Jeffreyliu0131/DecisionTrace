import type { RedactedSemanticInput } from "../schemas/index.js";
import type { SemanticAnalyzer } from "./analyzer.js";

export class FakeSemanticAnalyzer implements SemanticAnalyzer {
  readonly name: string;
  readonly #response: unknown;
  readonly #error: Error | undefined;
  readonly #delayMilliseconds: number;

  constructor(options: {
    response?: unknown;
    error?: Error;
    delayMilliseconds?: number;
    name?: string;
  }) {
    this.name = options.name ?? "fake";
    this.#response = options.response ?? {
      schemaVersion: 1,
      inputId: "SIN-000000000000",
      candidates: [],
    };
    this.#error = options.error;
    this.#delayMilliseconds = options.delayMilliseconds ?? 0;
  }

  async analyze(
    _input: RedactedSemanticInput,
    signal: AbortSignal,
  ): Promise<unknown> {
    if (this.#delayMilliseconds > 0) {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, this.#delayMilliseconds);
        signal.addEventListener(
          "abort",
          () => {
            clearTimeout(timer);
            reject(new Error("Fake semantic analysis aborted"));
          },
          { once: true },
        );
      });
    }
    if (this.#error !== undefined) throw this.#error;
    return this.#response;
  }
}

export class ReplaySemanticAnalyzer implements SemanticAnalyzer {
  readonly name: string;
  readonly #response: unknown;

  constructor(response: unknown, name = "offline-replay") {
    this.name = name;
    this.#response = response;
  }

  analyze(
    _input: RedactedSemanticInput,
    signal: AbortSignal,
  ): Promise<unknown> {
    if (signal.aborted)
      return Promise.reject(new Error("Semantic replay aborted"));
    return Promise.resolve(this.#response);
  }
}
