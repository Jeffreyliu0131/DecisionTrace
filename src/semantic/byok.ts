import type {
  ReadableStreamDefaultReader,
  ReadableStreamReadResult,
} from "node:stream/web";

import { DecisionTraceError } from "../errors.js";
import {
  byokSemanticConfigSchema,
  byokSemanticProviderResponseSchema,
  byokSemanticRequestSchema,
  type ByokSemanticConfig,
  type RedactedSemanticInput,
  type SemanticCost,
} from "../schemas/index.js";
import {
  SemanticAnalyzerAbstentionError,
  type SemanticAnalyzer,
} from "./analyzer.js";

const SUPPORTED_AUTH_HEADERS = new Set([
  "authorization",
  "api-key",
  "x-api-key",
  "x-goog-api-key",
]);

function roundedCost(value: number): number {
  return Math.round(value * 100_000_000) / 100_000_000;
}

function estimatedTokens(serialized: string): number {
  // Conservative byte-based estimate for transmitted JSON; not a billing bound.
  return Buffer.byteLength(serialized, "utf8");
}

function calculateCost(
  inputTokens: number,
  outputTokens: number,
  budget: ByokSemanticConfig["budget"],
): number {
  return (
    (inputTokens * budget.inputUsdPerMillionTokens) / 1_000_000 +
    (outputTokens * budget.outputUsdPerMillionTokens) / 1_000_000
  );
}

function responseTooLarge(): SemanticAnalyzerAbstentionError {
  return new SemanticAnalyzerAbstentionError(
    "SEMANTIC_BYOK_RESPONSE_TOO_LARGE",
    "BYOK provider response exceeds the configured byte limit.",
    "Reduce provider output or raise responseMaxBytes within the hard 4 MiB schema limit.",
  );
}

async function readBoundedResponse(
  response: Response,
  maximumBytes: number,
): Promise<Uint8Array> {
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    await response.body?.cancel().catch(() => undefined);
    throw responseTooLarge();
  }
  if (response.body === null) return new Uint8Array();

  const reader =
    response.body.getReader() as ReadableStreamDefaultReader<Uint8Array>;
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const readResult: ReadableStreamReadResult<Uint8Array> =
        await reader.read();
      if (readResult.done) break;
      const { value } = readResult;
      total += value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel().catch(() => undefined);
        throw responseTooLarge();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

export function validateByokEndpoint(
  config: ByokSemanticConfig,
  mode: "local" | "cloud",
): URL {
  const endpoint = new URL(config.endpoint);
  if (endpoint.username || endpoint.password || endpoint.hash) {
    throw new DecisionTraceError(
      "BYOK endpoint must not contain credentials or a URL fragment.",
      { code: "SEMANTIC_BYOK_ENDPOINT_INVALID" },
    );
  }
  if (!SUPPORTED_AUTH_HEADERS.has(config.authHeader.toLowerCase())) {
    throw new DecisionTraceError(
      "BYOK authHeader must be Authorization, api-key, x-api-key, or x-goog-api-key.",
      { code: "SEMANTIC_BYOK_HEADER_INVALID" },
    );
  }
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(
    endpoint.hostname,
  );
  if (mode === "cloud" && endpoint.protocol !== "https:") {
    throw new DecisionTraceError("Cloud BYOK endpoint must use HTTPS.", {
      code: "SEMANTIC_BYOK_ENDPOINT_INVALID",
    });
  }
  if (
    mode === "local" &&
    (!loopback || !["http:", "https:"].includes(endpoint.protocol))
  ) {
    throw new DecisionTraceError(
      "Local BYOK endpoint must use HTTP(S) on localhost, 127.0.0.1, or ::1.",
      { code: "SEMANTIC_BYOK_ENDPOINT_INVALID" },
    );
  }
  return endpoint;
}

export class HttpJsonByokSemanticAnalyzer implements SemanticAnalyzer {
  readonly name: string;
  readonly #config: ByokSemanticConfig;
  readonly #endpoint: URL;
  readonly #environment: NodeJS.ProcessEnv;
  readonly #fetch: typeof fetch;
  #cost: SemanticCost = { status: "not_applicable", currency: "USD" };

  constructor(options: {
    config: unknown;
    mode: "local" | "cloud";
    environment?: NodeJS.ProcessEnv;
    fetchImplementation?: typeof fetch;
  }) {
    this.#config = byokSemanticConfigSchema.parse(options.config);
    this.#endpoint = validateByokEndpoint(this.#config, options.mode);
    this.#environment = options.environment ?? process.env;
    this.#fetch = options.fetchImplementation ?? fetch;
    this.name = `byok-http:${this.#config.model}`;
  }

  costSnapshot(): SemanticCost {
    return { ...this.#cost };
  }

  async analyze(
    input: RedactedSemanticInput,
    signal: AbortSignal,
  ): Promise<unknown> {
    const request = byokSemanticRequestSchema.parse({
      protocol: "decisiontrace.semantic.v1",
      model: this.#config.model,
      limits: {
        maxOutputTokens: this.#config.budget.maxOutputTokens,
      },
      input,
    });
    const body = JSON.stringify(request);
    const inputTokens = estimatedTokens(body);
    const rawEstimatedMaxUsd = calculateCost(
      inputTokens,
      this.#config.budget.maxOutputTokens,
      this.#config.budget,
    );
    const estimatedMaxUsd = roundedCost(rawEstimatedMaxUsd);
    this.#cost = {
      status: "estimated",
      currency: "USD",
      estimatedInputTokens: inputTokens,
      maxOutputTokens: this.#config.budget.maxOutputTokens,
      estimatedMaxUsd,
    };
    if (rawEstimatedMaxUsd > this.#config.budget.maxRequestUsd) {
      throw new SemanticAnalyzerAbstentionError(
        "SEMANTIC_BYOK_BUDGET_EXCEEDED",
        `BYOK preflight maximum ${estimatedMaxUsd.toFixed(8)} USD exceeds the configured per-request budget.`,
        "Increase maxRequestUsd only after reviewing explicit model pricing and output-token bounds.",
      );
    }
    const apiKey = this.#environment[this.#config.apiKeyEnv]?.trim();
    if (!apiKey) {
      throw new SemanticAnalyzerAbstentionError(
        "SEMANTIC_BYOK_KEY_MISSING",
        `BYOK environment variable '${this.#config.apiKeyEnv}' is missing or empty; no request was sent.`,
        "Set the named environment variable only when a real provider call and budget are explicitly authorized.",
      );
    }

    let response: Response;
    try {
      response = await this.#fetch(this.#endpoint, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          [this.#config.authHeader]: `${this.#config.authPrefix}${apiKey}`,
        },
        body,
        redirect: "error",
        signal,
      });
    } catch (error) {
      if (signal.aborted) throw error;
      throw new SemanticAnalyzerAbstentionError(
        "SEMANTIC_BYOK_NETWORK_ERROR",
        "BYOK provider request failed before a valid response was received.",
        "Check the explicit endpoint locally; DecisionTrace does not retry paid requests automatically.",
      );
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new SemanticAnalyzerAbstentionError(
        "SEMANTIC_BYOK_HTTP_ERROR",
        `BYOK provider returned HTTP ${response.status}; response content was not accepted.`,
        "Inspect provider-side logs and credentials; DecisionTrace does not include response bodies in diagnostics.",
      );
    }
    const bytes = await readBoundedResponse(
      response,
      this.#config.responseMaxBytes,
    );
    const decoded = new TextDecoder().decode(bytes);
    if (decoded.includes(apiKey)) {
      throw new SemanticAnalyzerAbstentionError(
        "SEMANTIC_BYOK_SECRET_ECHO",
        "BYOK provider response contained the configured credential; output was discarded.",
        "Inspect the provider bridge and rotate the exposed credential before another live call.",
      );
    }
    let output: unknown;
    try {
      output = JSON.parse(decoded);
    } catch {
      throw new SemanticAnalyzerAbstentionError(
        "SEMANTIC_BYOK_RESPONSE_INVALID_JSON",
        "BYOK provider response is not valid JSON.",
        "Return the DecisionTrace semantic provider response schema without prose or code fences.",
      );
    }
    const parsed = byokSemanticProviderResponseSchema.safeParse(output);
    if (!parsed.success) {
      throw new SemanticAnalyzerAbstentionError(
        "SEMANTIC_BYOK_RESPONSE_INVALID",
        "BYOK provider response did not match the required response schema; output was discarded.",
        "Return schemaVersion 1, the current inputId, bounded candidates, and required token usage.",
      );
    }
    const rawReportedUsd =
      parsed.data.usage.costUsd ??
      calculateCost(
        parsed.data.usage.inputTokens,
        parsed.data.usage.outputTokens,
        this.#config.budget,
      );
    const reportedUsd = roundedCost(rawReportedUsd);
    this.#cost = {
      ...this.#cost,
      status: "reported",
      reportedInputTokens: parsed.data.usage.inputTokens,
      reportedOutputTokens: parsed.data.usage.outputTokens,
      reportedUsd,
    };
    if (parsed.data.usage.outputTokens > this.#config.budget.maxOutputTokens) {
      throw new SemanticAnalyzerAbstentionError(
        "SEMANTIC_BYOK_OUTPUT_LIMIT_EXCEEDED",
        "BYOK provider reported output tokens above the requested maximum; output was discarded.",
        "Verify that the provider bridge enforces limits.maxOutputTokens before another live call.",
      );
    }
    if (rawReportedUsd > this.#config.budget.maxRequestUsd) {
      throw new SemanticAnalyzerAbstentionError(
        "SEMANTIC_BYOK_REPORTED_COST_EXCEEDED",
        "BYOK provider reported a cost above the configured per-request budget; output was discarded.",
        "Review provider billing and token enforcement before another live call.",
      );
    }
    return parsed.data;
  }
}
