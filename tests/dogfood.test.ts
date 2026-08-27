import { readFile } from "node:fs/promises";
import path from "node:path";

import { parse } from "yaml";
import { describe, expect, it } from "vitest";

import {
  configSchema,
  contractRegistrySchema,
  manifestSchema,
  scanReportSchema,
} from "../src/schemas/index.js";
import { sha256 } from "../src/utils/hash.js";
import { PROJECT_ROOT } from "./helpers/repository.js";

const dogfoodRoot = path.join(PROJECT_ROOT, "examples/dogfood/thinkbud-ai");

describe("public thinkbud-ai dogfood artifact", () => {
  it("[AC-049] keeps configuration, canonical report, renderings, and provenance reproducible", async () => {
    const [
      configRaw,
      contractsRaw,
      reportRaw,
      markdown,
      html,
      manifestRaw,
      provenanceRaw,
    ] = await Promise.all([
      readFile(path.join(dogfoodRoot, "config.yml"), "utf8"),
      readFile(path.join(dogfoodRoot, "contracts.yml"), "utf8"),
      readFile(path.join(dogfoodRoot, "sample/report.json"), "utf8"),
      readFile(path.join(dogfoodRoot, "sample/report.md"), "utf8"),
      readFile(path.join(dogfoodRoot, "sample/report.html"), "utf8"),
      readFile(path.join(dogfoodRoot, "sample/manifest.json"), "utf8"),
      readFile(path.join(dogfoodRoot, "provenance.json"), "utf8"),
    ]);

    configSchema.parse(parse(configRaw));
    const contracts = contractRegistrySchema.parse(parse(contractsRaw));
    expect(contracts.contracts.map((contract) => contract.id)).toEqual([
      "CTR-501",
      "CTR-502",
      "CTR-503",
      "CTR-504",
      "CTR-505",
    ]);

    const report = scanReportSchema.parse(JSON.parse(reportRaw));
    expect(report).toMatchObject({
      toolVersion: "0.3.0",
      mode: "diff",
      result: "complete",
      semanticMode: "off",
      repository: {
        base: "43976c4c080c7791c51df035f06ea02c42d8f6b4",
        head: "5a36aac88c5d2377105ab224b7e518e99b177c5c",
      },
      summary: {
        total: 3,
        formal: 3,
        exploratory: 0,
        byDriftType: { D1: 0, D2: 3, D3: 0 },
      },
    });
    expect(report.findings.map((finding) => finding.id).sort()).toEqual([
      "FND-468fd01826a9",
      "FND-6a3e0981e61b",
      "FND-957f7d38f463",
    ]);
    report.findings.forEach((finding) => {
      expect(markdown).toContain(finding.id);
      expect(html).toContain(finding.id);
    });

    const manifest = manifestSchema.parse(JSON.parse(manifestRaw));
    expect(manifest.configHash).toBe(sha256(configRaw));
    expect(manifest.contractRegistryHash).toBe(sha256(contractsRaw));
    expect(manifest.reportHash).toBe(sha256(reportRaw));

    const provenance = JSON.parse(provenanceRaw) as {
      artifacts: Record<string, string>;
      dataBoundary: Record<string, unknown>;
      reviewBoundary: Record<string, unknown>;
    };
    expect(provenance.artifacts).toEqual({
      manifestSha256: sha256(manifestRaw),
      reportJsonSha256: sha256(reportRaw),
      reportMarkdownSha256: sha256(markdown),
      reportHtmlSha256: sha256(html),
    });
    expect(provenance.dataBoundary).toMatchObject({
      sourceVisibility: "public",
      targetScriptsExecuted: false,
      networkOrModelCallsByDecisionTrace: 0,
      sourceTextCopiedIntoPublishedArtifacts: false,
      privateOrUserRecordsProcessed: false,
    });
    expect(provenance.reviewBoundary).toMatchObject({
      independentHumanDispositionComplete: false,
      precisionClaimAllowed: false,
    });
    for (const artifact of [
      reportRaw,
      markdown,
      html,
      manifestRaw,
      provenanceRaw,
    ]) {
      expect(artifact).not.toMatch(/\/Users\/|\/private\/|jefmacmini/u);
    }
  });
});
