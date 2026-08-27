import type { ParsedArtifact } from "../artifacts/types.js";
import { matchingArtifacts } from "../contracts/matching.js";
import type {
  Contract,
  ContractRegistry,
  Diagnostic,
  TraceEdge,
} from "../schemas/index.js";

export type ContractGraph = {
  edges: TraceEdge[];
  diagnostics: Diagnostic[];
  activeContracts: Contract[];
  contractsForArtifact: (artifactId: string) => string[];
};

export function buildContractGraph(
  registry: ContractRegistry,
  artifacts: ParsedArtifact[],
): ContractGraph {
  const edges: TraceEdge[] = [];
  const diagnostics: Diagnostic[] = [];
  const reverse = new Map<string, Set<string>>();
  const contractIds = new Set(
    registry.contracts.map((contract) => contract.id),
  );

  function addArtifactEdge(
    contract: Contract,
    relation: TraceEdge["relation"],
    artifactId: string,
  ): void {
    edges.push({
      fromId: contract.id,
      relation,
      toId: artifactId,
      basis: "declared",
      confidence: 1,
      reviewStatus: "confirmed",
    });
    const contracts = reverse.get(artifactId) ?? new Set<string>();
    contracts.add(contract.id);
    reverse.set(artifactId, contracts);
  }

  registry.contracts.forEach((contract) => {
    const groups = [
      ["defined_by", contract.defined_by],
      ["implemented_by", contract.implemented_by],
      ["enforced_by", contract.enforced_by],
      ["verified_by", contract.verified_by],
      ["claimed_in", contract.claimed_in],
    ] as const;
    groups.forEach(([relation, links]) => {
      links.forEach((link) => {
        matchingArtifacts(link, artifacts).forEach((artifact) =>
          addArtifactEdge(contract, relation, artifact.artifact.id),
        );
      });
    });

    const definitionPaths = new Set(
      contract.defined_by.flatMap((link) =>
        matchingArtifacts(link, artifacts).map((item) => item.artifact.path),
      ),
    );
    if (definitionPaths.size > 1) {
      diagnostics.push({
        code: "SOURCE_DEFINITION_CONFLICT",
        severity: "warning",
        message: `${contract.id} has multiple active definition sources; no canonical source was selected.`,
        details: { paths: [...definitionPaths].sort() },
      });
    }

    contract.supersedes.forEach((supersededId) => {
      if (!contractIds.has(supersededId)) {
        diagnostics.push({
          code: "SUPERSEDES_TARGET_MISSING",
          severity: "warning",
          message: `${contract.id} supersedes unknown contract ${supersededId}.`,
        });
        return;
      }
      edges.push({
        fromId: contract.id,
        relation: "supersedes",
        toId: supersededId,
        basis: "declared",
        confidence: 1,
        reviewStatus: "confirmed",
      });
    });
  });

  edges.sort((left, right) =>
    `${left.fromId}:${left.relation}:${left.toId}`.localeCompare(
      `${right.fromId}:${right.relation}:${right.toId}`,
    ),
  );

  return {
    edges,
    diagnostics,
    activeContracts: registry.contracts.filter(
      (contract) => contract.status === "active",
    ),
    contractsForArtifact: (artifactId: string) =>
      [...(reverse.get(artifactId) ?? [])].sort(),
  };
}
