import path from "node:path";

import { parseDocument } from "yaml";

import type { Diagnostic } from "../schemas/index.js";
import type { ParsedNode } from "./types.js";

export type ParseResult = {
  status: "parsed" | "text_only" | "error";
  nodes: ParsedNode[];
  diagnostics: Diagnostic[];
};

function lineNumberAtOffset(content: string, offset: number): number {
  return content.slice(0, offset).split("\n").length;
}

function parseMarkdown(content: string, filePath: string): ParseResult {
  const diagnostics: Diagnostic[] = [];
  const nodes: ParsedNode[] = [];
  const lines = content.split(/\r?\n/u);
  let index = 0;

  if (lines[0]?.trim() === "---") {
    const end = lines.slice(1).findIndex((line) => line.trim() === "---");
    if (end >= 0) {
      const endIndex = end + 1;
      const rawFrontmatter = lines.slice(1, endIndex).join("\n");
      const document = parseDocument(rawFrontmatter, {
        prettyErrors: true,
        uniqueKeys: true,
      });
      if (document.errors.length > 0) {
        diagnostics.push({
          code: "MARKDOWN_FRONTMATTER_PARSE_ERROR",
          severity: "error",
          message: document.errors.map((error) => error.message).join("; "),
          path: filePath,
        });
      } else {
        nodes.push({
          kind: "frontmatter",
          text: rawFrontmatter,
          startLine: 1,
          endLine: endIndex + 1,
        });
      }
      index = endIndex + 1;
    }
  }

  while (index < lines.length) {
    const current = lines[index] ?? "";
    const heading = /^(#{1,6})\s+(.+)$/u.exec(current);
    if (heading) {
      nodes.push({
        kind: "heading",
        text: heading[2]?.trim(),
        startLine: index + 1,
        endLine: index + 1,
      });
      index += 1;
      continue;
    }
    if (current.trim() === "" || current.trim().startsWith("```")) {
      index += 1;
      continue;
    }
    const start = index;
    const paragraph: string[] = [];
    while (
      index < lines.length &&
      (lines[index] ?? "").trim() !== "" &&
      !/^(#{1,6})\s+/u.test(lines[index] ?? "")
    ) {
      paragraph.push(lines[index] ?? "");
      index += 1;
    }
    nodes.push({
      kind: "paragraph",
      text: paragraph.join("\n"),
      startLine: start + 1,
      endLine: index,
    });
  }

  return {
    status: diagnostics.some((item) => item.severity === "error")
      ? "error"
      : "parsed",
    nodes,
    diagnostics,
  };
}

function visitStructured(
  value: unknown,
  pointer: string,
  kind: "json" | "yaml",
  nodes: ParsedNode[],
): void {
  const text =
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
      ? String(value)
      : undefined;
  nodes.push({
    kind,
    pointer: pointer || "/",
    ...(value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
      ? { value }
      : {}),
    ...(text === undefined ? {} : { text }),
  });
  if (Array.isArray(value)) {
    value.forEach((nested, index) =>
      visitStructured(nested, `${pointer}/${index}`, kind, nodes),
    );
    return;
  }
  if (value !== null && typeof value === "object") {
    Object.entries(value).forEach(([key, nested]) => {
      const escaped = key.replaceAll("~", "~0").replaceAll("/", "~1");
      visitStructured(nested, `${pointer}/${escaped}`, kind, nodes);
    });
  }
}

function parseJson(content: string, filePath: string): ParseResult {
  try {
    const value: unknown = JSON.parse(content);
    const nodes: ParsedNode[] = [];
    visitStructured(value, "", "json", nodes);
    return { status: "parsed", nodes, diagnostics: [] };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const position = /position (\d+)/u.exec(message)?.[1];
    return {
      status: "error",
      nodes: [],
      diagnostics: [
        {
          code: "JSON_PARSE_ERROR",
          severity: "error",
          message,
          path: filePath,
          ...(position === undefined
            ? {}
            : {
                details: {
                  line: lineNumberAtOffset(content, Number(position)),
                },
              }),
        },
      ],
    };
  }
}

function parseYaml(content: string, filePath: string): ParseResult {
  const document = parseDocument(content, {
    prettyErrors: true,
    uniqueKeys: true,
  });
  if (document.errors.length > 0) {
    return {
      status: "error",
      nodes: [],
      diagnostics: document.errors.map((error) => ({
        code: "YAML_PARSE_ERROR",
        severity: "error" as const,
        message: error.message,
        path: filePath,
      })),
    };
  }
  const nodes: ParsedNode[] = [];
  visitStructured(document.toJS({ maxAliasCount: 100 }), "", "yaml", nodes);
  return { status: "parsed", nodes, diagnostics: [] };
}

export function parseArtifactContent(
  filePath: string,
  content: string,
): ParseResult {
  const extension = path.posix.extname(filePath).toLowerCase();
  if (extension === ".md" || extension === ".markdown") {
    return parseMarkdown(content, filePath);
  }
  if (extension === ".json" || extension === ".jsonl") {
    if (extension === ".jsonl") {
      const lines = content
        .split(/\r?\n/u)
        .filter((line) => line.trim() !== "");
      const nodes: ParsedNode[] = [];
      const diagnostics: Diagnostic[] = [];
      lines.forEach((line, index) => {
        const result = parseJson(line, filePath);
        if (result.status === "error") {
          diagnostics.push(
            ...result.diagnostics.map((diagnostic) => ({
              ...diagnostic,
              details: { ...diagnostic.details, line: index + 1 },
            })),
          );
        } else {
          nodes.push(
            ...result.nodes.map((node) => ({
              ...node,
              pointer: `/lines/${index + 1}${node.pointer ?? ""}`,
            })),
          );
        }
      });
      return {
        status: diagnostics.length > 0 ? "error" : "parsed",
        nodes,
        diagnostics,
      };
    }
    return parseJson(content, filePath);
  }
  if (extension === ".yaml" || extension === ".yml") {
    return parseYaml(content, filePath);
  }
  return {
    status: "text_only",
    nodes: [
      {
        kind: "text",
        text: content,
        startLine: 1,
        endLine: Math.max(1, content.split(/\r?\n/u).length),
      },
    ],
    diagnostics: [],
  };
}
