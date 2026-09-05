import { minimatch } from "minimatch";

import type { ParsedArtifact } from "../artifacts/types.js";
import type { ContractLink, SourceSpan } from "../schemas/index.js";

const OPTIONS = {
  dot: true,
  nocase: false,
  nonegate: true,
  nocomment: true,
} as const;

export function linkMatchesPath(link: ContractLink, pathname: string): boolean {
  if (link.path !== undefined) return pathname === link.path;
  return link.glob === undefined
    ? false
    : minimatch(pathname, link.glob, OPTIONS);
}

export function matchingArtifacts(
  link: ContractLink,
  artifacts: ParsedArtifact[],
): ParsedArtifact[] {
  return artifacts.filter((artifact) =>
    linkMatchesPath(link, artifact.artifact.path),
  );
}

export function sourceSpansForLink(
  link: ContractLink,
  artifacts: ParsedArtifact[],
): SourceSpan[] {
  return matchingArtifacts(link, artifacts).map((parsed) => {
    const locatorNode =
      link.expect !== undefined
        ? parsed.nodes.find((node) => node.pointer === link.expect!.pointer)
        : link.locator === undefined
          ? undefined
          : parsed.nodes.find((node) => node.text?.includes(link.locator!));
    return {
      path: parsed.artifact.path,
      contentHash: parsed.artifact.contentHash,
      ...(link.locator === undefined ? {} : { locator: link.locator }),
      ...(locatorNode?.startLine === undefined
        ? {}
        : { startLine: locatorNode.startLine }),
      ...(locatorNode?.endLine === undefined
        ? {}
        : { endLine: locatorNode.endLine }),
      ...(locatorNode?.pointer === undefined
        ? {}
        : { pointer: locatorNode.pointer }),
    };
  });
}
