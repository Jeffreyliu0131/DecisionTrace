import type { ParsedArtifact } from "../artifacts/types.js";
import {
  linkMatchesPath,
  matchingArtifacts,
  sourceSpansForLink,
} from "../contracts/matching.js";
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
          const valid = artifactMatches.some(
            (parsed) =>
              parsed.artifact.parserStatus !== "error" &&
              (link.locator === undefined ||
                parsed.nodes.some((node) =>
                  node.text?.includes(link.locator!),
                )) &&
              (link.expect === undefined ||
                parsed.nodes.some(
                  (node) =>
                    node.pointer === link.expect!.pointer &&
                    Object.is(node.value, link.expect!.equals),
                )),
          );
          if (valid) return;
          const evidenceSources = [
            ...definitionSources,
            ...sourceSpansForLink(link, artifacts),
          ];
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
                statement:
                  artifactMatches.length > 0
                    ? `Required evidence '${declared}' exists but its parser, locator, or typed JSON-pointer expectation failed.`
                    : outsideRegistry
                      ? `Required evidence '${declared}' exists outside the allowed source registry.`
                      : `Required evidence '${declared}' matched no safe artifact.`,
                sourceRefs: sourcePaths(evidenceSources),
              },
            ],
            inferences: [],
            sources: evidenceSources,
            affectedPaths: [declared, ...sourcePaths(definitionSources)],
            suggestedReview:
              "Add or correctly register the required evidence, or explicitly revise the contract's evidence requirement.",
            reasonKey: `d2-required-evidence-${artifactMatches.length > 0 ? "invalid" : outsideRegistry ? "outside-registry" : "missing"}:${contract.id}:${declared}:${JSON.stringify(link.expect ?? link.locator ?? "")}`,
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
