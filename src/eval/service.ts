import { readFile } from "node:fs/promises";
import path from "node:path";

import { parseDocument } from "yaml";

import type { ParsedArtifact } from "../artifacts/types.js";
import { linkMatchesPath } from "../contracts/matching.js";
import { runDetectors } from "../detectors/index.js";
import { DecisionTraceError } from "../errors.js";
import { assembleFindings } from "../findings/engine.js";
import {
  evalDatasetSchema,
  evalReportSchema,
  type EvalCase,
  type EvalReport,
} from "../schemas/index.js";
import { parseSchema } from "../schemas/validation.js";
import { writeFileAtomic } from "../utils/files.js";
import { sha256, stableJson } from "../utils/hash.js";
import { TOOL_VERSION } from "../version.js";

type DriftType = "D1" | "D2" | "D3";
type Counts = { cases: number; tp: number; fp: number; fn: number; tn: number };

function syntheticArtifacts(evalCase: EvalCase): ParsedArtifact[] {
  return evalCase.artifacts.map((item) => {
    const locatorNodes = evalCase.contracts.contracts.flatMap(
      (contract, index) =>
        contract.defined_by
          .filter((link) => linkMatchesPath(link, item.path))
          .map(() => ({
            kind: "heading" as const,
            text: contract.id,
            startLine: index + 1,
            endLine: index + 1,
          })),
    );
    return {
      artifact: {
        id: `ART-${sha256(item.path).slice(0, 12)}`,
        category: item.category,
        path: item.path,
        revision: evalCase.repo_fixture_or_revision,
        contentHash: sha256(`${evalCase.id}:${item.path}`),
        byteSize: 0,
        parserStatus: "parsed",
        diagnostics: [],
      },
      nodes: locatorNodes,
    };
  });
}

function ratio(
  numerator: number,
  denominator: number,
): number | "not_applicable" {
  return denominator === 0 ? "not_applicable" : numerator / denominator;
}

function renderEvaluationMarkdown(report: EvalReport): string {
  const metricRows = (["D1", "D2", "D3"] as const)
    .map((driftType) => {
      const metric = report.metrics[driftType];
      return `| ${driftType} | ${metric.cases} | ${metric.tp} | ${metric.fp} | ${metric.fn} | ${metric.tn} | ${metric.precision} | ${metric.recall} |`;
    })
    .join("\n");
  const failures = report.failures.length
    ? report.failures
        .map(
          (failure) =>
            `- \`${failure.caseId}\` ${failure.classification} at ${failure.stage}: ${failure.details}`,
        )
        .join("\n")
    : "- None";
  return `# DecisionTrace Fixture Evaluation

- Dataset: \`${report.dataset.name}\` v${report.dataset.version}
- Dataset hash: \`${report.dataset.hash}\`
- Tool: \`${report.toolVersion}\`
- Cases: ${report.caseCounts.total}
- Citation completeness: ${report.citationCompleteness}
- Gate E1 achieved: **${report.gateE1.achieved ? "yes" : "no"}**

| Drift | Cases | TP | FP | FN | TN | Precision | Recall |
|---|---:|---:|---:|---:|---:|---:|---:|
${metricRows}

## Failed cases

${failures}

## Gate E1 reasons

${report.gateE1.reasons.map((reason) => `- ${reason}`).join("\n")}

## Known limitations

${report.limitations.map((limitation) => `- ${limitation}`).join("\n")}
`;
}

export async function runEvaluation(input: {
  datasetPath: string;
  outputDirectory: string;
  now?: Date;
}): Promise<{ report: EvalReport; jsonPath: string; markdownPath: string }> {
  const raw = await readFile(input.datasetPath, "utf8").catch(() => {
    throw new DecisionTraceError(
      `Eval dataset not found: ${input.datasetPath}`,
      {
        code: "EVAL_DATASET_NOT_FOUND",
      },
    );
  });
  const document = parseDocument(raw, { prettyErrors: true, uniqueKeys: true });
  if (document.errors.length > 0) {
    throw new DecisionTraceError(
      `Eval dataset YAML parse failed: ${document.errors.map((error) => error.message).join("; ")}`,
      { code: "EVAL_DATASET_PARSE_FAILED" },
    );
  }
  const dataset = parseSchema(
    evalDatasetSchema,
    document.toJS({ maxAliasCount: 100 }),
    "eval dataset",
  );
  const counts: Record<DriftType, Counts> = {
    D1: { cases: 0, tp: 0, fp: 0, fn: 0, tn: 0 },
    D2: { cases: 0, tp: 0, fp: 0, fn: 0, tn: 0 },
    D3: { cases: 0, tp: 0, fp: 0, fn: 0, tn: 0 },
  };
  const failures: EvalReport["failures"] = [];
  let formalFindingCount = 0;
  let citedFormalFindingCount = 0;

  dataset.cases.forEach((evalCase) => {
    const artifacts = syntheticArtifacts(evalCase);
    const findings = assembleFindings(
      runDetectors({
        contracts: evalCase.contracts.contracts.filter(
          (contract) => contract.status === "active",
        ),
        artifacts,
        unregisteredSafePaths: [],
        changedPaths: evalCase.change_set,
      }),
      `EVAL-${evalCase.id}`,
      artifacts,
    ).filter((finding) => finding.driftType === evalCase.drift_type);
    const detected = findings.length > 0;
    const expected = evalCase.expected_finding_or_no_finding === "finding";
    const metric = counts[evalCase.drift_type];
    metric.cases += 1;
    if (detected && expected) metric.tp += 1;
    else if (detected && !expected) metric.fp += 1;
    else if (!detected && expected) metric.fn += 1;
    else metric.tn += 1;

    const formal = findings.filter((finding) => finding.status === "formal");
    formalFindingCount += formal.length;
    citedFormalFindingCount += formal.filter(
      (finding) => finding.sources.length > 0,
    ).length;

    if (detected !== expected) {
      failures.push({
        caseId: evalCase.id,
        classification: detected ? "false_positive" : "false_negative",
        stage: "detector",
        findingIds: findings.map((finding) => finding.id),
        details: expected
          ? "Expected a finding, but the detector emitted none."
          : "Expected no finding, but the detector emitted one or more findings.",
      });
    }
    if (detected && expected) {
      const actualSources = new Set(
        findings.flatMap((finding) =>
          finding.sources.map((source) => source.path),
        ),
      );
      const missingSources = evalCase.expected_sources.filter(
        (source) => !actualSources.has(source),
      );
      if (missingSources.length > 0) {
        failures.push({
          caseId: evalCase.id,
          classification: "source_mismatch",
          stage: "evidence",
          findingIds: findings.map((finding) => finding.id),
          details: `Missing expected source(s): ${missingSources.join(", ")}`,
        });
      }
    }
  });

  const caseCounts = {
    total: dataset.cases.length,
    D1: counts.D1.cases,
    D2: counts.D2.cases,
    D3: counts.D3.cases,
  };
  const citationCompleteness = ratio(
    citedFormalFindingCount,
    formalFindingCount,
  );
  const missingIndependentReviewerIds = dataset.cases
    .filter((evalCase) => evalCase.independent_reviewer === null)
    .map((evalCase) => evalCase.id);
  const gateReasons: string[] = [];
  if (caseCounts.total < 30) gateReasons.push("Fewer than 30 total cases.");
  (["D1", "D2", "D3"] as const).forEach((driftType) => {
    if (caseCounts[driftType] < 10) {
      gateReasons.push(`${driftType} has fewer than 10 cases.`);
    }
  });
  if (citationCompleteness !== 1) {
    gateReasons.push("Formal finding citation completeness is not 100%.");
  }
  if (missingIndependentReviewerIds.length > 0) {
    gateReasons.push(
      "One or more cases still lack an independent human reviewer; the synthetic author cannot self-certify ground truth.",
    );
  }
  const report = evalReportSchema.parse({
    schemaVersion: 1,
    toolVersion: TOOL_VERSION,
    dataset: {
      name: dataset.dataset,
      version: dataset.version,
      hash: sha256(raw),
    },
    generatedAt: (input.now ?? new Date()).toISOString(),
    caseCounts,
    metrics: Object.fromEntries(
      (["D1", "D2", "D3"] as const).map((driftType) => {
        const metric = counts[driftType];
        return [
          driftType,
          {
            ...metric,
            precision: ratio(metric.tp, metric.tp + metric.fp),
            recall: ratio(metric.tp, metric.tp + metric.fn),
          },
        ];
      }),
    ),
    citationCompleteness,
    failures,
    missingIndependentReviewerIds,
    gateE1: { achieved: gateReasons.length === 0, reasons: gateReasons },
    limitations: [
      "Cases are synthetic structural fixtures; they do not establish real-repository usefulness or adoption.",
      "Path and declared-coverage checks do not prove that tests validate runtime behavior.",
      ...(missingIndependentReviewerIds.length === 0
        ? []
        : [
            "Independent human review remains pending for fixture ground truth.",
          ]),
    ],
  });
  const jsonPath = path.join(input.outputDirectory, "eval-report.json");
  const markdownPath = path.join(input.outputDirectory, "eval-report.md");
  await writeFileAtomic(jsonPath, stableJson(report));
  await writeFileAtomic(markdownPath, renderEvaluationMarkdown(report));
  return { report, jsonPath, markdownPath };
}
