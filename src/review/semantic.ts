import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

import { DecisionTraceError } from "../errors.js";
import {
  semanticReviewSchema,
  type SemanticReview,
  type SemanticReviewDecision,
} from "../schemas/index.js";
import { assertSafeWritePath, resolveInsideRoot } from "../utils/paths.js";
import { loadScanReportForReview } from "./service.js";

export async function recordSemanticReview(input: {
  cwd: string;
  reportPath: string;
  candidateId: string;
  decision: SemanticReviewDecision;
  reason: string;
  reviewer?: string;
  now?: Date;
}): Promise<{ review: SemanticReview; reviewPath: string }> {
  if (input.reason.trim() === "") {
    throw new DecisionTraceError("Semantic review reason must not be empty.", {
      code: "SEMANTIC_REVIEW_REASON_REQUIRED",
    });
  }
  const { root, report } = await loadScanReportForReview(
    input.cwd,
    input.reportPath,
  );
  const candidate = report.semantic.candidates.find(
    (item) => item.id === input.candidateId,
  );
  if (candidate === undefined) {
    throw new DecisionTraceError(
      `Semantic candidate ${input.candidateId} does not exist in ${input.reportPath}.`,
      { code: "SEMANTIC_CANDIDATE_NOT_FOUND" },
    );
  }
  const reviewPath = resolveInsideRoot(
    root,
    ".decisiontrace/semantic-reviews.jsonl",
    "semantic reviews",
  );
  await assertSafeWritePath(root, reviewPath, "semantic reviews");
  await mkdir(path.dirname(reviewPath), { recursive: true });
  const review = semanticReviewSchema.parse({
    candidateId: candidate.id,
    scanId: report.scanId,
    kind: candidate.kind,
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
