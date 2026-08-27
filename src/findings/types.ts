import type {
  EvidenceStatement,
  Severity,
  SourceSpan,
} from "../schemas/index.js";

export type FindingDraft = {
  driftType: "D1" | "D2" | "D3";
  status: "formal" | "exploratory" | "abstained";
  severity: Severity;
  confidence: number;
  contractIds: string[];
  facts: EvidenceStatement[];
  inferences: EvidenceStatement[];
  sources: SourceSpan[];
  affectedPaths: string[];
  suggestedReview: string;
  reasonKey: string;
};
