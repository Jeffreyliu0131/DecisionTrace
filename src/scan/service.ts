import path from "node:path";

import { collectArtifacts } from "../artifacts/collector.js";
import { loadConfiguration } from "../config/loader.js";
import { runDetectors } from "../detectors/index.js";
import { DecisionTraceError } from "../errors.js";
import { assembleFindings, summarizeFindings } from "../findings/engine.js";
import {
  resolveRevision,
  workingTreeStatus,
  type GitRevision,
} from "../git/adapter.js";
import { buildContractGraph } from "../graph/builder.js";
import { writeReportBundle, type ReportBundle } from "../reporters/write.js";
import {
  scanReportSchema,
  type Diagnostic,
  type RedactedSemanticInput,
  type ScanReport,
  type SemanticMode,
} from "../schemas/index.js";
import type { SemanticAnalyzer } from "../semantic/analyzer.js";
import { buildRedactedSemanticInput } from "../semantic/redaction.js";
import { runSemanticStage } from "../semantic/runtime.js";
import { writeFileAtomic } from "../utils/files.js";
import { sha256, stableHash, stableJson } from "../utils/hash.js";
import { assertSafeWritePath, resolveInsideRoot } from "../utils/paths.js";
import { TOOL_VERSION } from "../version.js";

export type ScanOptions = {
  repo: string;
  base?: string;
  head?: string;
  output?: string;
  semanticMode: SemanticMode;
  semanticAnalyzer?: SemanticAnalyzer;
  semanticTimeoutMilliseconds?: number;
  semanticInputOutput?: string;
  now?: () => Date;
};

export type ScanExecution = {
  report: ScanReport;
  bundle: ReportBundle;
  exitCode: 0 | 1;
  gateFindingIds: string[];
  semanticInput?: RedactedSemanticInput;
  semanticInputPath?: string;
};

function scanIdentifier(startedAt: Date, revision: GitRevision): string {
  const timestamp = startedAt.toISOString().replaceAll(/[-:.]/gu, "");
  return `SCAN-${timestamp}-${stableHash({ head: revision.head, base: revision.base }).slice(0, 8)}`;
}

export async function scanRepository(
  options: ScanOptions,
): Promise<ScanExecution> {
  const now = options.now ?? (() => new Date());
  const started = now();
  const revision = await resolveRevision(
    options.repo,
    options.base,
    options.head,
  );
  const loaded = await loadConfiguration(revision.root);
  const collection = await collectArtifacts(
    revision.root,
    loaded.config,
    revision.head,
  );
  const graph = buildContractGraph(loaded.registry, collection.artifacts);
  const scanId = scanIdentifier(started, revision);
  const deterministicDrafts = runDetectors({
    contracts: graph.activeContracts,
    artifacts: collection.artifacts,
    unregisteredSafePaths: collection.unregisteredSafePaths,
    changedPaths: revision.changedPaths,
  });
  const semanticContext =
    options.semanticMode === "off"
      ? undefined
      : buildRedactedSemanticInput({
          scanId,
          mode: options.semanticMode,
          contracts: graph.activeContracts,
          artifacts: collection.artifacts,
          changedPaths: revision.changedPaths,
        });
  const semantic = await runSemanticStage({
    mode: options.semanticMode,
    ...(options.semanticAnalyzer === undefined
      ? {}
      : { analyzer: options.semanticAnalyzer }),
    ...(semanticContext === undefined ? {} : { context: semanticContext }),
    contracts: graph.activeContracts,
    ...(options.semanticTimeoutMilliseconds === undefined
      ? {}
      : { timeoutMilliseconds: options.semanticTimeoutMilliseconds }),
  });
  const findings = assembleFindings(
    [...deterministicDrafts, ...semantic.findingDrafts],
    scanId,
    collection.artifacts,
  );
  const diagnostics: Diagnostic[] = [
    ...collection.diagnostics,
    ...graph.diagnostics,
    ...semantic.diagnostics,
  ];
  const dirtyEntries = await workingTreeStatus(revision.root);
  if (dirtyEntries.length > 0) {
    diagnostics.push({
      code: "WORKTREE_NOT_CLEAN",
      severity: "warning",
      message:
        "The scan read working-tree content while recording the current HEAD revision; artifact hashes preserve the exact observed bytes.",
      details: { changedEntryCount: dirtyEntries.length },
    });
  }
  let semanticInputPath: string | undefined;
  if (options.semanticInputOutput !== undefined) {
    if (semanticContext === undefined) {
      throw new DecisionTraceError(
        "A semantic input output path requires semantic mode local or cloud.",
        { code: "SEMANTIC_MODE_REQUIRED" },
      );
    }
    semanticInputPath = path.isAbsolute(options.semanticInputOutput)
      ? resolveInsideRoot(
          revision.root,
          path.relative(revision.root, options.semanticInputOutput),
          "semantic input output",
        )
      : resolveInsideRoot(
          revision.root,
          options.semanticInputOutput,
          "semantic input output",
        );
    await assertSafeWritePath(
      revision.root,
      semanticInputPath,
      "semantic input output",
    );
    await writeFileAtomic(semanticInputPath, stableJson(semanticContext.input));
  }
  const hasParserError = collection.artifacts.some(
    (artifact) => artifact.artifact.parserStatus === "error",
  );
  const result =
    hasParserError ||
    semantic.stage.status === "abstained" ||
    dirtyEntries.length > 0
      ? "partial"
      : "complete";
  const completed = now();
  const report = scanReportSchema.parse({
    schemaVersion: 1,
    toolVersion: TOOL_VERSION,
    scanId,
    repository: {
      rootHash: sha256(revision.root),
      ...(revision.base === undefined ? {} : { base: revision.base }),
      head: revision.head,
      ...(revision.requestedBase === undefined
        ? {}
        : { requestedBase: revision.requestedBase }),
      ...(revision.requestedHead === undefined
        ? {}
        : { requestedHead: revision.requestedHead }),
    },
    mode: revision.mode,
    semanticMode: options.semanticMode,
    semantic: semantic.stage,
    startedAt: started.toISOString(),
    completedAt: completed.toISOString(),
    coverage: {
      included: collection.artifacts.map((artifact) => artifact.artifact.path),
      skipped: collection.skipped,
    },
    artifacts: collection.artifacts.map((artifact) => artifact.artifact),
    contracts: loaded.registry.contracts,
    edges: graph.edges,
    changedPaths: revision.changedPaths,
    diagnostics,
    findings,
    summary: summarizeFindings(findings),
    result,
  });
  const configuredOutput =
    options.output ?? path.posix.join(loaded.config.reports, scanId);
  const bundle = await writeReportBundle({
    root: revision.root,
    directory: configuredOutput,
    report,
    configHash: loaded.configHash,
    contractRegistryHash: loaded.registryHash,
  });
  const gateFindingIds = loaded.config.gates.enabled
    ? findings
        .filter(
          (finding) =>
            finding.status === "formal" &&
            finding.driftType === "D2" &&
            finding.reasonKey.startsWith("d2-required-evidence-"),
        )
        .map((finding) => finding.id)
    : [];
  return {
    report,
    bundle,
    exitCode: gateFindingIds.length > 0 ? 1 : 0,
    gateFindingIds,
    ...(semanticContext === undefined
      ? {}
      : { semanticInput: semanticContext.input }),
    ...(semanticInputPath === undefined ? {} : { semanticInputPath }),
  };
}
