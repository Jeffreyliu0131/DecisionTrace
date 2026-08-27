import path from "node:path";

import {
  manifestSchema,
  scanReportSchema,
  type Manifest,
  type ScanReport,
} from "../schemas/index.js";
import { writeFileAtomic } from "../utils/files.js";
import { sha256, stableJson } from "../utils/hash.js";
import { assertSafeWritePath, resolveInsideRoot } from "../utils/paths.js";
import { renderHtml, renderMarkdown } from "./render.js";

export type ReportBundle = {
  directory: string;
  reportJson: string;
  reportMarkdown: string;
  reportHtml: string;
  manifest: string;
};

function outputDirectory(root: string, configured: string): string {
  if (!path.isAbsolute(configured)) {
    return resolveInsideRoot(root, configured, "output");
  }
  const relative = path.relative(root, configured);
  return resolveInsideRoot(root, relative, "output");
}

export async function writeReportBundle(input: {
  root: string;
  directory: string;
  report: ScanReport;
  configHash: string;
  contractRegistryHash: string;
}): Promise<ReportBundle> {
  const report = scanReportSchema.parse(input.report);
  const directory = outputDirectory(input.root, input.directory);
  await assertSafeWritePath(input.root, directory, "output");
  const reportJsonContent = stableJson(report);
  const markdownContent = renderMarkdown(report);
  const htmlContent = renderHtml(report);
  const manifest: Manifest = manifestSchema.parse({
    schemaVersion: 1,
    toolVersion: report.toolVersion,
    scanId: report.scanId,
    configHash: input.configHash,
    contractRegistryHash: input.contractRegistryHash,
    reportHash: sha256(reportJsonContent),
    repository: {
      ...(report.repository.base === undefined
        ? {}
        : { base: report.repository.base }),
      head: report.repository.head,
    },
  });
  const reportJson = path.join(directory, "report.json");
  const reportMarkdown = path.join(directory, "report.md");
  const reportHtml = path.join(directory, "report.html");
  const manifestPath = path.join(directory, "manifest.json");

  await writeFileAtomic(reportJson, reportJsonContent);
  await writeFileAtomic(reportMarkdown, markdownContent);
  await writeFileAtomic(reportHtml, htmlContent);
  await writeFileAtomic(manifestPath, stableJson(manifest));
  return {
    directory,
    reportJson,
    reportMarkdown,
    reportHtml,
    manifest: manifestPath,
  };
}
