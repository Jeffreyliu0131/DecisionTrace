import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";

import { DecisionTraceError } from "../errors.js";
import { findRepositoryRoot } from "../git/adapter.js";
import {
  reviewSchema,
  scanReportSchema,
  type Review,
  type ReviewDecision,
  type ScanReport,
} from "../schemas/index.js";
import { parseSchema } from "../schemas/validation.js";
import {
  assertSafeWritePath,
  resolveExistingInsideRoot,
  resolveInsideRoot,
} from "../utils/paths.js";

export async function recordReview(input: {
  cwd: string;
  reportPath: string;
  findingId: string;
  decision: ReviewDecision;
  reason: string;
  reviewer?: string;
  now?: Date;
}): Promise<{ review: Review; reviewPath: string }> {
  if (input.reason.trim() === "") {
    throw new DecisionTraceError("Review reason must not be empty.", {
      code: "REVIEW_REASON_REQUIRED",
    });
  }
  const { root, report } = await loadScanReportForReview(
    input.cwd,
    input.reportPath,
  );
  if (!report.findings.some((finding) => finding.id === input.findingId)) {
    throw new DecisionTraceError(
      `Finding ${input.findingId} does not exist in ${input.reportPath}.`,
      { code: "FINDING_NOT_FOUND" },
    );
  }
  const reviewPath = resolveInsideRoot(
    root,
    ".decisiontrace/reviews.jsonl",
    "reviews",
  );
  await assertSafeWritePath(root, reviewPath, "reviews");
  await mkdir(path.dirname(reviewPath), { recursive: true });
  const review = reviewSchema.parse({
    findingId: input.findingId,
    scanId: report.scanId,
    decision: input.decision,
    reason: input.reason,
    ...(input.reviewer === undefined ? {} : { reviewer: input.reviewer }),
    reviewedAt: (input.now ?? new Date()).toISOString(),
  });
  await appendFile(reviewPath, `${JSON.stringify(review)}\n`, {
    encoding: "utf8",
    flag: "a",
  });
  return { review, reviewPath };
}

export async function loadScanReportForReview(
  cwd: string,
  reportPath: string,
): Promise<{ root: string; report: ScanReport }> {
  const root = await findRepositoryRoot(cwd);
  const reportCandidate = path.isAbsolute(reportPath)
    ? resolveInsideRoot(root, path.relative(root, reportPath), "report")
    : resolveInsideRoot(root, reportPath, "report");
  const raw = await resolveExistingInsideRoot(root, reportCandidate, "report")
    .then((resolved) => readFile(resolved, "utf8"))
    .catch((error: unknown) => {
      if (error instanceof DecisionTraceError) throw error;
      throw new DecisionTraceError(`Report not found: ${reportPath}`, {
        code: "REPORT_NOT_FOUND",
      });
    });
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new DecisionTraceError(`Report is not valid JSON: ${reportPath}`, {
      code: "REPORT_JSON_INVALID",
    });
  }
  const report = parseSchema(scanReportSchema, parsed, "scan report");
  return { root, report };
}
