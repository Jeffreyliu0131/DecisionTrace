import type { ParsedArtifact } from "../artifacts/types.js";
import type { Contract } from "../schemas/index.js";
import type { FindingDraft } from "../findings/types.js";
import { detectD1 } from "./d1-decision-conflict.js";
import { detectD2 } from "./d2-claim-without-evidence.js";
import { detectD3 } from "./d3-change-induced-mismatch.js";

export function runDetectors(input: {
  contracts: Contract[];
  artifacts: ParsedArtifact[];
  unregisteredSafePaths: string[];
  changedPaths: string[];
}): FindingDraft[] {
  return [
    ...detectD1(input.contracts, input.artifacts),
    ...detectD2(input.contracts, input.artifacts, input.unregisteredSafePaths),
    ...detectD3(input.contracts, input.artifacts, input.changedPaths),
  ];
}
