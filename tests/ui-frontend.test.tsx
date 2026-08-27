// @vitest-environment happy-dom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../ui/src/api.js", () => ({
  getSession: vi.fn(),
  getDashboard: vi.fn(),
  getHistory: vi.fn(),
  getReport: vi.fn(),
  compareReports: vi.fn(),
  submitFindingReview: vi.fn(),
  submitSemanticReview: vi.fn(),
}));

import { App } from "../ui/src/App.js";
import {
  compareReports,
  getDashboard,
  getHistory,
  getReport,
  getSession,
  submitFindingReview,
  submitSemanticReview,
} from "../ui/src/api.js";
import { scanReportSchema, type ScanReport } from "../src/schemas/index.js";
import type {
  DashboardData,
  ReportComparison,
  ReportDetail,
  ReportHistory,
  ReportListItem,
} from "../src/ui/contracts.js";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.history.pushState({}, "", "/");
});

function reportListItem(
  overrides: Partial<ReportListItem> = {},
): ReportListItem {
  return {
    key: "RPT-111111111111",
    scanId: "SCAN-20260102",
    completedAt: "2026-01-02T00:00:01.000Z",
    mode: "diff",
    result: "complete",
    semanticStatus: "off",
    head: "b".repeat(40),
    base: "a".repeat(40),
    findings: {
      total: 2,
      formal: 1,
      exploratory: 1,
      abstained: 0,
      D1: 1,
      D2: 1,
      D3: 0,
    },
    semanticCandidates: 0,
    diagnostics: 0,
    reviewProgress: { findingsReviewed: 0, semanticReviewed: 0 },
    ...overrides,
  };
}

function scanReport(): ScanReport {
  return scanReportSchema.parse({
    schemaVersion: 1,
    toolVersion: "0.3.0",
    scanId: "SCAN-20260102",
    repository: { rootHash: HASH_A, head: "b".repeat(40) },
    mode: "diff",
    semanticMode: "off",
    semantic: {
      status: "off",
      provider: "off",
      input: {
        sourceCount: 0,
        contractCount: 0,
        characterCount: 0,
        redactionCount: 0,
        truncatedSourceCount: 0,
      },
      candidates: [],
    },
    startedAt: "2026-01-02T00:00:00.000Z",
    completedAt: "2026-01-02T00:00:01.000Z",
    coverage: { included: ["docs/contract.md"], skipped: [] },
    artifacts: [
      {
        id: "ART-111111111111",
        category: "requirements",
        path: "docs/contract.md",
        revision: "b".repeat(40),
        contentHash: HASH_A,
        byteSize: 10,
        parserStatus: "parsed",
        diagnostics: [],
      },
    ],
    contracts: [],
    edges: [],
    changedPaths: ["src/service.ts"],
    diagnostics: [],
    findings: [
      {
        id: "FND-111111111111",
        scanId: "SCAN-20260102",
        driftType: "D1",
        status: "formal",
        severity: "high",
        confidence: 1,
        contractIds: ["CTR-001"],
        facts: [
          {
            statement: "Two active structured rules conflict.",
            sourceRefs: ["docs/contract.md"],
          },
        ],
        inferences: [],
        sources: [{ path: "docs/contract.md", contentHash: HASH_A }],
        affectedPaths: ["docs/contract.md"],
        suggestedReview: "Choose the active rule.",
        reasonKey: "d1-ui-fixture",
      },
      {
        id: "FND-222222222222",
        scanId: "SCAN-20260102",
        driftType: "D2",
        status: "exploratory",
        severity: "medium",
        confidence: 0.7,
        contractIds: ["CTR-002"],
        facts: [
          {
            statement: "RTC coverage is not declared.",
            sourceRefs: ["docs/contract.md"],
          },
        ],
        inferences: [],
        sources: [{ path: "docs/contract.md", contentHash: HASH_A }],
        affectedPaths: ["docs/contract.md"],
        suggestedReview: "Confirm the missing scope.",
        reasonKey: "d2-ui-fixture",
      },
    ],
    summary: {
      total: 2,
      formal: 1,
      exploratory: 1,
      abstained: 0,
      byDriftType: { D1: 1, D2: 1, D3: 0 },
      bySeverity: { critical: 0, high: 1, medium: 1, low: 0, info: 0 },
    },
    result: "complete",
  });
}

function reportWithSemanticCandidate(): ScanReport {
  const base = scanReport();
  return scanReportSchema.parse({
    ...base,
    semanticMode: "local",
    semantic: {
      status: "complete",
      provider: "ui-test-provider",
      input: {
        inputId: "SIN-111111111111",
        sourceCount: 1,
        contractCount: 1,
        characterCount: 20,
        redactionCount: 0,
        truncatedSourceCount: 0,
      },
      candidates: [
        {
          id: "SEM-111111111111",
          kind: "claim",
          basis: "model_candidate",
          reviewStatus: "candidate",
          status: "exploratory",
          provider: "ui-test-provider",
          statement: "A synthetic contract may be present.",
          confidence: 0.6,
          sourceIds: ["SRC-111111111111"],
          sources: [{ path: "docs/contract.md", contentHash: HASH_A }],
          suggestedReview: "Review the synthetic candidate.",
          proposedContract: {
            title: "Synthetic candidate contract",
            topic: "ui_test",
          },
        },
      ],
      cost: {
        status: "reported",
        currency: "USD",
        estimatedInputTokens: 140,
        maxOutputTokens: 500,
        estimatedMaxUsd: 0.00114,
        reportedInputTokens: 120,
        reportedOutputTokens: 40,
        reportedUsd: 0.0002,
      },
    },
  });
}

function history(): ReportHistory {
  return {
    reports: [
      reportListItem(),
      reportListItem({
        key: "RPT-222222222222",
        scanId: "SCAN-20260101",
        completedAt: "2026-01-01T00:00:01.000Z",
        mode: "full",
        head: "a".repeat(40),
        findings: {
          total: 1,
          formal: 1,
          exploratory: 0,
          abstained: 0,
          D1: 1,
          D2: 0,
          D3: 0,
        },
      }),
    ],
    invalidReports: [],
    reviewDiagnostics: [],
  };
}

describe("React review console", () => {
  it("[AC-045] renders dashboard metrics and recent history", async () => {
    vi.mocked(getSession).mockResolvedValue({
      csrfToken: "token",
      toolVersion: "0.3.0",
    });
    const dashboard: DashboardData = {
      reportCount: 2,
      invalidReportCount: 0,
      invalidReviewRecordCount: 0,
      latest: reportListItem(),
      reviewQueue: { unreviewedFindings: 2, unreviewedSemanticCandidates: 0 },
      trends: [
        {
          key: "RPT-111111111111",
          completedAt: "2026-01-02T00:00:01.000Z",
          totalFindings: 2,
          formalFindings: 1,
          exploratoryFindings: 1,
          semanticCandidates: 0,
        },
      ],
      recentReports: history().reports,
    };
    vi.mocked(getDashboard).mockResolvedValue(dashboard);

    render(<App />);
    expect(
      await screen.findByText("Contract drift at a glance"),
    ).not.toBeNull();
    expect(screen.getByText("Formal findings")).not.toBeNull();
    expect(screen.getByText("Recent scans")).not.toBeNull();
    expect(screen.getByLabelText("Open SCAN-20260102")).not.toBeNull();
  });

  it("[AC-046, AC-047] filters findings and submits an append-only disposition", async () => {
    window.history.pushState({}, "", "/scans/RPT-111111111111");
    vi.mocked(getSession).mockResolvedValue({
      csrfToken: "token",
      toolVersion: "0.3.0",
    });
    const detail: ReportDetail = {
      key: "RPT-111111111111",
      report: scanReport(),
      reviews: { findings: {}, semanticCandidates: {} },
    };
    vi.mocked(getReport).mockResolvedValue(detail);
    vi.mocked(submitFindingReview).mockResolvedValue({
      findingId: "FND-222222222222",
      scanId: "SCAN-20260102",
      decision: "intentional_change",
      reason: "The scope change is deliberate.",
      reviewedAt: "2026-01-03T00:00:00.000Z",
    });
    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByText("FND-111111111111")).not.toBeNull();
    await user.selectOptions(screen.getByLabelText("Drift"), "D2");
    expect(screen.queryByText("FND-111111111111")).toBeNull();
    expect(screen.getByText("FND-222222222222")).not.toBeNull();

    await user.selectOptions(
      screen.getByLabelText("Decision"),
      "intentional_change",
    );
    await user.type(
      screen.getByPlaceholderText("写下支持这个判断的最小充分理由"),
      "The scope change is deliberate.",
    );
    await user.click(screen.getByRole("button", { name: "追加到 review log" }));
    await waitFor(() =>
      expect(submitFindingReview).toHaveBeenCalledWith(
        expect.objectContaining({
          reportKey: "RPT-111111111111",
          findingId: "FND-222222222222",
          decision: "intentional_change",
        }),
      ),
    );
  });

  it("[AC-048] renders stable-ID comparison results", async () => {
    window.history.pushState({}, "", "/compare");
    vi.mocked(getSession).mockResolvedValue({
      csrfToken: "token",
      toolVersion: "0.3.0",
    });
    vi.mocked(getHistory).mockResolvedValue(history());
    const comparison: ReportComparison = {
      left: history().reports[1]!,
      right: history().reports[0]!,
      summaryDelta: {
        totalFindings: 1,
        formalFindings: 0,
        exploratoryFindings: 1,
        semanticCandidates: 0,
        diagnostics: 0,
      },
      findings: {
        added: [
          {
            id: "FND-222222222222",
            driftType: "D2",
            status: "exploratory",
            severity: "medium",
            confidence: 0.7,
            contractIds: ["CTR-002"],
          },
        ],
        removed: [],
        changed: [],
        unchanged: [],
      },
      semanticCandidates: {
        added: [],
        removed: [],
        changed: [],
        unchanged: [],
      },
      artifacts: {
        added: [],
        removed: [],
        changed: [
          {
            before: {
              path: "src/service.ts",
              category: "implementation",
              contentHash: HASH_A,
              parserStatus: "text_only",
            },
            after: {
              path: "src/service.ts",
              category: "implementation",
              contentHash: HASH_B,
              parserStatus: "text_only",
            },
          },
        ],
        unchanged: [],
      },
      diagnostics: { addedCodes: [], removedCodes: [], unchangedCodes: [] },
    };
    vi.mocked(compareReports).mockResolvedValue(comparison);
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText("Baseline");
    await user.click(screen.getByRole("button", { name: "比较" }));
    expect(await screen.findByText("FND-222222222222")).not.toBeNull();
    expect(screen.getByText("src/service.ts")).not.toBeNull();
  });

  it("[AC-047, AC-053] shows semantic cost and submits candidate disposition", async () => {
    window.history.pushState({}, "", "/scans/RPT-111111111111");
    vi.mocked(getSession).mockResolvedValue({
      csrfToken: "token",
      toolVersion: "0.3.0",
    });
    vi.mocked(getReport).mockResolvedValue({
      key: "RPT-111111111111",
      report: reportWithSemanticCandidate(),
      reviews: { findings: {}, semanticCandidates: {} },
    });
    vi.mocked(submitSemanticReview).mockResolvedValue({
      candidateId: "SEM-111111111111",
      scanId: "SCAN-20260102",
      kind: "claim",
      decision: "confirmed",
      reason: "The candidate is useful for the synthetic test.",
      reviewedAt: "2026-01-03T00:00:00.000Z",
    });
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("tab", { name: "Semantic 1" }));
    expect(
      screen.getByText("Reported 0.0002 USD · 120 input / 40 output tokens"),
    ).not.toBeNull();
    expect(screen.getByText("SEM-111111111111")).not.toBeNull();
    await user.selectOptions(screen.getByLabelText("Decision"), "confirmed");
    await user.type(
      screen.getByPlaceholderText("说明为何确认、拒绝或仍需上下文"),
      "The candidate is useful for the synthetic test.",
    );
    await user.click(
      screen.getByRole("button", { name: "追加到 semantic review log" }),
    );
    await waitFor(() =>
      expect(submitSemanticReview).toHaveBeenCalledWith(
        expect.objectContaining({
          reportKey: "RPT-111111111111",
          candidateId: "SEM-111111111111",
          decision: "confirmed",
        }),
      ),
    );
  });
});
