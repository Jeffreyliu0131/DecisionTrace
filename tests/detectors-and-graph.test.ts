import { describe, expect, it } from "vitest";

import type { ParsedArtifact } from "../src/artifacts/types.js";
import { detectD1 } from "../src/detectors/d1-decision-conflict.js";
import { detectD2 } from "../src/detectors/d2-claim-without-evidence.js";
import { detectD3 } from "../src/detectors/d3-change-induced-mismatch.js";
import { assembleFinding } from "../src/findings/engine.js";
import type { FindingDraft } from "../src/findings/types.js";
import { buildContractGraph } from "../src/graph/builder.js";
import {
  contractRegistrySchema,
  contractSchema,
  type Contract,
  type SourceCategory,
} from "../src/schemas/index.js";
import { sha256 } from "../src/utils/hash.js";

function artifact(
  pathname: string,
  category: SourceCategory = "requirements",
  locators: string[] = [],
): ParsedArtifact {
  return {
    artifact: {
      id: `ART-${sha256(pathname).slice(0, 12)}`,
      category,
      path: pathname,
      revision: "fixture",
      contentHash: sha256(pathname),
      byteSize: 0,
      parserStatus: "parsed",
      diagnostics: [],
    },
    nodes: locators.map((locator, index) => ({
      kind: "heading",
      text: locator,
      startLine: index + 1,
      endLine: index + 1,
    })),
  };
}

function contract(
  id: string,
  overrides: Record<string, unknown> = {},
): Contract {
  return contractSchema.parse({
    id,
    title: id,
    status: "active",
    severity: "high",
    topic: "audit",
    rule: { operator: "require", object: "audit", applies_to: ["chat"] },
    defined_by: [{ path: `docs/${id}.md`, locator: id }],
    ...overrides,
  });
}

describe("contract graph", () => {
  it("[AC-010, AC-011] preserves edge metadata, reverse lookup, and non-active inventory", () => {
    const active = contract("CTR-001", {
      implemented_by: [{ path: "src/service.ts" }],
      verified_by: [
        { path: "tests/service.test.ts", required: true, covers: ["chat"] },
      ],
    });
    const candidate = contract("CTR-002", { status: "candidate" });
    const artifacts = [
      artifact("docs/CTR-001.md", "requirements", ["CTR-001"]),
      artifact("src/service.ts", "implementation"),
      artifact("tests/service.test.ts", "tests"),
    ];
    const graph = buildContractGraph(
      contractRegistrySchema.parse({
        version: 1,
        contracts: [active, candidate],
      }),
      artifacts,
    );
    expect(graph.activeContracts.map((item) => item.id)).toEqual(["CTR-001"]);
    expect(graph.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fromId: "CTR-001",
          relation: "implemented_by",
          basis: "declared",
          confidence: 1,
          reviewStatus: "confirmed",
        }),
      ]),
    );
    expect(graph.contractsForArtifact(artifacts[1]!.artifact.id)).toEqual([
      "CTR-001",
    ]);
  });

  it("[AC-012] retains both definition sources and reports conflict", () => {
    const dual = contract("CTR-003", {
      defined_by: [
        { path: "docs/a.md", locator: "CTR-003" },
        { path: "docs/b.md", locator: "CTR-003" },
      ],
    });
    const graph = buildContractGraph({ version: 1, contracts: [dual] }, [
      artifact("docs/a.md", "requirements", ["CTR-003"]),
      artifact("docs/b.md", "requirements", ["CTR-003"]),
    ]);
    expect(
      graph.edges.filter((edge) => edge.relation === "defined_by"),
    ).toHaveLength(2);
    expect(graph.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "SOURCE_DEFINITION_CONFLICT" }),
      ]),
    );
  });
});

describe("D1 detector", () => {
  it("[AC-013] detects an active supersedes active conflict with both sources", () => {
    const newer = contract("CTR-004", { supersedes: ["CTR-005"] });
    const older = contract("CTR-005");
    const artifacts = [
      artifact("docs/CTR-004.md", "decisions", ["CTR-004"]),
      artifact("docs/CTR-005.md", "decisions", ["CTR-005"]),
    ];
    const findings = detectD1([newer, older], artifacts);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.status).toBe("formal");
    expect(findings[0]?.sources.map((source) => source.path).sort()).toEqual([
      "docs/CTR-004.md",
      "docs/CTR-005.md",
    ]);
  });

  it("[AC-014, AC-015] detects only overlapping require/forbid structured rules", () => {
    const required = contract("CTR-006");
    const forbidden = contract("CTR-007", {
      rule: { operator: "forbid", object: "audit", applies_to: ["chat"] },
    });
    const disjoint = contract("CTR-008", {
      rule: { operator: "forbid", object: "audit", applies_to: ["rtc"] },
    });
    const artifacts = [
      artifact("docs/CTR-006.md", "decisions", ["CTR-006"]),
      artifact("docs/CTR-007.md", "decisions", ["CTR-007"]),
      artifact("docs/CTR-008.md", "decisions", ["CTR-008"]),
    ];
    const findings = detectD1([required, forbidden, disjoint], artifacts);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.contractIds.sort()).toEqual(["CTR-006", "CTR-007"]);
    const first = assembleFinding(findings[0]!, "SCAN-A", artifacts);
    const second = assembleFinding(findings[0]!, "SCAN-B", artifacts);
    expect(first.id).toBe(second.id);
  });

  it("[AC-020] keeps D1 exploratory if either side lacks a direct definition source", () => {
    const required = contract("CTR-012");
    const forbidden = contract("CTR-013", {
      rule: { operator: "forbid", object: "audit", applies_to: ["chat"] },
    });
    const findings = detectD1(
      [required, forbidden],
      [artifact("docs/CTR-012.md", "decisions", ["CTR-012"])],
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.status).toBe("exploratory");
  });
});

describe("D2 detector", () => {
  it("[AC-016] detects missing required evidence without judging behavior", () => {
    const subject = contract("CTR-009", {
      verified_by: [
        { path: "tests/missing.test.ts", required: true, covers: ["chat"] },
      ],
    });
    const artifacts = [
      artifact("docs/CTR-009.md", "requirements", ["CTR-009"]),
    ];
    const findings = detectD2([subject], artifacts, ["docs/CTR-009.md"]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.facts[0]?.statement).toContain(
      "matched no safe artifact",
    );
  });

  it("[AC-017] names only the declared coverage gap", () => {
    const subject = contract("CTR-010", {
      rule: {
        operator: "require",
        object: "audit",
        applies_to: ["chat", "rtc"],
      },
      verified_by: [
        { path: "tests/chat.test.ts", required: true, covers: ["chat"] },
      ],
    });
    const artifacts = [
      artifact("docs/CTR-010.md", "requirements", ["CTR-010"]),
      artifact("tests/chat.test.ts", "tests"),
    ];
    const findings = detectD2(
      [subject],
      artifacts,
      artifacts.map((item) => item.artifact.path),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.facts[0]?.statement).toContain("rtc");
    expect(findings[0]?.facts[0]?.statement).not.toContain("invalid test");
  });
});

describe("D3 detector and evidence gate", () => {
  const subject = contract("CTR-011", {
    implemented_by: [{ path: "src/service.ts" }],
    verified_by: [
      { path: "tests/service.test.ts", required: true, covers: ["chat"] },
    ],
    claimed_in: [{ path: "README.md" }],
  });
  const artifacts = [
    artifact("docs/CTR-011.md", "requirements", ["CTR-011"]),
    artifact("src/service.ts", "implementation"),
    artifact("tests/service.test.ts", "tests"),
    artifact("README.md", "public_claims"),
  ];

  it("[AC-018, AC-021] emits exploratory fact/inference-separated candidates", () => {
    const findings = detectD3([subject], artifacts, ["src/service.ts"]);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      status: "exploratory",
      confidence: 0.65,
    });
    expect(findings[0]?.facts).toHaveLength(1);
    expect(findings[0]?.inferences).toHaveLength(1);
  });

  it("[AC-019] retains an explicitly uncertain candidate when evidence also changed", () => {
    expect(
      detectD3([subject], artifacts, [
        "src/service.ts",
        "tests/service.test.ts",
      ]),
    ).toHaveLength(1);
  });

  it("[AC-020, AC-023] downgrades source-less formal drafts and keeps stable IDs", () => {
    const draft: FindingDraft = {
      driftType: "D1",
      status: "formal",
      severity: "high",
      confidence: 1,
      contractIds: ["CTR-011"],
      facts: [{ statement: "A direct fact.", sourceRefs: ["missing.md"] }],
      inferences: [],
      sources: [{ path: "missing.md" }],
      affectedPaths: ["missing.md"],
      suggestedReview: "Review.",
      reasonKey: "formal-without-valid-source",
    };
    const first = assembleFinding(draft, "SCAN-A", artifacts);
    const second = assembleFinding(draft, "SCAN-B", artifacts);
    expect(first.status).toBe("exploratory");
    expect(first.id).toBe(second.id);
  });
});

describe("audit regressions", () => {
  it("[FR-014, AC-019] README-only co-change cannot hide implementation impact", () => {
    const subject = contract("CTR-090", {
      implemented_by: [{ path: "src/service.ts" }],
      claimed_in: [{ path: "README.md" }],
    });
    const found = detectD3(
      [subject],
      [artifact("docs/CTR-090.md", "requirements", ["CTR-090"])],
      ["src/service.ts", "README.md"],
    );
    expect(found).toHaveLength(1);
    expect(found[0]?.status).toBe("exploratory");
    expect(found[0]?.facts[0]?.statement).toContain("unverified");
  });
  it("[FR-013, AC-016] requires a typed evidence value rather than a matching path", () => {
    const subject = contract("CTR-091", {
      verified_by: [
        {
          path: "result.json",
          required: true,
          covers: ["chat"],
          expect: { pointer: "/approved", equals: true },
        },
      ],
    });
    for (const value of [false, "true", undefined]) {
      const evidence = artifact("result.json", "evals");
      evidence.nodes = [
        {
          kind: "json",
          pointer: "/approved",
          ...(value === undefined ? {} : { value }),
        },
      ];
      expect(detectD2([subject], [evidence], [])).toHaveLength(1);
    }
    const evidence = artifact("result.json", "evals");
    evidence.nodes = [{ kind: "json", pointer: "/approved", value: true }];
    expect(detectD2([subject], [evidence], [])).toHaveLength(0);
  });
  it("[FR-013, AC-016] does not accept a missing locator or an unparseable evidence file", () => {
    const subject = contract("CTR-092", {
      verified_by: [
        {
          path: "test.md",
          locator: "actual-test",
          required: true,
          covers: ["chat"],
        },
      ],
    });
    expect(
      detectD2([subject], [artifact("test.md", "tests", ["unrelated"])], []),
    ).toHaveLength(1);
    const broken = artifact("test.md", "tests", ["actual-test"]);
    broken.artifact.parserStatus = "error";
    expect(detectD2([subject], [broken], [])).toHaveLength(1);
  });
});
