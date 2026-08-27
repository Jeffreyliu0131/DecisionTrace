import { z } from "zod";

export const sourceCategorySchema = z.enum([
  "requirements",
  "decisions",
  "ai_policies",
  "implementation",
  "tests",
  "evals",
  "public_claims",
]);

export const severitySchema = z.enum([
  "critical",
  "high",
  "medium",
  "low",
  "info",
]);

export const semanticModeSchema = z.enum(["off", "local", "cloud"]);

export const diagnosticSchema = z
  .object({
    code: z.string().min(1),
    severity: z.enum(["info", "warning", "error"]),
    message: z.string().min(1),
    path: z.string().min(1).optional(),
    field: z.string().min(1).optional(),
    recovery: z.string().min(1).optional(),
    details: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

const sourceDefinitionSchema = z
  .object({
    include: z.array(z.string().min(1)).min(1),
  })
  .strict();

export const configSchema = z
  .object({
    version: z.literal(1),
    mode: z.literal("local-only"),
    sources: z
      .object({
        requirements: sourceDefinitionSchema,
        decisions: sourceDefinitionSchema,
        ai_policies: sourceDefinitionSchema,
        implementation: sourceDefinitionSchema,
        tests: sourceDefinitionSchema,
        evals: sourceDefinitionSchema,
        public_claims: sourceDefinitionSchema,
      })
      .strict(),
    exclude: z.array(z.string().min(1)),
    contracts: z.string().min(1),
    reports: z.string().min(1),
    limits: z
      .object({
        max_file_bytes: z.number().int().positive(),
        max_total_text_bytes: z.number().int().positive(),
      })
      .strict(),
    gates: z
      .object({
        enabled: z.boolean(),
        deterministic_only: z.literal(true),
      })
      .strict(),
  })
  .strict();

const contractLinkSchema = z
  .object({
    path: z.string().min(1).optional(),
    glob: z.string().min(1).optional(),
    locator: z.string().min(1).optional(),
    required: z.boolean().optional(),
    covers: z.array(z.string().min(1)).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      Number(value.path !== undefined) + Number(value.glob !== undefined) !==
      1
    ) {
      context.addIssue({
        code: "custom",
        message: "Exactly one of path or glob is required",
        path: ["path"],
      });
    }
  });

export const contractIdSchema = z.string().regex(/^CTR-\d{3}$/u);

export const contractRuleSchema = z
  .object({
    operator: z.enum(["require", "forbid", "allow", "limit"]),
    object: z.string().min(1),
    applies_to: z.array(z.string().min(1)).min(1),
  })
  .strict();

export const contractSchema = z
  .object({
    id: contractIdSchema,
    title: z.string().min(1),
    status: z.enum(["candidate", "active", "superseded", "retired"]),
    severity: severitySchema,
    topic: z.string().min(1),
    rule: contractRuleSchema,
    defined_by: z.array(contractLinkSchema).min(1),
    implemented_by: z.array(contractLinkSchema).optional().default([]),
    enforced_by: z.array(contractLinkSchema).optional().default([]),
    verified_by: z.array(contractLinkSchema).optional().default([]),
    claimed_in: z.array(contractLinkSchema).optional().default([]),
    supersedes: z.array(contractIdSchema).optional().default([]),
  })
  .strict();

export const contractRegistrySchema = z
  .object({
    version: z.literal(1),
    contracts: z.array(contractSchema),
  })
  .strict()
  .superRefine((value, context) => {
    const seen = new Set<string>();
    value.contracts.forEach((contract, index) => {
      if (seen.has(contract.id)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate contract ID: ${contract.id}`,
          path: ["contracts", index, "id"],
        });
      }
      seen.add(contract.id);
    });
  });

export const artifactSchema = z
  .object({
    id: z.string().regex(/^ART-[a-f0-9]{12}$/u),
    category: sourceCategorySchema,
    path: z.string().min(1),
    revision: z.string().min(1),
    contentHash: z.string().regex(/^[a-f0-9]{64}$/u),
    byteSize: z.number().int().nonnegative(),
    parserStatus: z.enum(["parsed", "text_only", "skipped", "error"]),
    diagnostics: z.array(diagnosticSchema),
  })
  .strict();

export const traceEdgeSchema = z
  .object({
    fromId: z.string().min(1),
    relation: z.enum([
      "defined_by",
      "implemented_by",
      "enforced_by",
      "verified_by",
      "claimed_in",
      "supersedes",
      "affects",
    ]),
    toId: z.string().min(1),
    basis: z.enum(["declared", "deterministic", "model_candidate"]),
    confidence: z.number().min(0).max(1),
    reviewStatus: z.enum(["confirmed", "candidate", "rejected"]),
  })
  .strict();

export const sourceSpanSchema = z
  .object({
    path: z.string().min(1),
    startLine: z.number().int().positive().optional(),
    endLine: z.number().int().positive().optional(),
    locator: z.string().min(1).optional(),
    pointer: z.string().min(1).optional(),
    contentHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/u)
      .optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.startLine !== undefined &&
      value.endLine !== undefined &&
      value.endLine < value.startLine
    ) {
      context.addIssue({
        code: "custom",
        message: "endLine must be greater than or equal to startLine",
        path: ["endLine"],
      });
    }
  });

const semanticSourceIdSchema = z.string().regex(/^SRC-[a-f0-9]{12}$/u);
const semanticInputIdSchema = z.string().regex(/^SIN-[a-f0-9]{12}$/u);

export const redactedSemanticSourceSchema = z
  .object({
    id: semanticSourceIdSchema,
    artifactId: z.string().regex(/^ART-[a-f0-9]{12}$/u),
    category: sourceCategorySchema,
    contentHash: z.string().regex(/^[a-f0-9]{64}$/u),
    startLine: z.number().int().positive().optional(),
    endLine: z.number().int().positive().optional(),
    pointer: z.string().min(1).optional(),
    text: z.string().min(1).max(4000),
    truncated: z.boolean(),
  })
  .strict();

export const redactedSemanticInputSchema = z
  .object({
    schemaVersion: z.literal(1),
    inputId: semanticInputIdSchema,
    scanId: z.string().min(1),
    mode: z.enum(["local", "cloud"]),
    contracts: z.array(
      z
        .object({
          id: contractIdSchema,
          title: z.string().min(1).max(500),
          topic: z.string().min(1).max(200),
          rule: contractRuleSchema,
        })
        .strict(),
    ),
    sources: z.array(redactedSemanticSourceSchema).max(100),
    changedSourceIds: z.array(semanticSourceIdSchema),
    limits: z
      .object({
        maxSourceCharacters: z.number().int().positive().max(4000),
        maxTotalCharacters: z.number().int().positive().max(100000),
      })
      .strict(),
    stats: z
      .object({
        sourceCount: z.number().int().nonnegative(),
        contractCount: z.number().int().nonnegative(),
        characterCount: z.number().int().nonnegative(),
        redactionCount: z.number().int().nonnegative(),
        truncatedSourceCount: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict();

const semanticProviderCommonShape = {
  statement: z.string().min(1).max(4000),
  confidence: z.number().min(0).max(1),
  sourceIds: z.array(semanticSourceIdSchema).min(1).max(20),
  suggestedReview: z.string().min(1).max(2000),
};

export const semanticProviderCandidateSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("claim"),
      ...semanticProviderCommonShape,
      proposedContract: z
        .object({
          title: z.string().min(1).max(500),
          topic: z.string().min(1).max(200),
          rule: contractRuleSchema.optional(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("edge"),
      ...semanticProviderCommonShape,
      fromContractId: contractIdSchema,
      relation: z.enum([
        "defined_by",
        "implemented_by",
        "enforced_by",
        "verified_by",
        "claimed_in",
        "supersedes",
        "affects",
      ]),
      toSourceId: semanticSourceIdSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("conflict"),
      ...semanticProviderCommonShape,
      driftType: z.enum(["D1", "D2", "D3"]),
      contractIds: z.array(contractIdSchema).min(1).max(20),
      severity: severitySchema,
    })
    .strict(),
]);

export const semanticProviderResponseSchema = z
  .object({
    schemaVersion: z.literal(1),
    inputId: semanticInputIdSchema,
    candidates: z.array(semanticProviderCandidateSchema).max(100),
  })
  .strict();

const normalizedSemanticCommonShape = {
  id: z.string().regex(/^SEM-[a-f0-9]{12}$/u),
  basis: z.literal("model_candidate"),
  reviewStatus: z.literal("candidate"),
  status: z.literal("exploratory"),
  provider: z.string().min(1).max(200),
  statement: z.string().min(1).max(4000),
  confidence: z.number().min(0).max(1),
  sourceIds: z.array(semanticSourceIdSchema).min(1).max(20),
  sources: z.array(sourceSpanSchema).min(1).max(20),
  suggestedReview: z.string().min(1).max(2000),
};

export const semanticCandidateSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("claim"),
      ...normalizedSemanticCommonShape,
      proposedContract: z
        .object({
          title: z.string().min(1).max(500),
          topic: z.string().min(1).max(200),
          rule: contractRuleSchema.optional(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("edge"),
      ...normalizedSemanticCommonShape,
      fromContractId: contractIdSchema,
      relation: z.enum([
        "defined_by",
        "implemented_by",
        "enforced_by",
        "verified_by",
        "claimed_in",
        "supersedes",
        "affects",
      ]),
      toSourceId: semanticSourceIdSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("conflict"),
      ...normalizedSemanticCommonShape,
      driftType: z.enum(["D1", "D2", "D3"]),
      contractIds: z.array(contractIdSchema).min(1).max(20),
      severity: severitySchema,
    })
    .strict(),
]);

export const semanticStageSchema = z
  .object({
    status: z.enum(["off", "complete", "abstained"]),
    provider: z.string().min(1).max(200),
    input: z
      .object({
        inputId: semanticInputIdSchema.optional(),
        sourceCount: z.number().int().nonnegative(),
        contractCount: z.number().int().nonnegative(),
        characterCount: z.number().int().nonnegative(),
        redactionCount: z.number().int().nonnegative(),
        truncatedSourceCount: z.number().int().nonnegative(),
      })
      .strict(),
    candidates: z.array(semanticCandidateSchema),
  })
  .strict();

export const evidenceStatementSchema = z
  .object({
    statement: z.string().min(1),
    sourceRefs: z.array(z.string().min(1)),
  })
  .strict();

export const findingSchema = z
  .object({
    id: z.string().regex(/^FND-[a-f0-9]{12}$/u),
    scanId: z.string().min(1),
    driftType: z.enum(["D1", "D2", "D3"]),
    status: z.enum(["formal", "exploratory", "abstained"]),
    severity: severitySchema,
    confidence: z.number().min(0).max(1),
    contractIds: z.array(contractIdSchema),
    facts: z.array(evidenceStatementSchema),
    inferences: z.array(evidenceStatementSchema),
    sources: z.array(sourceSpanSchema),
    affectedPaths: z.array(z.string().min(1)),
    suggestedReview: z.string().min(1),
    reasonKey: z.string().min(1),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.status === "formal" &&
      (value.facts.length === 0 || value.sources.length === 0)
    ) {
      context.addIssue({
        code: "custom",
        message: "Formal findings require at least one fact and one source",
        path: ["status"],
      });
    }
  });

export const skippedArtifactSchema = z
  .object({
    path: z.string().min(1),
    reason: z.enum([
      "binary",
      "generated",
      "oversize",
      "total_limit",
      "sensitive",
      "excluded",
      "symlink",
      "outside_root",
      "unreadable",
    ]),
    byteSize: z.number().int().nonnegative().optional(),
  })
  .strict();

const countByDriftSchema = z
  .object({
    D1: z.number().int().nonnegative(),
    D2: z.number().int().nonnegative(),
    D3: z.number().int().nonnegative(),
  })
  .strict();

const countBySeveritySchema = z
  .object({
    critical: z.number().int().nonnegative(),
    high: z.number().int().nonnegative(),
    medium: z.number().int().nonnegative(),
    low: z.number().int().nonnegative(),
    info: z.number().int().nonnegative(),
  })
  .strict();

export const findingSummarySchema = z
  .object({
    total: z.number().int().nonnegative(),
    formal: z.number().int().nonnegative(),
    exploratory: z.number().int().nonnegative(),
    abstained: z.number().int().nonnegative(),
    byDriftType: countByDriftSchema,
    bySeverity: countBySeveritySchema,
  })
  .strict();

export const scanReportSchema = z
  .object({
    schemaVersion: z.literal(1),
    toolVersion: z.string().min(1),
    scanId: z.string().min(1),
    repository: z
      .object({
        rootHash: z.string().regex(/^[a-f0-9]{64}$/u),
        base: z.string().min(1).optional(),
        head: z.string().min(1),
        requestedBase: z.string().min(1).optional(),
        requestedHead: z.string().min(1).optional(),
      })
      .strict(),
    mode: z.enum(["full", "diff"]),
    semanticMode: semanticModeSchema,
    semantic: semanticStageSchema.optional().default({
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
    }),
    startedAt: z.iso.datetime({ offset: true }),
    completedAt: z.iso.datetime({ offset: true }),
    coverage: z
      .object({
        included: z.array(z.string().min(1)),
        skipped: z.array(skippedArtifactSchema),
      })
      .strict(),
    artifacts: z.array(artifactSchema),
    contracts: z.array(contractSchema),
    edges: z.array(traceEdgeSchema),
    changedPaths: z.array(z.string().min(1)),
    diagnostics: z.array(diagnosticSchema),
    findings: z.array(findingSchema),
    summary: findingSummarySchema,
    result: z.enum(["complete", "partial", "failed"]),
  })
  .strict();

export const reviewDecisionSchema = z.enum([
  "true_drift",
  "intentional_change",
  "false_positive",
  "accepted_risk",
  "insufficient_evidence",
]);

export const reviewSchema = z
  .object({
    findingId: z.string().regex(/^FND-[a-f0-9]{12}$/u),
    scanId: z.string().min(1),
    decision: reviewDecisionSchema,
    reason: z.string().trim().min(1),
    reviewer: z.string().trim().min(1).optional(),
    reviewedAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export const semanticReviewDecisionSchema = z.enum([
  "confirmed",
  "rejected",
  "needs_context",
  "duplicate",
]);

export const semanticReviewSchema = z
  .object({
    candidateId: z.string().regex(/^SEM-[a-f0-9]{12}$/u),
    scanId: z.string().min(1),
    kind: z.enum(["claim", "edge", "conflict"]),
    decision: semanticReviewDecisionSchema,
    reason: z.string().trim().min(1),
    reviewer: z.string().trim().min(1).optional(),
    reviewedAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export const evalCaseSchema = z
  .object({
    id: z.string().regex(/^EV-\d{3}$/u),
    drift_type: z.enum(["D1", "D2", "D3"]),
    repo_fixture_or_revision: z.string().min(1),
    artifacts: z.array(
      z
        .object({
          path: z.string().min(1),
          category: sourceCategorySchema,
        })
        .strict(),
    ),
    contracts: contractRegistrySchema,
    change_set: z.array(z.string().min(1)),
    expected_finding_or_no_finding: z.enum(["finding", "no_finding"]),
    expected_sources: z.array(z.string().min(1)),
    severity_rationale: z.string().min(1),
    known_ambiguity: z.string().min(1).nullable(),
    author: z.string().min(1),
    independent_reviewer: z.string().min(1).nullable(),
    case_kind: z.enum([
      "positive",
      "hard_negative",
      "boundary",
      "known_false_positive",
    ]),
  })
  .strict();

export const evalDatasetSchema = z
  .object({
    version: z.literal(1),
    dataset: z.string().min(1),
    cases: z.array(evalCaseSchema).min(1),
  })
  .strict()
  .superRefine((value, context) => {
    const seen = new Set<string>();
    value.cases.forEach((evalCase, index) => {
      if (seen.has(evalCase.id)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate eval case ID: ${evalCase.id}`,
          path: ["cases", index, "id"],
        });
      }
      seen.add(evalCase.id);
    });
  });

const metricValueSchema = z.union([
  z.number().min(0).max(1),
  z.literal("not_applicable"),
]);

const detectorMetricSchema = z
  .object({
    cases: z.number().int().nonnegative(),
    tp: z.number().int().nonnegative(),
    fp: z.number().int().nonnegative(),
    fn: z.number().int().nonnegative(),
    tn: z.number().int().nonnegative(),
    precision: metricValueSchema,
    recall: metricValueSchema,
  })
  .strict();

export const evalReportSchema = z
  .object({
    schemaVersion: z.literal(1),
    toolVersion: z.string().min(1),
    dataset: z
      .object({
        name: z.string().min(1),
        version: z.literal(1),
        hash: z.string().regex(/^[a-f0-9]{64}$/u),
      })
      .strict(),
    generatedAt: z.iso.datetime({ offset: true }),
    caseCounts: z
      .object({
        total: z.number().int().nonnegative(),
        D1: z.number().int().nonnegative(),
        D2: z.number().int().nonnegative(),
        D3: z.number().int().nonnegative(),
      })
      .strict(),
    metrics: z
      .object({
        D1: detectorMetricSchema,
        D2: detectorMetricSchema,
        D3: detectorMetricSchema,
      })
      .strict(),
    citationCompleteness: metricValueSchema,
    failures: z.array(
      z
        .object({
          caseId: z.string().regex(/^EV-\d{3}$/u),
          classification: z.enum([
            "false_positive",
            "false_negative",
            "source_mismatch",
          ]),
          stage: z.enum(["detector", "evidence"]),
          findingIds: z.array(z.string()),
          details: z.string().min(1),
        })
        .strict(),
    ),
    missingIndependentReviewerIds: z.array(z.string().regex(/^EV-\d{3}$/u)),
    gateE1: z
      .object({
        achieved: z.boolean(),
        reasons: z.array(z.string().min(1)),
      })
      .strict(),
    limitations: z.array(z.string().min(1)),
  })
  .strict();

export const manifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    toolVersion: z.string().min(1),
    scanId: z.string().min(1),
    configHash: z.string().regex(/^[a-f0-9]{64}$/u),
    contractRegistryHash: z.string().regex(/^[a-f0-9]{64}$/u),
    reportHash: z.string().regex(/^[a-f0-9]{64}$/u),
    repository: z
      .object({
        base: z.string().min(1).optional(),
        head: z.string().min(1),
      })
      .strict(),
  })
  .strict();

export type SourceCategory = z.infer<typeof sourceCategorySchema>;
export type Severity = z.infer<typeof severitySchema>;
export type SemanticMode = z.infer<typeof semanticModeSchema>;
export type Diagnostic = z.infer<typeof diagnosticSchema>;
export type DecisionTraceConfig = z.infer<typeof configSchema>;
export type ContractLink = z.infer<typeof contractLinkSchema>;
export type Contract = z.infer<typeof contractSchema>;
export type ContractRegistry = z.infer<typeof contractRegistrySchema>;
export type Artifact = z.infer<typeof artifactSchema>;
export type TraceEdge = z.infer<typeof traceEdgeSchema>;
export type SourceSpan = z.infer<typeof sourceSpanSchema>;
export type RedactedSemanticSource = z.infer<
  typeof redactedSemanticSourceSchema
>;
export type RedactedSemanticInput = z.infer<typeof redactedSemanticInputSchema>;
export type SemanticProviderCandidate = z.infer<
  typeof semanticProviderCandidateSchema
>;
export type SemanticProviderResponse = z.infer<
  typeof semanticProviderResponseSchema
>;
export type SemanticCandidate = z.infer<typeof semanticCandidateSchema>;
export type SemanticStage = z.infer<typeof semanticStageSchema>;
export type EvidenceStatement = z.infer<typeof evidenceStatementSchema>;
export type Finding = z.infer<typeof findingSchema>;
export type SkippedArtifact = z.infer<typeof skippedArtifactSchema>;
export type FindingSummary = z.infer<typeof findingSummarySchema>;
export type ScanReport = z.infer<typeof scanReportSchema>;
export type ReviewDecision = z.infer<typeof reviewDecisionSchema>;
export type Review = z.infer<typeof reviewSchema>;
export type SemanticReviewDecision = z.infer<
  typeof semanticReviewDecisionSchema
>;
export type SemanticReview = z.infer<typeof semanticReviewSchema>;
export type EvalCase = z.infer<typeof evalCaseSchema>;
export type EvalDataset = z.infer<typeof evalDatasetSchema>;
export type EvalReport = z.infer<typeof evalReportSchema>;
export type Manifest = z.infer<typeof manifestSchema>;
