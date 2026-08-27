import { lstat, realpath } from "node:fs/promises";
import path from "node:path";

import { DecisionTraceError } from "../errors.js";

export function toPosixPath(value: string): string {
  return value.split(path.sep).join(path.posix.sep);
}

export function validateRepoRelativePattern(
  value: string,
  field: string,
): void {
  const normalized = value.replaceAll("\\", "/");
  const segments = normalized.split("/");
  if (
    value.includes("\0") ||
    path.isAbsolute(value) ||
    /^[A-Za-z]:/u.test(value) ||
    segments.includes("..")
  ) {
    throw new DecisionTraceError(
      `${field} must stay inside the repository root: ${value}`,
      { code: "PATH_OUTSIDE_REPOSITORY" },
    );
  }
}

export function resolveInsideRoot(
  root: string,
  repoRelativePath: string,
  field: string,
): string {
  validateRepoRelativePattern(repoRelativePath, field);
  const resolved = path.resolve(root, repoRelativePath);
  const relative = path.relative(root, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new DecisionTraceError(
      `${field} resolves outside the repository root: ${repoRelativePath}`,
      { code: "PATH_OUTSIDE_REPOSITORY" },
    );
  }
  return resolved;
}

export function repositoryRelative(root: string, absolutePath: string): string {
  const relative = path.relative(root, absolutePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new DecisionTraceError(
      `Path resolves outside the repository root: ${absolutePath}`,
      { code: "PATH_OUTSIDE_REPOSITORY" },
    );
  }
  return toPosixPath(relative);
}

function assertResolvedInsideRoot(
  resolvedRoot: string,
  resolvedTarget: string,
  field: string,
): void {
  const relative = path.relative(resolvedRoot, resolvedTarget);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new DecisionTraceError(
      `${field} resolves outside the repository root: ${resolvedTarget}`,
      { code: "PATH_OUTSIDE_REPOSITORY" },
    );
  }
}

export async function resolveExistingInsideRoot(
  root: string,
  target: string,
  field: string,
): Promise<string> {
  const [resolvedRoot, resolvedTarget] = await Promise.all([
    realpath(root),
    realpath(target),
  ]);
  assertResolvedInsideRoot(resolvedRoot, resolvedTarget, field);
  return resolvedTarget;
}

export async function assertSafeWritePath(
  root: string,
  target: string,
  field: string,
): Promise<void> {
  const resolvedRoot = await realpath(root);
  const lexicalTarget = path.resolve(target);
  assertResolvedInsideRoot(resolvedRoot, lexicalTarget, field);
  const relative = path.relative(resolvedRoot, lexicalTarget);
  const segments = relative.split(path.sep).filter(Boolean);
  let cursor = resolvedRoot;
  for (const segment of segments) {
    cursor = path.join(cursor, segment);
    try {
      const metadata = await lstat(cursor);
      if (metadata.isSymbolicLink()) {
        throw new DecisionTraceError(
          `${field} cannot traverse or replace a symbolic link: ${repositoryRelative(resolvedRoot, cursor)}`,
          { code: "UNSAFE_WRITE_SYMLINK" },
        );
      }
    } catch (error) {
      if (
        error instanceof DecisionTraceError ||
        (error as NodeJS.ErrnoException).code !== "ENOENT"
      ) {
        throw error;
      }
      break;
    }
  }
}
