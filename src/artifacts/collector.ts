import { lstat, readdir, readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";

import { minimatch } from "minimatch";

import type {
  DecisionTraceConfig,
  Diagnostic,
  SkippedArtifact,
  SourceCategory,
} from "../schemas/index.js";
import { readPrefix } from "../utils/files.js";
import { sha256 } from "../utils/hash.js";
import { repositoryRelative } from "../utils/paths.js";
import { parseArtifactContent } from "./parsers.js";
import type { ArtifactCollection, ParsedArtifact } from "./types.js";

const CATEGORY_ORDER: SourceCategory[] = [
  "requirements",
  "decisions",
  "ai_policies",
  "implementation",
  "tests",
  "evals",
  "public_claims",
];

const HARD_EXCLUDED_DIRECTORIES = new Set([
  ".git",
  "node_modules",
  "dist",
  "coverage",
]);

const MINIMATCH_OPTIONS = {
  dot: true,
  nocase: false,
  nonegate: true,
  nocomment: true,
} as const;

function matches(pathname: string, pattern: string): boolean {
  return minimatch(pathname, pattern, MINIMATCH_OPTIONS);
}

function matchingCategories(
  pathname: string,
  config: DecisionTraceConfig,
): SourceCategory[] {
  return CATEGORY_ORDER.filter((category) =>
    config.sources[category].include.some((pattern) =>
      matches(pathname, pattern),
    ),
  );
}

function isSensitive(pathname: string): boolean {
  return pathname.split("/").some((segment) => {
    const lower = segment.toLowerCase();
    return (
      lower === ".env" ||
      lower.startsWith(".env.") ||
      lower.includes("secret") ||
      lower === "credentials" ||
      lower.startsWith("credentials.")
    );
  });
}

function isExcluded(pathname: string, config: DecisionTraceConfig): boolean {
  return config.exclude.some((pattern) => matches(pathname, pattern));
}

function isBinary(prefix: Uint8Array): boolean {
  if (prefix.includes(0)) return true;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(prefix);
    return false;
  } catch {
    return true;
  }
}

function isGenerated(prefix: Uint8Array): boolean {
  const firstLines = new TextDecoder()
    .decode(prefix)
    .split(/\r?\n/u)
    .slice(0, 5)
    .join("\n");
  return /^(?:\s*(?:\/\/|#|<!--|\*)\s*)?(?:@generated|generated file|this file is generated|do not edit)\b/imu.test(
    firstLines,
  );
}

function skippedEntry(
  pathname: string,
  reason: SkippedArtifact["reason"],
  byteSize?: number,
): SkippedArtifact {
  return {
    path: pathname,
    reason,
    ...(byteSize === undefined ? {} : { byteSize }),
  };
}

export async function collectArtifacts(
  root: string,
  config: DecisionTraceConfig,
  revision: string,
): Promise<ArtifactCollection> {
  const parsedArtifacts: ParsedArtifact[] = [];
  const skipped: SkippedArtifact[] = [];
  const diagnostics: Diagnostic[] = [];
  const unregisteredSafePaths: string[] = [];
  const matchedGlobs = new Set<string>();
  let consumedBytes = 0;

  async function walk(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      const relative = repositoryRelative(root, absolute);

      if (entry.isSymbolicLink()) {
        const categories = matchingCategories(relative, config);
        if (categories.length > 0) {
          let reason: SkippedArtifact["reason"] = "symlink";
          try {
            const target = await realpath(absolute);
            const targetRelative = path.relative(root, target);
            if (
              targetRelative.startsWith("..") ||
              path.isAbsolute(targetRelative)
            ) {
              reason = "outside_root";
            }
          } catch {
            reason = "unreadable";
          }
          skipped.push(skippedEntry(relative, reason));
        }
        continue;
      }

      if (entry.isDirectory()) {
        if (
          HARD_EXCLUDED_DIRECTORIES.has(entry.name) ||
          isSensitive(relative) ||
          isExcluded(`${relative}/**`, config) ||
          isExcluded(relative, config)
        ) {
          skipped.push(
            skippedEntry(
              `${relative}/**`,
              isSensitive(relative) ? "sensitive" : "excluded",
            ),
          );
          continue;
        }
        await walk(absolute);
        continue;
      }

      if (!entry.isFile()) continue;
      const categories = matchingCategories(relative, config);
      const sensitive = isSensitive(relative);
      const excluded = isExcluded(relative, config);
      if (!sensitive && !excluded && categories.length === 0) {
        unregisteredSafePaths.push(relative);
      }
      if (categories.length === 0) continue;

      categories.forEach((category) => {
        config.sources[category].include.forEach((pattern) => {
          if (matches(relative, pattern))
            matchedGlobs.add(`${category}:${pattern}`);
        });
      });

      if (sensitive || excluded) {
        skipped.push(
          skippedEntry(relative, sensitive ? "sensitive" : "excluded"),
        );
        continue;
      }

      if (categories.length > 1) {
        diagnostics.push({
          code: "SOURCE_CATEGORY_CONFLICT",
          severity: "warning",
          message: `Artifact matches multiple source categories: ${categories.join(", ")}`,
          path: relative,
        });
      }
      const category = categories[0]!;
      let metadata;
      try {
        metadata = await stat(absolute);
      } catch {
        skipped.push(skippedEntry(relative, "unreadable"));
        continue;
      }
      if (metadata.size > config.limits.max_file_bytes) {
        skipped.push(skippedEntry(relative, "oversize", metadata.size));
        continue;
      }
      if (consumedBytes + metadata.size > config.limits.max_total_text_bytes) {
        skipped.push(skippedEntry(relative, "total_limit", metadata.size));
        continue;
      }

      let prefix: Uint8Array;
      try {
        prefix = await readPrefix(absolute, Math.min(8192, metadata.size));
      } catch {
        skipped.push(skippedEntry(relative, "unreadable", metadata.size));
        continue;
      }
      if (isBinary(prefix)) {
        skipped.push(skippedEntry(relative, "binary", metadata.size));
        continue;
      }
      if (isGenerated(prefix)) {
        skipped.push(skippedEntry(relative, "generated", metadata.size));
        continue;
      }

      let bytes: Buffer;
      try {
        bytes = await readFile(absolute);
      } catch {
        skipped.push(skippedEntry(relative, "unreadable", metadata.size));
        continue;
      }
      consumedBytes += bytes.byteLength;
      const content = bytes.toString("utf8");
      const parsed = parseArtifactContent(relative, content);
      const artifactDiagnostics = parsed.diagnostics;
      parsedArtifacts.push({
        artifact: {
          id: `ART-${sha256(relative).slice(0, 12)}`,
          category,
          path: relative,
          revision,
          contentHash: sha256(bytes),
          byteSize: bytes.byteLength,
          parserStatus: parsed.status,
          diagnostics: artifactDiagnostics,
        },
        nodes: parsed.nodes,
      });
      diagnostics.push(...artifactDiagnostics);
    }
  }

  await lstat(root);
  await walk(root);
  parsedArtifacts.sort((left, right) =>
    left.artifact.path.localeCompare(right.artifact.path),
  );
  skipped.sort((left, right) => left.path.localeCompare(right.path));
  unregisteredSafePaths.sort();

  const unmatchedGlobs: string[] = [];
  CATEGORY_ORDER.forEach((category) => {
    config.sources[category].include.forEach((pattern) => {
      const key = `${category}:${pattern}`;
      if (!matchedGlobs.has(key)) {
        unmatchedGlobs.push(pattern);
        diagnostics.push({
          code: "SOURCE_GLOB_UNMATCHED",
          severity: "warning",
          message: `Source glob matched no safe artifact: ${pattern}`,
          field: `sources.${category}.include`,
        });
      }
    });
  });

  return {
    artifacts: parsedArtifacts,
    skipped,
    diagnostics,
    unregisteredSafePaths,
    unmatchedGlobs,
  };
}
