import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { DecisionTraceError } from "../src/errors.js";
import { resolveRevision } from "../src/git/adapter.js";
import { scanReportSchema } from "../src/schemas/index.js";
import { scanRepository } from "../src/scan/service.js";
import {
  cleanupRepository,
  copyShadowRepository,
  git,
} from "./helpers/repository.js";

const repositories: string[] = [];

afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(repositories.splice(0).map(cleanupRepository));
});

function fixedClock(...values: string[]): () => Date {
  let index = 0;
  return () => new Date(values[Math.min(index++, values.length - 1)]!);
}

describe("scan integration", () => {
  it("[AC-005, AC-022, AC-023, AC-028, AC-030] produces deterministic full-scan reports without network access or finding-based failure", async () => {
    const root = await copyShadowRepository();
    repositories.push(root);
    const network = vi.fn(() => {
      throw new Error("Network access is forbidden in this test");
    });
    vi.stubGlobal("fetch", network);

    const first = await scanRepository({
      repo: root,
      semanticMode: "off",
      output: ".decisiontrace/reports/first",
      now: fixedClock("2026-01-01T00:00:00.000Z", "2026-01-01T00:00:01.000Z"),
    });
    const second = await scanRepository({
      repo: root,
      semanticMode: "off",
      output: ".decisiontrace/reports/second",
      now: fixedClock("2026-01-01T00:01:00.000Z", "2026-01-01T00:01:01.000Z"),
    });

    expect(network).not.toHaveBeenCalled();
    expect(first.exitCode).toBe(0);
    expect(first.report.result).toBe("complete");
    expect(first.report.mode).toBe("full");
    expect(first.report.repository.head).toMatch(/^[a-f0-9]{40}$/u);
    expect(first.report.artifacts.length).toBeGreaterThan(0);
    expect(
      first.report.artifacts.every(
        (artifact) =>
          artifact.contentHash.length === 64 &&
          artifact.parserStatus !== "skipped",
      ),
    ).toBe(true);
    expect(
      first.report.findings.some((finding) => finding.driftType === "D1"),
    ).toBe(true);
    expect(
      first.report.findings.some((finding) => finding.driftType === "D2"),
    ).toBe(true);
    expect(
      first.report.findings.every((finding) => finding.sources.length > 0),
    ).toBe(true);
    expect(first.report.findings.map((finding) => finding.id)).toEqual(
      second.report.findings.map((finding) => finding.id),
    );
    expect(first.report.artifacts).toEqual(second.report.artifacts);

    const json = await readFile(first.bundle.reportJson, "utf8");
    const markdown = await readFile(first.bundle.reportMarkdown, "utf8");
    const html = await readFile(first.bundle.reportHtml, "utf8");
    first.report.findings.forEach((finding) => {
      expect(json).toContain(finding.id);
      expect(markdown).toContain(finding.id);
      expect(html).toContain(finding.id);
    });
    expect(markdown).toContain(`${first.report.summary.total}`);
    expect(html).toContain(`${first.report.summary.total}`);
  });

  it("[AC-006, AC-018] uses only base...head changed paths for diff impact", async () => {
    const root = await copyShadowRepository();
    repositories.push(root);
    const base = await git(root, ["rev-parse", "HEAD"]);
    await writeFile(
      path.join(root, "src/service.ts"),
      "export function auditedMessage(input: string): string { return `v2:${input}`; }\n",
    );
    await git(root, ["add", "src/service.ts"]);
    await git(root, ["commit", "-m", "Change implementation only"]);
    const head = await git(root, ["rev-parse", "HEAD"]);

    const execution = await scanRepository({
      repo: root,
      base,
      head,
      semanticMode: "off",
      output: ".decisiontrace/reports/diff",
    });
    expect(execution.report.mode).toBe("diff");
    expect(execution.report.repository.base).toBe(base);
    expect(execution.report.repository.head).toBe(head);
    expect(execution.report.changedPaths).toEqual(["src/service.ts"]);
    const d3 = execution.report.findings.filter(
      (finding) => finding.driftType === "D3",
    );
    expect(d3.length).toBeGreaterThan(0);
    expect(d3.every((finding) => finding.status === "exploratory")).toBe(true);
  });

  it("[AC-008] reports an unavailable ref and never falls back to a full scan", async () => {
    const root = await copyShadowRepository();
    repositories.push(root);
    await expect(
      resolveRevision(root, "refs/heads/not-present", "HEAD"),
    ).rejects.toMatchObject({
      code: "GIT_REF_UNAVAILABLE",
    } satisfies Partial<DecisionTraceError>);
  });

  it("[AC-024] marks parser failures partial while preserving other findings", async () => {
    const root = await copyShadowRepository();
    repositories.push(root);
    await writeFile(
      path.join(root, "evals/broken.yml"),
      "key: [unterminated\n",
    );
    const execution = await scanRepository({
      repo: root,
      semanticMode: "off",
      output: ".decisiontrace/reports/partial",
    });
    expect(execution.report.result).toBe("partial");
    expect(execution.report.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "YAML_PARSE_ERROR" }),
      ]),
    );
    expect(execution.report.findings.length).toBeGreaterThan(0);
  });

  it("[AC-029] writes the complete report before an explicitly enabled deterministic gate returns 1", async () => {
    const root = await copyShadowRepository();
    repositories.push(root);
    const configPath = path.join(root, ".decisiontrace.yml");
    const config = await readFile(configPath, "utf8");
    await writeFile(
      configPath,
      config.replace("enabled: false", "enabled: true"),
    );
    const execution = await scanRepository({
      repo: root,
      semanticMode: "off",
      output: ".decisiontrace/reports/gated",
    });
    expect(execution.exitCode).toBe(1);
    expect(execution.gateFindingIds.length).toBeGreaterThan(0);
    const stored = scanReportSchema.parse(
      JSON.parse(await readFile(execution.bundle.reportJson, "utf8")),
    );
    expect(stored.summary.total).toBe(execution.report.summary.total);
    expect(stored.findings.map((finding) => finding.id)).toEqual(
      execution.report.findings.map((finding) => finding.id),
    );
  });

  it("[AC-032] abstains when semantic mode lacks an authorized provider and keeps deterministic findings", async () => {
    const root = await copyShadowRepository();
    repositories.push(root);
    const execution = await scanRepository({
      repo: root,
      semanticMode: "local",
      output: ".decisiontrace/reports/semantic-abstain",
    });
    expect(execution.report.result).toBe("partial");
    expect(execution.report.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "SEMANTIC_PROVIDER_UNAVAILABLE" }),
      ]),
    );
    expect(
      execution.report.findings.some((finding) => finding.status === "formal"),
    ).toBe(true);
  });
});
