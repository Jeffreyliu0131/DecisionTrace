import type {
  Finding,
  Review,
  ScanReport,
  SemanticCandidate,
  SemanticReview,
} from "../schemas/index.js";

export type ReportListItem = {
  key: string;
  scanId: string;
  completedAt: string;
  mode: ScanReport["mode"];
  result: ScanReport["result"];
  semanticStatus: ScanReport["semantic"]["status"];
  head: string;
  base?: string;
  findings: {
    total: number;
    formal: number;
    exploratory: number;
    abstained: number;
    D1: number;
    D2: number;
    D3: number;
  };
  semanticCandidates: number;
  diagnostics: number;
  reviewProgress: {
    findingsReviewed: number;
    semanticReviewed: number;
  };
};

export type InvalidReportSummary = {
  relativePath: string;
  error: string;
};

export type ReviewLogDiagnostic = {
  source: "findings" | "semantic";
  line: number;
  error: string;
};

export type ReportHistory = {
  reports: ReportListItem[];
  invalidReports: InvalidReportSummary[];
  reviewDiagnostics: ReviewLogDiagnostic[];
};

export type ReportReviewState = {
  findings: Record<string, Review>;
  semanticCandidates: Record<string, SemanticReview>;
};

export type ReportDetail = {
  key: string;
  report: ScanReport;
  reviews: ReportReviewState;
};

export type DashboardData = {
  reportCount: number;
  invalidReportCount: number;
  invalidReviewRecordCount: number;
  latest?: ReportListItem;
  reviewQueue: {
    unreviewedFindings: number;
    unreviewedSemanticCandidates: number;
  };
  trends: Array<{
    key: string;
    completedAt: string;
    totalFindings: number;
    formalFindings: number;
    exploratoryFindings: number;
    semanticCandidates: number;
  }>;
  recentReports: ReportListItem[];
};

export type FindingComparisonItem = Pick<
  Finding,
  "id" | "driftType" | "status" | "severity" | "confidence" | "contractIds"
>;

export type CandidateComparisonItem = Pick<
  SemanticCandidate,
  "id" | "kind" | "status" | "provider" | "confidence" | "statement"
>;

export type ArtifactComparisonItem = {
  path: string;
  category: string;
  contentHash: string;
  parserStatus: string;
};

export type EntityChanges<T> = {
  added: T[];
  removed: T[];
  changed: Array<{ before: T; after: T }>;
  unchanged: T[];
};

export type ReportComparison = {
  left: ReportListItem;
  right: ReportListItem;
  summaryDelta: {
    totalFindings: number;
    formalFindings: number;
    exploratoryFindings: number;
    semanticCandidates: number;
    diagnostics: number;
  };
  findings: EntityChanges<FindingComparisonItem>;
  semanticCandidates: EntityChanges<CandidateComparisonItem>;
  artifacts: EntityChanges<ArtifactComparisonItem>;
  diagnostics: {
    addedCodes: string[];
    removedCodes: string[];
    unchangedCodes: string[];
  };
};

export type SessionResponse = {
  csrfToken: string;
  toolVersion: string;
};

export type ApiErrorResponse = {
  error: { code: string; message: string };
};
