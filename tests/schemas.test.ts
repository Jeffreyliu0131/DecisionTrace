import { parse } from "yaml";
import { describe, expect, it } from "vitest";

import { DEFAULT_CONFIG } from "../src/config/defaults.js";
import {
  configSchema,
  contractRegistrySchema,
  evalCaseSchema,
  findingSchema,
} from "../src/schemas/index.js";

describe("runtime schemas", () => {
  it("[AC-003] rejects unknown top-level configuration fields", () => {
    const input = { ...parse(DEFAULT_CONFIG), mod: "local-only" };
    const result = configSchema.safeParse(input);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(JSON.stringify(result.error.issues)).toContain("mod");
    }
  });

  it("[AC-003] rejects a non-local mode instead of silently enabling egress", () => {
    const input = { ...parse(DEFAULT_CONFIG), mode: "cloud" };
    expect(configSchema.safeParse(input).success).toBe(false);
  });

  it("[AC-010] rejects duplicate contract IDs", () => {
    const contract = {
      id: "CTR-001",
      title: "Contract",
      status: "active",
      severity: "high",
      topic: "topic",
      rule: { operator: "require", object: "audit", applies_to: ["chat"] },
      defined_by: [{ path: "docs/contract.md" }],
    };
    expect(
      contractRegistrySchema.safeParse({
        version: 1,
        contracts: [contract, contract],
      }).success,
    ).toBe(false);
  });

  it("[AC-020] rejects a formal finding without direct facts and sources", () => {
    expect(
      findingSchema.safeParse({
        id: "FND-0123456789ab",
        scanId: "SCAN-1",
        driftType: "D1",
        status: "formal",
        severity: "high",
        confidence: 1,
        contractIds: ["CTR-001"],
        facts: [],
        inferences: [],
        sources: [],
        affectedPaths: [],
        suggestedReview: "Review it.",
        reasonKey: "missing-evidence",
      }).success,
    ).toBe(false);
  });

  it("keeps eval-case ground-truth provenance explicit", () => {
    const result = evalCaseSchema.safeParse({
      id: "EV-001",
      drift_type: "D1",
      repo_fixture_or_revision: "synthetic",
      artifacts: [],
      contracts: { version: 1, contracts: [] },
      change_set: [],
      expected_finding_or_no_finding: "no_finding",
      expected_sources: [],
      severity_rationale: "No active rules.",
      known_ambiguity: null,
      author: "fixture author",
      independent_reviewer: null,
      case_kind: "boundary",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.independent_reviewer).toBeNull();
    }
  });
});
