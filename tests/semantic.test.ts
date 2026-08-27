import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { ParsedArtifact } from "../src/artifacts/types.js";
import { main } from "../src/cli/main.js";
import { recordSemanticReview } from "../src/review/semantic.js";
import {
  contractSchema,
  scanReportSchema,
  type Contract,
  type RedactedSemanticInput,
} from "../src/schemas/index.js";
import type { SemanticAnalyzer } from "../src/semantic/analyzer.js";
import { FakeSemanticAnalyzer } from "../src/semantic/fake.js";
import { buildRedactedSemanticInput } from "../src/semantic/redaction.js";
import { runSemanticStage } from "../src/semantic/runtime.js";
import { scanRepository } from "../src/scan/service.js";
import { sha256 } from "../src/utils/hash.js";
import {
  cleanupRepository,
  copyShadowRepository,
} from "./helpers/repository.js";

const repositories: string[] = [];

afterEach(async () => {
  await Promise.all(repositories.splice(0).map(cleanupRepository));
});

function semanticContract(): Contract {
  return contractSchema.parse({
    id: "CTR-401",
    title: "Keep output audited",
    status: "active",
    severity: "medium",
    topic: "output_audit",
    rule: { operator: "require", object: "audit", applies_to: ["chat"] },
    defined_by: [{ path: "docs/contract.md", locator: "CTR-401" }],
    implemented_by: [{ path: "src/service.ts" }],
  });
}

function semanticArtifacts(text: string): ParsedArtifact[] {
  return [
    {
      artifact: {
        id: `ART-${sha256("docs/contract.md").slice(0, 12)}`,
        category: "requirements",
        path: "docs/contract.md",
        revision: "fixture",
        contentHash: sha256(text),
        byteSize: Buffer.byteLength(text),
        parserStatus: "parsed",
        diagnostics: [],
      },
      nodes: [
        {
          kind: "paragraph",
          text,
          startLine: 1,
          endLine: 1,
        },
      ],
    },
  ];
}

function semanticContext(text = "The output audit may be bypassed.") {
  return buildRedactedSemanticInput({
    scanId: "SCAN-SEMANTIC",
    mode: "local",
    contracts: [semanticContract()],
    artifacts: semanticArtifacts(text),
    changedPaths: ["docs/contract.md"],
  });
}

describe("semantic input boundary", () => {
  it("[AC-033] removes common secrets and raw paths before bounding provider input", () => {
    const secret =
      "api_key=sk-abcdefghijklmnop123456 email=user@example.com path=/Users/private-user/project " +
      "x".repeat(200);
    const context = buildRedactedSemanticInput({
      scanId: "SCAN-REDACT",
      mode: "cloud",
      contracts: [semanticContract()],
      artifacts: semanticArtifacts(secret),
      changedPaths: ["docs/contract.md"],
      limits: { maxSourceCharacters: 80, maxTotalCharacters: 80 },
    });
    const serialized = JSON.stringify(context.input);
    expect(serialized).not.toContain("sk-abcdefghijklmnop123456");
    expect(serialized).not.toContain("user@example.com");
    expect(serialized).not.toContain("private-user");
    expect(serialized).not.toContain("docs/contract.md");
    expect(context.input.stats.redactionCount).toBeGreaterThan(0);
    expect(context.input.stats.truncatedSourceCount).toBe(1);
    expect(context.input.stats.characterCount).toBeLessThanOrEqual(80);
    expect(context.input.changedSourceIds).toEqual([
      context.input.sources[0]!.id,
    ]);
  });
});

describe("semantic provider runtime", () => {
  it("[AC-034, AC-035] validates claim/edge/conflict candidates and keeps model statements exploratory", async () => {
    const context = semanticContext();
    const sourceId = context.input.sources[0]!.id;
    const analyzer = new FakeSemanticAnalyzer({
      response: {
        schemaVersion: 1,
        inputId: context.input.inputId,
        candidates: [
          {
            kind: "claim",
            statement: "A new audit guarantee may be present.",
            confidence: 0.55,
            sourceIds: [sourceId],
            suggestedReview: "Decide whether this should become a contract.",
            proposedContract: {
              title: "Audit every output",
              topic: "output_audit",
            },
          },
          {
            kind: "edge",
            statement: "This source may affect CTR-401.",
            confidence: 0.65,
            sourceIds: [sourceId],
            suggestedReview: "Confirm or reject the proposed affects edge.",
            fromContractId: "CTR-401",
            relation: "affects",
            toSourceId: sourceId,
          },
          {
            kind: "conflict",
            statement: "The source may bypass the required audit.",
            confidence: 0.8,
            sourceIds: [sourceId],
            suggestedReview: "Inspect the audit path before disposition.",
            driftType: "D1",
            contractIds: ["CTR-401"],
            severity: "critical",
          },
        ],
      },
    });
    const result = await runSemanticStage({
      mode: "local",
      analyzer,
      context,
      contracts: [semanticContract()],
    });
    expect(result.stage.status).toBe("complete");
    expect(result.stage.candidates).toHaveLength(3);
    expect(
      result.stage.candidates.map((candidate) => ({
        basis: candidate.basis,
        reviewStatus: candidate.reviewStatus,
        status: candidate.status,
      })),
    ).toEqual([
      {
        basis: "model_candidate",
        reviewStatus: "candidate",
        status: "exploratory",
      },
      {
        basis: "model_candidate",
        reviewStatus: "candidate",
        status: "exploratory",
      },
      {
        basis: "model_candidate",
        reviewStatus: "candidate",
        status: "exploratory",
      },
    ]);
    expect(result.findingDrafts).toHaveLength(1);
    expect(result.findingDrafts[0]).toMatchObject({
      status: "exploratory",
      severity: "medium",
    });
    expect(result.findingDrafts[0]?.facts[0]?.statement).not.toContain(
      "bypass",
    );
    expect(result.findingDrafts[0]?.inferences[0]?.statement).toContain(
      "bypass",
    );
  });

  it("[AC-036] rejects stale or unknown source references and emits no candidates", async () => {
    const context = semanticContext();
    const analyzer = new FakeSemanticAnalyzer({
      response: {
        schemaVersion: 1,
        inputId: context.input.inputId,
        candidates: [
          {
            kind: "conflict",
            statement: "Invented evidence.",
            confidence: 1,
            sourceIds: ["SRC-000000000000"],
            suggestedReview: "Do not trust this.",
            driftType: "D1",
            contractIds: ["CTR-401"],
            severity: "critical",
          },
        ],
      },
    });
    const result = await runSemanticStage({
      mode: "local",
      analyzer,
      context,
      contracts: [semanticContract()],
    });
    expect(result.stage.status).toBe("abstained");
    expect(result.stage.candidates).toEqual([]);
    expect(result.findingDrafts).toEqual([]);
    expect(result.diagnostics[0]?.code).toBe("SEMANTIC_OUTPUT_INVALID");
  });

  it("[AC-032, AC-036] aborts timeouts and preserves abstention", async () => {
    const context = semanticContext();
    const analyzer = new FakeSemanticAnalyzer({
      response: {
        schemaVersion: 1,
        inputId: context.input.inputId,
        candidates: [],
      },
      delayMilliseconds: 100,
    });
    const result = await runSemanticStage({
      mode: "local",
      analyzer,
      context,
      contracts: [semanticContract()],
      timeoutMilliseconds: 1,
    });
    expect(result.stage.status).toBe("abstained");
    expect(result.diagnostics[0]?.code).toBe("SEMANTIC_PROVIDER_TIMEOUT");
  });
});

class DynamicSemanticAnalyzer implements SemanticAnalyzer {
  readonly name = "dynamic-fake";

  analyze(input: RedactedSemanticInput, signal: AbortSignal): Promise<unknown> {
    if (signal.aborted)
      return Promise.reject(new Error("Dynamic fake aborted"));
    const sourceId = input.sources[0]!.id;
    return Promise.resolve({
      schemaVersion: 1,
      inputId: input.inputId,
      candidates: [
        {
          kind: "conflict",
          statement: "A semantic conflict may exist in the synthetic fixture.",
          confidence: 0.7,
          sourceIds: [sourceId],
          suggestedReview: "Review this candidate independently.",
          driftType: "D1",
          contractIds: ["CTR-001"],
          severity: "critical",
        },
      ],
    });
  }
}

describe("semantic scan integration", () => {
  it("[AC-034, AC-035, AC-038] adds exploratory semantic findings and appends candidate review", async () => {
    const root = await copyShadowRepository();
    repositories.push(root);
    const execution = await scanRepository({
      repo: root,
      semanticMode: "local",
      semanticAnalyzer: new DynamicSemanticAnalyzer(),
      output: ".decisiontrace/reports/semantic-complete",
    });
    expect(execution.report.result).toBe("complete");
    expect(execution.report.semantic.status).toBe("complete");
    expect(execution.report.semantic.candidates).toHaveLength(1);
    const semanticFindings = execution.report.findings.filter((finding) =>
      finding.reasonKey.startsWith("semantic-candidate:"),
    );
    expect(semanticFindings).toHaveLength(1);
    expect(semanticFindings[0]?.status).toBe("exploratory");
    expect(semanticFindings[0]?.severity).toBe("high");
    const markdown = await readFile(execution.bundle.reportMarkdown, "utf8");
    const candidateId = execution.report.semantic.candidates[0]!.id;
    expect(markdown).toContain(candidateId);
    expect(markdown).toContain("Model inference");
    const reportBeforeReview = await readFile(execution.bundle.reportJson);
    const review = await recordSemanticReview({
      cwd: root,
      reportPath: execution.bundle.reportJson,
      candidateId,
      decision: "needs_context",
      reason: "The fake candidate needs independent context.",
      now: new Date("2026-01-01T00:00:00.000Z"),
    });
    expect(await readFile(execution.bundle.reportJson)).toEqual(
      reportBeforeReview,
    );
    expect(JSON.parse(await readFile(review.reviewPath, "utf8"))).toMatchObject(
      {
        candidateId,
        kind: "conflict",
        decision: "needs_context",
      },
    );
    const reviewLogBeforeRejections = await readFile(review.reviewPath);
    await expect(
      recordSemanticReview({
        cwd: root,
        reportPath: execution.bundle.reportJson,
        candidateId,
        decision: "rejected",
        reason: "   ",
      }),
    ).rejects.toMatchObject({ code: "SEMANTIC_REVIEW_REASON_REQUIRED" });
    await expect(
      recordSemanticReview({
        cwd: root,
        reportPath: execution.bundle.reportJson,
        candidateId: "SEM-000000000000",
        decision: "rejected",
        reason: "Unknown candidate.",
      }),
    ).rejects.toMatchObject({ code: "SEMANTIC_CANDIDATE_NOT_FOUND" });
    expect(await readFile(review.reviewPath)).toEqual(
      reviewLogBeforeRejections,
    );
  });

  it("[AC-037] supports a bounded-input then offline-replay CLI round trip", async () => {
    const root = await copyShadowRepository();
    repositories.push(root);
    const firstCode = await main(
      [
        "node",
        "decisiontrace",
        "scan",
        "--repo",
        root,
        "--semantic",
        "local",
        "--semantic-input-output",
        ".decisiontrace/cache/semantic-input.json",
        "--output",
        ".decisiontrace/reports/semantic-prepare",
      ],
      { stdout: () => undefined, stderr: () => undefined },
    );
    expect(firstCode).toBe(0);
    const providerInput = JSON.parse(
      await readFile(
        path.join(root, ".decisiontrace/cache/semantic-input.json"),
        "utf8",
      ),
    ) as RedactedSemanticInput;
    const sourceId = providerInput.sources[0]!.id;
    await writeFile(
      path.join(root, ".decisiontrace/cache/semantic-replay.json"),
      JSON.stringify({
        schemaVersion: 1,
        inputId: providerInput.inputId,
        candidates: [
          {
            kind: "conflict",
            statement: "Offline replay proposes a synthetic conflict.",
            confidence: 0.6,
            sourceIds: [sourceId],
            suggestedReview: "Review the replay candidate.",
            driftType: "D1",
            contractIds: ["CTR-001"],
            severity: "high",
          },
        ],
      }),
    );
    const secondCode = await main(
      [
        "node",
        "decisiontrace",
        "scan",
        "--repo",
        root,
        "--semantic",
        "local",
        "--semantic-replay",
        ".decisiontrace/cache/semantic-replay.json",
        "--output",
        ".decisiontrace/reports/semantic-replay",
      ],
      { stdout: () => undefined, stderr: () => undefined },
    );
    expect(secondCode).toBe(0);
    const report = scanReportSchema.parse(
      JSON.parse(
        await readFile(
          path.join(root, ".decisiontrace/reports/semantic-replay/report.json"),
          "utf8",
        ),
      ),
    );
    expect(report.result).toBe("complete");
    expect(report.semantic).toMatchObject({
      status: "complete",
      provider: "offline-replay:semantic-replay.json",
    });
    expect(report.semantic.candidates).toHaveLength(1);
  });
});
