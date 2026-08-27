import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { scanRepository } from "../src/scan/service.js";
import type { RedactedSemanticInput } from "../src/schemas/index.js";
import type { SemanticAnalyzer } from "../src/semantic/analyzer.js";
import type { ReportHistory, SessionResponse } from "../src/ui/contracts.js";
import { LocalReportStore } from "../src/ui/report-store.js";
import { startUiServer, type UiServerHandle } from "../src/ui/server.js";
import {
  cleanupRepository,
  copyShadowRepository,
  git,
} from "./helpers/repository.js";

const repositories: string[] = [];
const servers: UiServerHandle[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
  await Promise.all(repositories.splice(0).map(cleanupRepository));
});

function clock(start: string, end: string): () => Date {
  const values = [new Date(start), new Date(end)];
  let index = 0;
  return () => values[Math.min(index++, 1)]!;
}

async function repositoryWithHistory(): Promise<string> {
  const root = await copyShadowRepository();
  repositories.push(root);
  await scanRepository({
    repo: root,
    semanticMode: "off",
    output: ".decisiontrace/reports/first",
    now: clock("2026-01-01T00:00:00.000Z", "2026-01-01T00:00:01.000Z"),
  });
  const base = await git(root, ["rev-parse", "HEAD"]);
  const service = path.join(root, "src/service.ts");
  await writeFile(
    service,
    `${await readFile(service, "utf8")}\n// UI comparison change\n`,
  );
  await git(root, ["add", "src/service.ts"]);
  await git(root, ["commit", "-m", "Change service for UI history"]);
  const head = await git(root, ["rev-parse", "HEAD"]);
  await scanRepository({
    repo: root,
    base,
    head,
    semanticMode: "off",
    output: ".decisiontrace/reports/second",
    now: clock("2026-01-02T00:00:00.000Z", "2026-01-02T00:00:01.000Z"),
  });
  return root;
}

class UiSemanticAnalyzer implements SemanticAnalyzer {
  readonly name = "ui-test-provider";

  analyze(input: RedactedSemanticInput): Promise<unknown> {
    const sourceId = input.sources[0]!.id;
    return Promise.resolve({
      schemaVersion: 1,
      inputId: input.inputId,
      candidates: [
        {
          kind: "claim",
          statement: "The UI test provider proposes a synthetic contract.",
          confidence: 0.6,
          sourceIds: [sourceId],
          suggestedReview: "Review the synthetic claim.",
          proposedContract: {
            title: "Synthetic UI contract",
            topic: "ui_test",
          },
        },
      ],
    });
  }
}

describe("local report store", () => {
  it("[AC-039, AC-042] inventories validated history, dashboard trends, and stable report comparison", async () => {
    const root = await repositoryWithHistory();
    const store = await LocalReportStore.open(root);
    const history = await store.history();
    expect(history.reports).toHaveLength(2);
    expect(history.reports[0]?.mode).toBe("diff");
    expect(
      history.reports.every((report) => /^RPT-[a-f0-9]{12}$/u.test(report.key)),
    ).toBe(true);

    const dashboard = await store.dashboard();
    expect(dashboard.reportCount).toBe(2);
    expect(dashboard.latest?.key).toBe(history.reports[0]?.key);
    expect(dashboard.trends).toHaveLength(2);

    const comparison = await store.compare(
      history.reports[1]!.key,
      history.reports[0]!.key,
    );
    expect(
      comparison.artifacts.changed.some(
        (item) => item.after.path === "src/service.ts",
      ),
    ).toBe(true);
    expect(
      comparison.findings.added.some((finding) => finding.driftType === "D3"),
    ).toBe(true);
  });

  it("[AC-039, AC-043] surfaces invalid reports and appends review through existing immutable contracts", async () => {
    const root = await repositoryWithHistory();
    const invalidDirectory = path.join(root, ".decisiontrace/reports/invalid");
    await mkdir(invalidDirectory, { recursive: true });
    await writeFile(
      path.join(invalidDirectory, "report.json"),
      "{invalid-json",
    );
    const store = await LocalReportStore.open(root);
    const history = await store.history();
    expect(history.invalidReports).toEqual([
      expect.objectContaining({
        relativePath: ".decisiontrace/reports/invalid/report.json",
      }),
    ]);
    const target = history.reports[0]!;
    const detail = await store.detail(target.key);
    const finding = detail.report.findings[0]!;
    const before = await readFile(
      path.join(root, ".decisiontrace/reports/second/report.json"),
    );
    await store.reviewFinding({
      reportKey: target.key,
      findingId: finding.id,
      decision: "intentional_change",
      reason: "UI test records an append-only disposition.",
    });
    const refreshed = await store.detail(target.key);
    expect(refreshed.reviews.findings[finding.id]?.decision).toBe(
      "intentional_change",
    );
    expect(
      await readFile(
        path.join(root, ".decisiontrace/reports/second/report.json"),
      ),
    ).toEqual(before);
  });
});

describe("loopback UI server", () => {
  it("[AC-040, AC-043, AC-044] serves read APIs and protects mutations with a local token", async ({
    skip,
  }) => {
    const root = await repositoryWithHistory();
    let server: UiServerHandle;
    try {
      server = await startUiServer({ repo: root, port: 0, apiOnly: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EPERM") {
        skip("The current sandbox forbids loopback listeners.");
        return;
      }
      throw error;
    }
    servers.push(server);
    expect(server.url).toMatch(/^http:\/\/127\.0\.0\.1:/u);

    const sessionResponse = await fetch(`${server.url}/api/session`);
    const session = (await sessionResponse.json()) as SessionResponse;
    expect(session.csrfToken).toHaveLength(48);
    expect(sessionResponse.headers.get("content-security-policy")).toContain(
      "default-src 'self'",
    );

    const historyResponse = await fetch(`${server.url}/api/reports`);
    const history = (await historyResponse.json()) as ReportHistory;
    expect(history.reports).toHaveLength(2);
    const target = history.reports[0]!;
    const detailResponse = await fetch(
      `${server.url}/api/reports/${target.key}`,
    );
    const detail = (await detailResponse.json()) as {
      report: { findings: Array<{ id: string }> };
    };
    const findingId = detail.report.findings[0]!.id;
    const body = JSON.stringify({
      reportKey: target.key,
      findingId,
      decision: "true_drift",
      reason: "The local API requires a valid mutation token.",
    });

    const rejected = await fetch(`${server.url}/api/reviews/findings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    expect(rejected.status).toBe(403);

    const crossSite = await fetch(`${server.url}/api/reviews/findings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-DecisionTrace-Token": session.csrfToken,
        "Sec-Fetch-Site": "cross-site",
      },
      body,
    });
    expect(crossSite.status).toBe(403);

    const accepted = await fetch(`${server.url}/api/reviews/findings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-DecisionTrace-Token": session.csrfToken,
      },
      body,
    });
    expect(accepted.status).toBe(201);
    const refreshed = (await (
      await fetch(`${server.url}/api/reports/${target.key}`)
    ).json()) as {
      reviews: { findings: Record<string, { decision: string }> };
    };
    expect(refreshed.reviews.findings[findingId]?.decision).toBe("true_drift");
  });

  it("[AC-040, AC-041] serves built-style assets with SPA fallback and restrictive headers", async ({
    skip,
  }) => {
    const root = await repositoryWithHistory();
    const assets = path.join(root, ".decisiontrace/cache/ui-assets");
    await mkdir(path.join(assets, "assets"), { recursive: true });
    await writeFile(
      path.join(assets, "index.html"),
      '<!doctype html><html><body><div id="root">DecisionTrace UI</div></body></html>',
    );
    await writeFile(path.join(assets, "assets/app.css"), "body{color:#172322}");
    let server: UiServerHandle;
    try {
      server = await startUiServer({
        repo: root,
        port: 0,
        assetsDirectory: assets,
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EPERM") {
        skip("The current sandbox forbids loopback listeners.");
        return;
      }
      throw error;
    }
    servers.push(server);

    const index = await fetch(`${server.url}/`);
    expect(await index.text()).toContain("DecisionTrace UI");
    expect(index.headers.get("x-frame-options")).toBe("DENY");
    expect(index.headers.get("content-security-policy")).not.toContain(
      "unsafe-inline",
    );

    const fallback = await fetch(`${server.url}/scans/RPT-000000000000`);
    expect(fallback.status).toBe(200);
    expect(await fallback.text()).toContain("DecisionTrace UI");

    const asset = await fetch(`${server.url}/assets/app.css`);
    expect(asset.headers.get("content-type")).toContain("text/css");
  });

  it("[AC-043, AC-044] appends semantic candidate disposition through the protected API", async ({
    skip,
  }) => {
    const root = await repositoryWithHistory();
    await scanRepository({
      repo: root,
      semanticMode: "local",
      semanticAnalyzer: new UiSemanticAnalyzer(),
      output: ".decisiontrace/reports/semantic-ui",
      now: clock("2026-01-03T00:00:00.000Z", "2026-01-03T00:00:01.000Z"),
    });
    let server: UiServerHandle;
    try {
      server = await startUiServer({ repo: root, port: 0, apiOnly: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EPERM") {
        skip("The current sandbox forbids loopback listeners.");
        return;
      }
      throw error;
    }
    servers.push(server);
    const session = (await (
      await fetch(`${server.url}/api/session`)
    ).json()) as SessionResponse;
    const history = (await (
      await fetch(`${server.url}/api/reports`)
    ).json()) as ReportHistory;
    const semanticReport = history.reports.find(
      (report) => report.semanticCandidates === 1,
    )!;
    const detail = (await (
      await fetch(`${server.url}/api/reports/${semanticReport.key}`)
    ).json()) as {
      report: { semantic: { candidates: Array<{ id: string }> } };
    };
    const candidateId = detail.report.semantic.candidates[0]!.id;
    const accepted = await fetch(`${server.url}/api/reviews/semantic`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-DecisionTrace-Token": session.csrfToken,
      },
      body: JSON.stringify({
        reportKey: semanticReport.key,
        candidateId,
        decision: "needs_context",
        reason: "Semantic UI API test requires more context.",
      }),
    });
    expect(accepted.status).toBe(201);
    const refreshed = (await (
      await fetch(`${server.url}/api/reports/${semanticReport.key}`)
    ).json()) as {
      reviews: {
        semanticCandidates: Record<string, { decision: string }>;
      };
    };
    expect(refreshed.reviews.semanticCandidates[candidateId]?.decision).toBe(
      "needs_context",
    );
  });
});
