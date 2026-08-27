import type { ParsedArtifact } from "../artifacts/types.js";
import {
  redactedSemanticInputSchema,
  type Contract,
  type RedactedSemanticInput,
  type SourceSpan,
} from "../schemas/index.js";
import { stableHash } from "../utils/hash.js";

export type SemanticInputLimits = {
  maxSourceCharacters: number;
  maxTotalCharacters: number;
  maxSources: number;
};

export const DEFAULT_SEMANTIC_LIMITS: SemanticInputLimits = {
  maxSourceCharacters: 2000,
  maxTotalCharacters: 20000,
  maxSources: 100,
};

export type SemanticInputContext = {
  input: RedactedSemanticInput;
  sourceSpans: Map<string, SourceSpan>;
};

type RedactionResult = { text: string; count: number };

function replaceAndCount(
  input: string,
  pattern: RegExp,
  replacement: string,
): RedactionResult {
  const matches = input.match(pattern)?.length ?? 0;
  return { text: input.replace(pattern, replacement), count: matches };
}

export function redactSemanticText(input: string): RedactionResult {
  let result: RedactionResult = { text: input, count: 0 };
  const replacements: [RegExp, string][] = [
    [
      /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/gu,
      "[REDACTED_PRIVATE_KEY]",
    ],
    [/\b(?:sk|rk)-[A-Za-z0-9_-]{16,}\b/gu, "[REDACTED_API_KEY]"],
    [/\bAKIA[A-Z0-9]{16}\b/gu, "[REDACTED_AWS_KEY]"],
    [/\bgh[pousr]_[A-Za-z0-9]{20,}\b/gu, "[REDACTED_GITHUB_TOKEN]"],
    [/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}\b/giu, "Bearer [REDACTED]"],
    [
      /(\b(?:api[_-]?key|access[_-]?token|token|secret|password)\b\s*[:=]\s*)["']?[^\s"',;]+/giu,
      "$1[REDACTED]",
    ],
    [/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu, "[REDACTED_EMAIL]"],
    [/\/Users\/[^/\s]+/gu, "/Users/[REDACTED]"],
    [/\/home\/[^/\s]+/gu, "/home/[REDACTED]"],
  ];
  replacements.forEach(([pattern, replacement]) => {
    const next = replaceAndCount(result.text, pattern, replacement);
    result = { text: next.text, count: result.count + next.count };
  });
  return result;
}

function boundedText(
  text: string,
  maximum: number,
): { text: string; truncated: boolean } {
  if (text.length <= maximum) return { text, truncated: false };
  return { text: text.slice(0, maximum), truncated: true };
}

export function buildRedactedSemanticInput(input: {
  scanId: string;
  mode: "local" | "cloud";
  contracts: Contract[];
  artifacts: ParsedArtifact[];
  changedPaths: string[];
  limits?: Partial<SemanticInputLimits>;
}): SemanticInputContext {
  const limits = { ...DEFAULT_SEMANTIC_LIMITS, ...input.limits };
  const sourceSpans = new Map<string, SourceSpan>();
  const changed = new Set(input.changedPaths);
  let redactionCount = 0;
  let characterCount = 0;
  let truncatedSourceCount = 0;

  const contracts = input.contracts.map((contract) => {
    const title = redactSemanticText(contract.title);
    const topic = redactSemanticText(contract.topic);
    const object = redactSemanticText(contract.rule.object);
    const scopes = contract.rule.applies_to.map((scope) =>
      redactSemanticText(scope),
    );
    redactionCount +=
      title.count +
      topic.count +
      object.count +
      scopes.reduce((total, scope) => total + scope.count, 0);
    return {
      id: contract.id,
      title: boundedText(title.text, 500).text || "[REDACTED]",
      topic: boundedText(topic.text, 200).text || "[REDACTED]",
      rule: {
        operator: contract.rule.operator,
        object: boundedText(object.text, 200).text || "[REDACTED]",
        applies_to: scopes.map(
          (scope) => boundedText(scope.text, 200).text || "[REDACTED]",
        ),
      },
    };
  });

  const sources: RedactedSemanticInput["sources"] = [];
  const sortedArtifacts = [...input.artifacts].sort((left, right) =>
    left.artifact.path.localeCompare(right.artifact.path),
  );
  for (const parsed of sortedArtifacts) {
    if (parsed.artifact.parserStatus === "error") continue;
    for (const [nodeIndex, node] of parsed.nodes.entries()) {
      if (sources.length >= limits.maxSources) break;
      const raw = node.text?.trim();
      if (!raw) continue;
      const redacted = redactSemanticText(raw);
      redactionCount += redacted.count;
      const remaining = limits.maxTotalCharacters - characterCount;
      if (remaining <= 0) break;
      const maximum = Math.min(limits.maxSourceCharacters, remaining);
      const bounded = boundedText(redacted.text, maximum);
      if (bounded.text.length === 0) continue;
      const sourceId = `SRC-${stableHash({
        path: parsed.artifact.path,
        contentHash: parsed.artifact.contentHash,
        nodeIndex,
        startLine: node.startLine,
        endLine: node.endLine,
        pointer: node.pointer,
      }).slice(0, 12)}`;
      sources.push({
        id: sourceId,
        artifactId: parsed.artifact.id,
        category: parsed.artifact.category,
        contentHash: parsed.artifact.contentHash,
        ...(node.startLine === undefined ? {} : { startLine: node.startLine }),
        ...(node.endLine === undefined ? {} : { endLine: node.endLine }),
        ...(node.pointer === undefined ? {} : { pointer: node.pointer }),
        text: bounded.text,
        truncated: bounded.truncated,
      });
      sourceSpans.set(sourceId, {
        path: parsed.artifact.path,
        contentHash: parsed.artifact.contentHash,
        ...(node.startLine === undefined ? {} : { startLine: node.startLine }),
        ...(node.endLine === undefined ? {} : { endLine: node.endLine }),
        ...(node.pointer === undefined ? {} : { pointer: node.pointer }),
      });
      characterCount += bounded.text.length;
      if (bounded.truncated) truncatedSourceCount += 1;
    }
    if (
      sources.length >= limits.maxSources ||
      characterCount >= limits.maxTotalCharacters
    ) {
      break;
    }
  }

  const changedSourceIds = sources
    .filter((source) => changed.has(sourceSpans.get(source.id)?.path ?? ""))
    .map((source) => source.id);
  const core = {
    mode: input.mode,
    contracts,
    sources,
    changedSourceIds,
    limits: {
      maxSourceCharacters: limits.maxSourceCharacters,
      maxTotalCharacters: limits.maxTotalCharacters,
    },
  };
  const semanticInput = redactedSemanticInputSchema.parse({
    schemaVersion: 1,
    inputId: `SIN-${stableHash(core).slice(0, 12)}`,
    scanId: input.scanId,
    ...core,
    stats: {
      sourceCount: sources.length,
      contractCount: contracts.length,
      characterCount,
      redactionCount,
      truncatedSourceCount,
    },
  });
  return { input: semanticInput, sourceSpans };
}
