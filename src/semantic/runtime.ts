import type { FindingDraft } from "../findings/types.js";
import {
  semanticCandidateSchema,
  semanticProviderResponseSchema,
  semanticStageSchema,
  type Contract,
  type Diagnostic,
  type SemanticCandidate,
  type SemanticMode,
  type SemanticStage,
  type Severity,
  type SourceSpan,
} from "../schemas/index.js";
import { validationMessage } from "../schemas/validation.js";
import { stableHash } from "../utils/hash.js";
import {
  SemanticAnalyzerAbstentionError,
  type SemanticAnalyzer,
} from "./analyzer.js";
import type { SemanticInputContext } from "./redaction.js";

const SEVERITY_RANK: Record<Severity, number> = {
  critical: 5,
  high: 4,
  medium: 3,
  low: 2,
  info: 1,
};

export type SemanticRunResult = {
  stage: SemanticStage;
  findingDrafts: FindingDraft[];
  diagnostics: Diagnostic[];
};

function stageInput(context?: SemanticInputContext): SemanticStage["input"] {
  if (context === undefined) {
    return {
      sourceCount: 0,
      contractCount: 0,
      characterCount: 0,
      redactionCount: 0,
      truncatedSourceCount: 0,
    };
  }
  return {
    inputId: context.input.inputId,
    ...context.input.stats,
  };
}

export function semanticOffStage(): SemanticStage {
  return semanticStageSchema.parse({
    status: "off",
    provider: "off",
    input: stageInput(),
    candidates: [],
  });
}

function abstainedResult(
  provider: string,
  context: SemanticInputContext,
  diagnostic: Diagnostic,
  analyzer?: SemanticAnalyzer,
): SemanticRunResult {
  return {
    stage: semanticStageSchema.parse({
      status: "abstained",
      provider,
      input: stageInput(context),
      candidates: [],
      cost: analyzer?.costSnapshot?.() ?? {
        status: "not_applicable",
        currency: "USD",
      },
    }),
    findingDrafts: [],
    diagnostics: [diagnostic],
  };
}

function validatedSources(
  sourceIds: string[],
  sourceSpans: Map<string, SourceSpan>,
): SourceSpan[] | undefined {
  const unique = [...new Set(sourceIds)];
  const resolved = unique.map((sourceId) => sourceSpans.get(sourceId));
  if (resolved.some((source) => source === undefined)) return undefined;
  return resolved as SourceSpan[];
}

function capSeverity(
  requested: Severity,
  contractIds: string[],
  contracts: Map<string, Contract>,
): Severity {
  const referenced = contractIds
    .map((contractId) => contracts.get(contractId))
    .filter((contract): contract is Contract => contract !== undefined);
  const maximum = referenced.reduce<Severity>(
    (current, contract) =>
      SEVERITY_RANK[contract.severity] > SEVERITY_RANK[current]
        ? contract.severity
        : current,
    "info",
  );
  return SEVERITY_RANK[requested] > SEVERITY_RANK[maximum]
    ? maximum
    : requested;
}

function normalizeCandidates(input: {
  provider: string;
  context: SemanticInputContext;
  contracts: Contract[];
  response: unknown;
}):
  | { candidates: SemanticCandidate[]; findingDrafts: FindingDraft[] }
  | { error: string } {
  const parsed = semanticProviderResponseSchema.safeParse(input.response);
  if (!parsed.success) return { error: validationMessage(parsed.error) };
  if (parsed.data.inputId !== input.context.input.inputId) {
    return {
      error: `inputId mismatch: expected ${input.context.input.inputId}, received ${parsed.data.inputId}`,
    };
  }
  const contracts = new Map(
    input.contracts.map((contract) => [contract.id, contract]),
  );
  const candidates: SemanticCandidate[] = [];
  const findingDrafts: FindingDraft[] = [];

  for (const providerCandidate of parsed.data.candidates) {
    const sources = validatedSources(
      providerCandidate.sourceIds,
      input.context.sourceSpans,
    );
    if (sources === undefined) {
      return { error: "Provider output referenced an unknown source ID." };
    }
    if (
      providerCandidate.kind === "edge" &&
      (!contracts.has(providerCandidate.fromContractId) ||
        !providerCandidate.sourceIds.includes(providerCandidate.toSourceId))
    ) {
      return {
        error:
          "Edge candidate referenced an unknown contract or a toSourceId absent from sourceIds.",
      };
    }
    if (
      providerCandidate.kind === "conflict" &&
      providerCandidate.contractIds.some(
        (contractId) => !contracts.has(contractId),
      )
    ) {
      return { error: "Conflict candidate referenced an unknown contract ID." };
    }
    const id = `SEM-${stableHash({
      provider: input.provider,
      inputId: input.context.input.inputId,
      candidate: providerCandidate,
    }).slice(0, 12)}`;
    const candidate = semanticCandidateSchema.parse({
      ...providerCandidate,
      id,
      basis: "model_candidate",
      reviewStatus: "candidate",
      status: "exploratory",
      provider: input.provider,
      sourceIds: [...new Set(providerCandidate.sourceIds)],
      sources,
    });
    candidates.push(candidate);
    if (candidate.kind === "conflict") {
      const paths = [
        ...new Set(candidate.sources.map((source) => source.path)),
      ];
      findingDrafts.push({
        driftType: candidate.driftType,
        status: "exploratory",
        severity: capSeverity(
          candidate.severity,
          candidate.contractIds,
          contracts,
        ),
        confidence: candidate.confidence,
        contractIds: candidate.contractIds,
        facts: [
          {
            statement: `${candidate.provider} referenced ${candidate.sources.length} validated source span(s) for this semantic candidate.`,
            sourceRefs: paths,
          },
        ],
        inferences: [
          {
            statement: candidate.statement,
            sourceRefs: paths,
          },
        ],
        sources: candidate.sources,
        affectedPaths: paths,
        suggestedReview: candidate.suggestedReview,
        reasonKey: `semantic-candidate:${candidate.id}`,
      });
    }
  }
  return { candidates, findingDrafts };
}

async function analyzeWithTimeout(
  analyzer: SemanticAnalyzer,
  context: SemanticInputContext,
  timeoutMilliseconds: number,
): Promise<unknown> {
  const controller = new AbortController();
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new Error("SEMANTIC_TIMEOUT"));
      controller.abort();
    }, timeoutMilliseconds);
  });
  try {
    return await Promise.race([
      analyzer.analyze(context.input, controller.signal),
      timeout,
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export async function runSemanticStage(input: {
  mode: SemanticMode;
  analyzer?: SemanticAnalyzer;
  context?: SemanticInputContext;
  contracts: Contract[];
  timeoutMilliseconds?: number;
}): Promise<SemanticRunResult> {
  if (input.mode === "off") {
    return { stage: semanticOffStage(), findingDrafts: [], diagnostics: [] };
  }
  if (input.context === undefined) {
    throw new Error("Semantic input context is required when mode is enabled.");
  }
  if (input.analyzer === undefined) {
    return abstainedResult("unconfigured", input.context, {
      code: "SEMANTIC_PROVIDER_UNAVAILABLE",
      severity: "warning",
      message: `Semantic mode '${input.mode}' was requested, but no provider or offline replay was supplied. The semantic stage abstained and deterministic checks continued.`,
      recovery:
        "Provide an explicit analyzer integration or --semantic-replay; no provider is called implicitly.",
    });
  }
  const timeoutMilliseconds = input.timeoutMilliseconds ?? 5000;
  try {
    const response = await analyzeWithTimeout(
      input.analyzer,
      input.context,
      timeoutMilliseconds,
    );
    const normalized = normalizeCandidates({
      provider: input.analyzer.name,
      context: input.context,
      contracts: input.contracts,
      response,
    });
    if ("error" in normalized) {
      return abstainedResult(
        input.analyzer.name,
        input.context,
        {
          code: "SEMANTIC_OUTPUT_INVALID",
          severity: "warning",
          message: `Semantic provider output was rejected: ${normalized.error}`,
          recovery:
            "Return schemaVersion 1, echo the current inputId, and reference only supplied source and contract IDs.",
        },
        input.analyzer,
      );
    }
    return {
      stage: semanticStageSchema.parse({
        status: "complete",
        provider: input.analyzer.name,
        input: stageInput(input.context),
        candidates: normalized.candidates,
        cost: input.analyzer.costSnapshot?.() ?? {
          status: "not_applicable",
          currency: "USD",
        },
      }),
      findingDrafts: normalized.findingDrafts,
      diagnostics: [],
    };
  } catch (error) {
    if (error instanceof SemanticAnalyzerAbstentionError) {
      return abstainedResult(
        input.analyzer.name,
        input.context,
        {
          code: error.code,
          severity: "warning",
          message: error.message,
          recovery: error.recovery,
        },
        input.analyzer,
      );
    }
    const timeout =
      error instanceof Error && error.message === "SEMANTIC_TIMEOUT";
    return abstainedResult(
      input.analyzer.name,
      input.context,
      {
        code: timeout ? "SEMANTIC_PROVIDER_TIMEOUT" : "SEMANTIC_PROVIDER_ERROR",
        severity: "warning",
        message: timeout
          ? `Semantic provider exceeded ${timeoutMilliseconds}ms and was aborted; deterministic checks continued.`
          : "Semantic provider failed; deterministic checks continued without accepting provider output.",
        recovery: timeout
          ? "Increase the explicit timeout only after checking provider latency and input bounds."
          : "Inspect the provider locally; provider errors do not become formal findings.",
      },
      input.analyzer,
    );
  }
}
