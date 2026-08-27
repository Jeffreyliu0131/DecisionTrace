import { lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";

import type { ZodType } from "zod";

import { loadConfiguration } from "../config/loader.js";
import { DecisionTraceError, errorMessage } from "../errors.js";
import { findRepositoryRoot } from "../git/adapter.js";
import { recordSemanticReview } from "../review/semantic.js";
import { recordReview } from "../review/service.js";
import {
  reviewSchema,
  scanReportSchema,
  semanticReviewSchema,
  type Review,
  type ScanReport,
  type SemanticReview,
} from "../schemas/index.js";
import { stableHash } from "../utils/hash.js";
import {
  resolveExistingInsideRoot,
  resolveInsideRoot,
  toPosixPath,
} from "../utils/paths.js";
import type {
  ArtifactComparisonItem,
  CandidateComparisonItem,
  DashboardData,
  EntityChanges,
  FindingComparisonItem,
  InvalidReportSummary,
  ReportComparison,
  ReportDetail,
  ReportHistory,
  ReportListItem,
  ReportReviewState,
  ReviewLogDiagnostic,
} from "./contracts.js";
import type { FindingReviewRequest, SemanticReviewRequest } from "./schemas.js";

const MAX_REPORT_BYTES = 20 * 1024 * 1024;
const MAX_REVIEW_LOG_BYTES = 5 * 1024 * 1024;
const MAX_REPORTS = 1000;
const MAX_DEPTH = 5;

type ReportRecord = {
  key: string;
  absolutePath: string;
  relativePath: string;
  report: ScanReport;
};

type Discovery = {
  records: ReportRecord[];
  invalidReports: InvalidReportSummary[];
};

type ReviewLogs = {
  findings: Review[];
  semantic: SemanticReview[];
  diagnostics: ReviewLogDiagnostic[];
};

async function isMissing(target: string): Promise<boolean> {
  try {
    await lstat(target);
    return false;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return true;
    throw error;
  }
}

async function readJsonl<T>(input: {
  root: string;
  relativePath: string;
  source: ReviewLogDiagnostic["source"];
  schema: ZodType<T>;
}): Promise<{ records: T[]; diagnostics: ReviewLogDiagnostic[] }> {
  const candidate = resolveInsideRoot(
    input.root,
    input.relativePath,
    input.source,
  );
  if (await isMissing(candidate)) return { records: [], diagnostics: [] };
  const resolved = await resolveExistingInsideRoot(
    input.root,
    candidate,
    input.source,
  );
  const metadata = await lstat(resolved);
  if (!metadata.isFile() || metadata.size > MAX_REVIEW_LOG_BYTES) {
    throw new DecisionTraceError(
      `${input.source} review log is not a regular file or exceeds ${MAX_REVIEW_LOG_BYTES} bytes.`,
      { code: "UI_REVIEW_LOG_INVALID" },
    );
  }
  const records: T[] = [];
  const diagnostics: ReviewLogDiagnostic[] = [];
  const lines = (await readFile(resolved, "utf8")).split(/\r?\n/u);
  lines.forEach((line, index) => {
    if (line.trim() === "") return;
    try {
      const result = input.schema.safeParse(JSON.parse(line));
      if (result.success) records.push(result.data);
      else {
        diagnostics.push({
          source: input.source,
          line: index + 1,
          error: result.error.issues
            .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
            .join("; "),
        });
      }
    } catch (error) {
      diagnostics.push({
        source: input.source,
        line: index + 1,
        error: errorMessage(error),
      });
    }
  });
  return { records, diagnostics };
}

function reviewKey(scanId: string, subjectId: string): string {
  return `${scanId}:${subjectId}`;
}

function latestReviewMaps(logs: ReviewLogs): {
  findings: Map<string, Review>;
  semantic: Map<string, SemanticReview>;
} {
  const findings = new Map<string, Review>();
  logs.findings.forEach((review) =>
    findings.set(reviewKey(review.scanId, review.findingId), review),
  );
  const semantic = new Map<string, SemanticReview>();
  logs.semantic.forEach((review) =>
    semantic.set(reviewKey(review.scanId, review.candidateId), review),
  );
  return { findings, semantic };
}

function toListItem(
  record: ReportRecord,
  reviewMaps: ReturnType<typeof latestReviewMaps>,
): ReportListItem {
  const report = record.report;
  return {
    key: record.key,
    scanId: report.scanId,
    completedAt: report.completedAt,
    mode: report.mode,
    result: report.result,
    semanticStatus: report.semantic.status,
    head: report.repository.head,
    ...(report.repository.base === undefined
      ? {}
      : { base: report.repository.base }),
    findings: {
      total: report.summary.total,
      formal: report.summary.formal,
      exploratory: report.summary.exploratory,
      abstained: report.summary.abstained,
      D1: report.summary.byDriftType.D1,
      D2: report.summary.byDriftType.D2,
      D3: report.summary.byDriftType.D3,
    },
    semanticCandidates: report.semantic.candidates.length,
    diagnostics: report.diagnostics.length,
    reviewProgress: {
      findingsReviewed: report.findings.filter((finding) =>
        reviewMaps.findings.has(reviewKey(report.scanId, finding.id)),
      ).length,
      semanticReviewed: report.semantic.candidates.filter((candidate) =>
        reviewMaps.semantic.has(reviewKey(report.scanId, candidate.id)),
      ).length,
    },
  };
}

function reviewState(
  report: ScanReport,
  reviewMaps: ReturnType<typeof latestReviewMaps>,
): ReportReviewState {
  return {
    findings: Object.fromEntries(
      report.findings.flatMap((finding) => {
        const review = reviewMaps.findings.get(
          reviewKey(report.scanId, finding.id),
        );
        return review === undefined ? [] : [[finding.id, review]];
      }),
    ),
    semanticCandidates: Object.fromEntries(
      report.semantic.candidates.flatMap((candidate) => {
        const review = reviewMaps.semantic.get(
          reviewKey(report.scanId, candidate.id),
        );
        return review === undefined ? [] : [[candidate.id, review]];
      }),
    ),
  };
}

function findingItem(
  finding: ScanReport["findings"][number],
): FindingComparisonItem {
  return {
    id: finding.id,
    driftType: finding.driftType,
    status: finding.status,
    severity: finding.severity,
    confidence: finding.confidence,
    contractIds: finding.contractIds,
  };
}

function candidateItem(
  candidate: ScanReport["semantic"]["candidates"][number],
): CandidateComparisonItem {
  return {
    id: candidate.id,
    kind: candidate.kind,
    status: candidate.status,
    provider: candidate.provider,
    confidence: candidate.confidence,
    statement: candidate.statement,
  };
}

function artifactItem(
  artifact: ScanReport["artifacts"][number],
): ArtifactComparisonItem {
  return {
    path: artifact.path,
    category: artifact.category,
    contentHash: artifact.contentHash,
    parserStatus: artifact.parserStatus,
  };
}

function diffEntities<T>(
  left: T[],
  right: T[],
  key: (value: T) => string,
): EntityChanges<T> {
  const leftMap = new Map(left.map((value) => [key(value), value]));
  const rightMap = new Map(right.map((value) => [key(value), value]));
  const added: T[] = [];
  const removed: T[] = [];
  const changed: Array<{ before: T; after: T }> = [];
  const unchanged: T[] = [];
  rightMap.forEach((value, id) => {
    const before = leftMap.get(id);
    if (before === undefined) added.push(value);
    else if (JSON.stringify(before) === JSON.stringify(value))
      unchanged.push(value);
    else changed.push({ before, after: value });
  });
  leftMap.forEach((value, id) => {
    if (!rightMap.has(id)) removed.push(value);
  });
  const sort = (values: T[]): T[] =>
    values.sort((a, b) => key(a).localeCompare(key(b)));
  return {
    added: sort(added),
    removed: sort(removed),
    changed: changed.sort((a, b) => key(a.after).localeCompare(key(b.after))),
    unchanged: sort(unchanged),
  };
}

export class LocalReportStore {
  readonly root: string;
  readonly reportRoot: string;

  private constructor(root: string, reportRoot: string) {
    this.root = root;
    this.reportRoot = reportRoot;
  }

  static async open(start: string): Promise<LocalReportStore> {
    const root = await findRepositoryRoot(start);
    const loaded = await loadConfiguration(root);
    const reportRoot = resolveInsideRoot(
      root,
      loaded.config.reports,
      "reports",
    );
    return new LocalReportStore(root, reportRoot);
  }

  async #reviewLogs(): Promise<ReviewLogs> {
    const [findings, semantic] = await Promise.all([
      readJsonl({
        root: this.root,
        relativePath: ".decisiontrace/reviews.jsonl",
        source: "findings",
        schema: reviewSchema,
      }),
      readJsonl({
        root: this.root,
        relativePath: ".decisiontrace/semantic-reviews.jsonl",
        source: "semantic",
        schema: semanticReviewSchema,
      }),
    ]);
    return {
      findings: findings.records,
      semantic: semantic.records,
      diagnostics: [...findings.diagnostics, ...semantic.diagnostics],
    };
  }

  async #discover(): Promise<Discovery> {
    if (await isMissing(this.reportRoot)) {
      return { records: [], invalidReports: [] };
    }
    const resolvedRoot = await resolveExistingInsideRoot(
      this.root,
      this.reportRoot,
      "reports",
    );
    const records: ReportRecord[] = [];
    const invalidReports: InvalidReportSummary[] = [];

    const walk = async (directory: string, depth: number): Promise<void> => {
      if (depth > MAX_DEPTH || records.length >= MAX_REPORTS) return;
      const entries = await readdir(directory, { withFileTypes: true });
      entries.sort((left, right) => left.name.localeCompare(right.name));
      for (const entry of entries) {
        if (records.length >= MAX_REPORTS || entry.isSymbolicLink()) continue;
        const absolute = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          await walk(absolute, depth + 1);
          continue;
        }
        if (!entry.isFile() || entry.name !== "report.json") continue;
        const relativePath = toPosixPath(path.relative(this.root, absolute));
        try {
          const resolved = await resolveExistingInsideRoot(
            this.root,
            absolute,
            "report",
          );
          const metadata = await lstat(resolved);
          if (metadata.size > MAX_REPORT_BYTES) {
            throw new DecisionTraceError(
              `Report exceeds ${MAX_REPORT_BYTES} bytes.`,
              { code: "UI_REPORT_TOO_LARGE" },
            );
          }
          const report = scanReportSchema.parse(
            JSON.parse(await readFile(resolved, "utf8")),
          );
          records.push({
            key: `RPT-${stableHash({ relativePath, scanId: report.scanId }).slice(0, 12)}`,
            absolutePath: resolved,
            relativePath,
            report,
          });
        } catch (error) {
          invalidReports.push({
            relativePath,
            error: errorMessage(error).replaceAll(this.root, "<repo>"),
          });
        }
      }
    };
    await walk(resolvedRoot, 0);
    records.sort((left, right) =>
      right.report.completedAt.localeCompare(left.report.completedAt),
    );
    return { records, invalidReports };
  }

  async #record(reportKey: string): Promise<ReportRecord> {
    const discovery = await this.#discover();
    const record = discovery.records.find((item) => item.key === reportKey);
    if (record === undefined) {
      throw new DecisionTraceError(`Unknown report key: ${reportKey}`, {
        code: "UI_REPORT_NOT_FOUND",
      });
    }
    return record;
  }

  async history(): Promise<ReportHistory> {
    const [discovery, logs] = await Promise.all([
      this.#discover(),
      this.#reviewLogs(),
    ]);
    const maps = latestReviewMaps(logs);
    return {
      reports: discovery.records.map((record) => toListItem(record, maps)),
      invalidReports: discovery.invalidReports,
      reviewDiagnostics: logs.diagnostics,
    };
  }

  async dashboard(): Promise<DashboardData> {
    const history = await this.history();
    const latest = history.reports[0];
    return {
      reportCount: history.reports.length,
      invalidReportCount: history.invalidReports.length,
      invalidReviewRecordCount: history.reviewDiagnostics.length,
      ...(latest === undefined ? {} : { latest }),
      reviewQueue: {
        unreviewedFindings:
          latest === undefined
            ? 0
            : latest.findings.total - latest.reviewProgress.findingsReviewed,
        unreviewedSemanticCandidates:
          latest === undefined
            ? 0
            : latest.semanticCandidates -
              latest.reviewProgress.semanticReviewed,
      },
      trends: [...history.reports]
        .slice(0, 20)
        .reverse()
        .map((report) => ({
          key: report.key,
          completedAt: report.completedAt,
          totalFindings: report.findings.total,
          formalFindings: report.findings.formal,
          exploratoryFindings: report.findings.exploratory,
          semanticCandidates: report.semanticCandidates,
        })),
      recentReports: history.reports.slice(0, 8),
    };
  }

  async detail(reportKey: string): Promise<ReportDetail> {
    const [record, logs] = await Promise.all([
      this.#record(reportKey),
      this.#reviewLogs(),
    ]);
    return {
      key: record.key,
      report: record.report,
      reviews: reviewState(record.report, latestReviewMaps(logs)),
    };
  }

  async compare(leftKey: string, rightKey: string): Promise<ReportComparison> {
    const [left, right, logs] = await Promise.all([
      this.#record(leftKey),
      this.#record(rightKey),
      this.#reviewLogs(),
    ]);
    const maps = latestReviewMaps(logs);
    const leftList = toListItem(left, maps);
    const rightList = toListItem(right, maps);
    const leftCodes = new Set(left.report.diagnostics.map((item) => item.code));
    const rightCodes = new Set(
      right.report.diagnostics.map((item) => item.code),
    );
    return {
      left: leftList,
      right: rightList,
      summaryDelta: {
        totalFindings: right.report.summary.total - left.report.summary.total,
        formalFindings:
          right.report.summary.formal - left.report.summary.formal,
        exploratoryFindings:
          right.report.summary.exploratory - left.report.summary.exploratory,
        semanticCandidates:
          right.report.semantic.candidates.length -
          left.report.semantic.candidates.length,
        diagnostics:
          right.report.diagnostics.length - left.report.diagnostics.length,
      },
      findings: diffEntities(
        left.report.findings.map(findingItem),
        right.report.findings.map(findingItem),
        (item) => item.id,
      ),
      semanticCandidates: diffEntities(
        left.report.semantic.candidates.map(candidateItem),
        right.report.semantic.candidates.map(candidateItem),
        (item) => item.id,
      ),
      artifacts: diffEntities(
        left.report.artifacts.map(artifactItem),
        right.report.artifacts.map(artifactItem),
        (item) => item.path,
      ),
      diagnostics: {
        addedCodes: [...rightCodes]
          .filter((code) => !leftCodes.has(code))
          .sort(),
        removedCodes: [...leftCodes]
          .filter((code) => !rightCodes.has(code))
          .sort(),
        unchangedCodes: [...rightCodes]
          .filter((code) => leftCodes.has(code))
          .sort(),
      },
    };
  }

  async reviewFinding(request: FindingReviewRequest): Promise<Review> {
    const record = await this.#record(request.reportKey);
    const result = await recordReview({
      cwd: this.root,
      reportPath: record.absolutePath,
      findingId: request.findingId,
      decision: request.decision,
      reason: request.reason,
      ...(request.reviewer === undefined ? {} : { reviewer: request.reviewer }),
    });
    return result.review;
  }

  async reviewSemantic(
    request: SemanticReviewRequest,
  ): Promise<SemanticReview> {
    const record = await this.#record(request.reportKey);
    const result = await recordSemanticReview({
      cwd: this.root,
      reportPath: record.absolutePath,
      candidateId: request.candidateId,
      decision: request.decision,
      reason: request.reason,
      ...(request.reviewer === undefined ? {} : { reviewer: request.reviewer }),
    });
    return result.review;
  }
}
