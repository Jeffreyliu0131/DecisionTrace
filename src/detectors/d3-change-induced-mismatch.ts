import type { ParsedArtifact } from "../artifacts/types.js";
import { linkMatchesPath, sourceSpansForLink } from "../contracts/matching.js";
import type { Contract } from "../schemas/index.js";
import type { FindingDraft } from "../findings/types.js";
import { contractDefinitionSources, sourcePaths } from "./shared.js";

export function detectD3(
  contracts: Contract[],
  artifacts: ParsedArtifact[],
  changedPaths: string[],
): FindingDraft[] {
  if (changedPaths.length === 0) return [];
  const drafts: FindingDraft[] = [];
  contracts
    .filter((contract) => contract.status === "active")
    .forEach((contract) => {
      const changedImplementation = changedPaths.filter((pathname) =>
        contract.implemented_by.some((link) => linkMatchesPath(link, pathname)),
      );
      if (changedImplementation.length === 0) return;
      const synchronizationLinks = [
        ...contract.defined_by,
        ...contract.verified_by,
        ...contract.claimed_in,
      ];
      const synchronized = changedPaths.some((pathname) =>
        synchronizationLinks.some((link) => linkMatchesPath(link, pathname)),
      );
      // Co-changing a file is not evidence that the relevant assertion changed.
      // Keep a candidate for human disposition; never turn it into a release gate.

      const definitionSources = contractDefinitionSources(contract, artifacts);
      const implementationSources = contract.implemented_by.flatMap((link) =>
        sourceSpansForLink(link, artifacts).filter((source) =>
          changedImplementation.includes(source.path),
        ),
      );
      const sources = [...definitionSources, ...implementationSources];
      drafts.push({
        driftType: "D3",
        status: "exploratory",
        severity: contract.severity,
        confidence: synchronized ? 0.4 : 0.65,
        contractIds: [contract.id],
        facts: [
          {
            statement: `Declared implementation path(s) changed: ${changedImplementation.join(", ")}. ${synchronized ? "Linked definition, evidence, or claim paths also changed; semantic synchronization is unverified." : "No declared definition, evidence, or public-claim path changed in the same diff."}`,
            sourceRefs: sourcePaths(sources),
          },
        ],
        inferences: [
          {
            statement:
              "The linked contract, evidence, or public claim may need review; unchanged evidence can still be valid.",
            sourceRefs: sourcePaths(definitionSources),
          },
        ],
        sources,
        affectedPaths: [...changedImplementation, ...sourcePaths(sources)],
        suggestedReview:
          "Review whether the implementation change alters the contract, and update linked evidence or claims only if needed.",
        reasonKey: `d3-implementation-only-change:${contract.id}:${changedImplementation.sort().join(",")}`,
      });
    });
  return drafts;
}
