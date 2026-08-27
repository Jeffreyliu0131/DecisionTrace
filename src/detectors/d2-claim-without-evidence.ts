import type { ParsedArtifact } from "../artifacts/types.js";
import { linkMatchesPath, matchingArtifacts } from "../contracts/matching.js";
import type { Contract } from "../schemas/index.js";
import type { FindingDraft } from "../findings/types.js";
import { contractDefinitionSources, sourcePaths } from "./shared.js";

export function detectD2(
  contracts: Contract[],
  artifacts: ParsedArtifact[],
  unregisteredSafePaths: string[],
): FindingDraft[] {
  const drafts: FindingDraft[] = [];
  contracts
    .filter((contract) => contract.status === "active")
    .forEach((contract) => {
      const definitionSources = contractDefinitionSources(contract, artifacts);
      contract.verified_by
        .filter((link) => link.required === true)
        .forEach((link) => {
          const artifactMatches = matchingArtifacts(link, artifacts);
          if (artifactMatches.length > 0) return;
          const declared = link.path ?? link.glob ?? "<invalid>";
          const outsideRegistry = unregisteredSafePaths.some((pathname) =>
            linkMatchesPath(link, pathname),
          );
          drafts.push({
            driftType: "D2",
            status: "formal",
            severity: contract.severity,
            confidence: 1,
            contractIds: [contract.id],
            facts: [
              {
                statement: outsideRegistry
                  ? `Required evidence '${declared}' exists outside the allowed source registry.`
                  : `Required evidence '${declared}' matched no safe artifact.`,
                sourceRefs: sourcePaths(definitionSources),
              },
            ],
            inferences: [],
            sources: definitionSources,
            affectedPaths: [declared, ...sourcePaths(definitionSources)],
            suggestedReview:
              "Add or correctly register the required evidence, or explicitly revise the contract's evidence requirement.",
            reasonKey: `d2-required-evidence-${outsideRegistry ? "outside-registry" : "missing"}:${contract.id}:${declared}`,
          });
        });

      const covered = new Set(
        contract.verified_by.flatMap((link) => link.covers ?? []),
      );
      const missingCoverage = contract.rule.applies_to
        .filter((scope) => !covered.has(scope))
        .sort();
      if (contract.verified_by.length > 0 && missingCoverage.length > 0) {
        drafts.push({
          driftType: "D2",
          status: "formal",
          severity: contract.severity,
          confidence: 1,
          contractIds: [contract.id],
          facts: [
            {
              statement: `${contract.id} applies to [${contract.rule.applies_to.join(", ")}], while declared verified_by coverage omits [${missingCoverage.join(", ")}].`,
              sourceRefs: sourcePaths(definitionSources),
            },
          ],
          inferences: [],
          sources: definitionSources,
          affectedPaths: sourcePaths(definitionSources),
          suggestedReview:
            "Add declared evidence for the missing scope or narrow applies_to; this check does not judge test behavior.",
          reasonKey: `d2-coverage-gap:${contract.id}:${missingCoverage.join(",")}`,
        });
      }
    });
  return drafts;
}
