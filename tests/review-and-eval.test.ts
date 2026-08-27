import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { stringify } from "yaml";
import { afterEach, describe, expect, it } from "vitest";

import { runEvaluation } from "../src/eval/service.js";
import { recordReview } from "../src/review/service.js";
import { scanRepository } from "../src/scan/service.js";
import {
  cleanupRepository,
  copyShadowRepository,
  PROJECT_ROOT,
} from "./helpers/repository.js";

const repositories: string[] = [];

afterEach(async () => {
  await Promise.all(repositories.splice(0).map(cleanupRepository));
});

describe("review feedback", () => {
  it("[AC-025] appends disposition and leaves the canonical report immutable", async () => {
    const root = await copyShadowRepository();
    repositories.push(root);
    const execution = await scanRepository({
      repo: root,
      semanticMode: "off",
      output: ".decisiontrace/reports/reviewable",
    });
    const finding = execution.report.findings[0]!;
    const before = await readFile(execution.bundle.reportJson);
    const result = await recordReview({
      cwd: root,
      reportPath: execution.bundle.reportJson,
      findingId: finding.id,
      decision: "intentional_change",
      reason: "The fixture deliberately contains this conflict.",
      reviewer: "local-reviewer",
      now: new Date("2026-01-01T00:00:00.000Z"),
    });
    expect(await readFile(execution.bundle.reportJson)).toEqual(before);
    const lines = (await readFile(result.reviewPath, "utf8"))
      .trim()
      .split("\n");
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!)).toMatchObject({
      findingId: finding.id,
      decision: "intentional_change",
      reason: "The fixture deliberately contains this conflict.",
    });
  });

  it("[AC-026] rejects empty reasons and unknown finding IDs without changing the review log", async () => {
    const root = await copyShadowRepository();
    repositories.push(root);
    const execution = await scanRepository({
      repo: root,
      semanticMode: "off",
      output: ".decisiontrace/reports/rejected-review",
    });
    const reviewPath = path.join(root, ".decisiontrace/reviews.jsonl");
    await expect(
      recordReview({
        cwd: root,
        reportPath: execution.bundle.reportJson,
        findingId: execution.report.findings[0]!.id,
        decision: "false_positive",
        reason: "   ",
      }),
    ).rejects.toMatchObject({ code: "REVIEW_REASON_REQUIRED" });
    await expect(
      recordReview({
        cwd: root,
        reportPath: execution.bundle.reportJson,
        findingId: "FND-000000000000",
        decision: "false_positive",
        reason: "No such finding.",
      }),
    ).rejects.toMatchObject({ code: "FINDING_NOT_FOUND" });
    await expect(stat(reviewPath)).rejects.toThrow();
  });
});

describe("fixture evaluation", () => {
  it("[AC-027] records per-detector metrics, failures, citations, and the unresolved human-review gate", async () => {
    const root = await copyShadowRepository();
    repositories.push(root);
    const report = await runEvaluation({
      datasetPath: path.join(PROJECT_ROOT, "fixtures/eval-cases.yml"),
      outputDirectory: path.join(root, ".decisiontrace/eval"),
      now: new Date("2026-01-01T00:00:00.000Z"),
    });
    expect(report.report.caseCounts).toEqual({
      total: 30,
      D1: 10,
      D2: 10,
      D3: 10,
    });
    expect(report.report.metrics.D1).toMatchObject({ tp: 4, fp: 0, fn: 0 });
    expect(report.report.metrics.D3).toMatchObject({
      tp: 4,
      fp: 1,
      fn: 0,
      precision: 0.8,
    });
    expect(report.report.failures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          caseId: "EV-029",
          classification: "false_positive",
          stage: "detector",
        }),
      ]),
    );
    expect(report.report.citationCompleteness).toBe(1);
    expect(report.report.gateE1.achieved).toBe(false);
    expect(report.report.missingIndependentReviewerIds).toHaveLength(30);
  });

  it("uses not_applicable when a precision or recall denominator is zero", async () => {
    const root = await copyShadowRepository();
    repositories.push(root);
    const datasetPath = path.join(root, "tiny-eval.yml");
    await writeFile(
      datasetPath,
      stringify({
        version: 1,
        dataset: "zero-denominator",
        cases: [
          {
            id: "EV-999",
            drift_type: "D1",
            repo_fixture_or_revision: "synthetic:none",
            artifacts: [{ path: "docs/a.md", category: "requirements" }],
            contracts: { version: 1, contracts: [] },
            change_set: [],
            expected_finding_or_no_finding: "no_finding",
            expected_sources: [],
            severity_rationale: "No contracts means no D1.",
            known_ambiguity: null,
            author: "test fixture",
            independent_reviewer: "independent test label",
            case_kind: "hard_negative",
          },
        ],
      }),
    );
    const result = await runEvaluation({
      datasetPath,
      outputDirectory: path.join(root, ".decisiontrace/tiny-eval"),
    });
    expect(result.report.metrics.D1.precision).toBe("not_applicable");
    expect(result.report.metrics.D1.recall).toBe("not_applicable");
    expect(result.report.metrics.D2.precision).toBe("not_applicable");
  });
});
