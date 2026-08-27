import type { ParsedArtifact } from "../artifacts/types.js";
import {
  findingSchema,
  type Finding,
  type FindingSummary,
  type Severity,
  type SourceSpan,
} from "../schemas/index.js";
import { stableHash } from "../utils/hash.js";
import type { FindingDraft } from "./types.js";

const SEVERITIES: Severity[] = ["critical", "high", "medium", "low", "info"];

function deduplicateSources(sources: SourceSpan[]): SourceSpan[] {
  const byKey = new Map<string, SourceSpan>();
  sources.forEach((source) => {
    const key = [
      source.path,
      source.startLine ?? "",
      source.endLine ?? "",
      source.locator ?? "",
      source.pointer ?? "",
    ].join(":");
    byKey.set(key, source);
  });
  return [...byKey.values()].sort((left, right) =>
    `${left.path}:${left.startLine ?? 0}:${left.locator ?? ""}`.localeCompare(
      `${right.path}:${right.startLine ?? 0}:${right.locator ?? ""}`,
    ),
  );
}

function validateSources(
  sources: SourceSpan[],
  artifacts: ParsedArtifact[],
): SourceSpan[] {
  const byPath = new Map(
    artifacts.map((artifact) => [artifact.artifact.path, artifact.artifact]),
  );
  return deduplicateSources(sources).filter((source) => {
    const artifact = byPath.get(source.path);
    if (artifact === undefined || artifact.parserStatus === "error")
      return false;
    return (
      source.contentHash === undefined ||
      source.contentHash === artifact.contentHash
    );
  });
}

export function assembleFinding(
  draft: FindingDraft,
  scanId: string,
  artifacts: ParsedArtifact[],
): Finding {
  const sources = validateSources(draft.sources, artifacts);
  let status = draft.status;
  if (
    status === "formal" &&
    (draft.facts.length === 0 || sources.length === 0)
  ) {
    status = draft.facts.length === 0 ? "abstained" : "exploratory";
  }
  const contractIds = [...new Set(draft.contractIds)].sort();
  const affectedPaths = [...new Set(draft.affectedPaths)].sort();
  const idInput = {
    driftType: draft.driftType,
    contractIds,
    sources: sources.map((source) => ({
      path: source.path,
      startLine: source.startLine,
      endLine: source.endLine,
      locator: source.locator,
      pointer: source.pointer,
    })),
    reasonKey: draft.reasonKey,
  };
  return findingSchema.parse({
    ...draft,
    id: `FND-${stableHash(idInput).slice(0, 12)}`,
    scanId,
    status,
    contractIds,
    sources,
    affectedPaths,
  });
}

export function assembleFindings(
  drafts: FindingDraft[],
  scanId: string,
  artifacts: ParsedArtifact[],
): Finding[] {
  const findings = drafts.map((draft) =>
    assembleFinding(draft, scanId, artifacts),
  );
  const unique = new Map(findings.map((finding) => [finding.id, finding]));
  return [...unique.values()].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
}

export function summarizeFindings(findings: Finding[]): FindingSummary {
  const byDriftType = { D1: 0, D2: 0, D3: 0 };
  const bySeverity: Record<Severity, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
  };
  findings.forEach((finding) => {
    byDriftType[finding.driftType] += 1;
    bySeverity[finding.severity] += 1;
  });
  return {
    total: findings.length,
    formal: findings.filter((finding) => finding.status === "formal").length,
    exploratory: findings.filter((finding) => finding.status === "exploratory")
      .length,
    abstained: findings.filter((finding) => finding.status === "abstained")
      .length,
    byDriftType,
    bySeverity: Object.fromEntries(
      SEVERITIES.map((severity) => [severity, bySeverity[severity]]),
    ) as Record<Severity, number>,
  };
}
