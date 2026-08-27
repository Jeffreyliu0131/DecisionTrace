import type { ParsedArtifact } from "../artifacts/types.js";
import type { Contract } from "../schemas/index.js";
import type { FindingDraft } from "../findings/types.js";
import { contractDefinitionSources, sourcePaths } from "./shared.js";

function overlaps(left: string[], right: string[]): boolean {
  const rightSet = new Set(right);
  return left.some((value) => rightSet.has(value));
}

function mutuallyExclusive(left: Contract, right: Contract): boolean {
  return (
    left.topic === right.topic &&
    left.rule.object === right.rule.object &&
    overlaps(left.rule.applies_to, right.rule.applies_to) &&
    ((left.rule.operator === "require" && right.rule.operator === "forbid") ||
      (left.rule.operator === "forbid" && right.rule.operator === "require"))
  );
}

const SEVERITY_RANK = {
  critical: 5,
  high: 4,
  medium: 3,
  low: 2,
  info: 1,
} as const;

function greaterSeverity(
  left: Contract,
  right: Contract,
): Contract["severity"] {
  return SEVERITY_RANK[left.severity] >= SEVERITY_RANK[right.severity]
    ? left.severity
    : right.severity;
}

export function detectD1(
  contracts: Contract[],
  artifacts: ParsedArtifact[],
): FindingDraft[] {
  const active = contracts
    .filter((contract) => contract.status === "active")
    .sort((left, right) => left.id.localeCompare(right.id));
  const byId = new Map(active.map((contract) => [contract.id, contract]));
  const drafts: FindingDraft[] = [];

  active.forEach((contract) => {
    contract.supersedes.forEach((supersededId) => {
      const superseded = byId.get(supersededId);
      if (superseded === undefined) return;
      const contractSources = contractDefinitionSources(contract, artifacts);
      const supersededSources = contractDefinitionSources(
        superseded,
        artifacts,
      );
      const sources = [...contractSources, ...supersededSources];
      drafts.push({
        driftType: "D1",
        status:
          contractSources.length > 0 && supersededSources.length > 0
            ? "formal"
            : "exploratory",
        severity: greaterSeverity(contract, superseded),
        confidence: 1,
        contractIds: [contract.id, superseded.id],
        facts: [
          {
            statement: `${contract.id} is active, declares that it supersedes ${superseded.id}, and ${superseded.id} is also active.`,
            sourceRefs: sourcePaths(sources),
          },
        ],
        inferences: [],
        sources,
        affectedPaths: sourcePaths(sources),
        suggestedReview: `Decide which contract remains active and update the superseded contract status explicitly.`,
        reasonKey: `d1-active-supersedes-active:${contract.id}:${superseded.id}`,
      });
    });
  });

  for (let leftIndex = 0; leftIndex < active.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < active.length;
      rightIndex += 1
    ) {
      const left = active[leftIndex]!;
      const right = active[rightIndex]!;
      if (!mutuallyExclusive(left, right)) continue;
      const leftSources = contractDefinitionSources(left, artifacts);
      const rightSources = contractDefinitionSources(right, artifacts);
      const sources = [...leftSources, ...rightSources];
      const overlap = left.rule.applies_to.filter((value) =>
        right.rule.applies_to.includes(value),
      );
      drafts.push({
        driftType: "D1",
        status:
          leftSources.length > 0 && rightSources.length > 0
            ? "formal"
            : "exploratory",
        severity: greaterSeverity(left, right),
        confidence: 1,
        contractIds: [left.id, right.id],
        facts: [
          {
            statement: `${left.id} and ${right.id} are active and apply mutually exclusive require/forbid rules to '${left.rule.object}' for ${overlap.join(", ")}.`,
            sourceRefs: sourcePaths(sources),
          },
        ],
        inferences: [],
        sources,
        affectedPaths: sourcePaths(sources),
        suggestedReview:
          "Confirm the intended rule, then supersede or narrow one structured contract.",
        reasonKey: `d1-structured-conflict:${left.id}:${right.id}:${left.rule.object}:${overlap.sort().join(",")}`,
      });
    }
  }
  return drafts;
}
