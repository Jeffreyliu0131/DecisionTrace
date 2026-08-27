import type { ParsedArtifact } from "../artifacts/types.js";
import { sourceSpansForLink } from "../contracts/matching.js";
import type { Contract, SourceSpan } from "../schemas/index.js";

export function contractDefinitionSources(
  contract: Contract,
  artifacts: ParsedArtifact[],
): SourceSpan[] {
  return contract.defined_by.flatMap((link) =>
    sourceSpansForLink(link, artifacts),
  );
}

export function sourcePaths(sources: SourceSpan[]): string[] {
  return [...new Set(sources.map((source) => source.path))].sort();
}
