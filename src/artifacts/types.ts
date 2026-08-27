import type {
  Artifact,
  Diagnostic,
  SkippedArtifact,
} from "../schemas/index.js";

export type ParsedNode = {
  kind: "heading" | "paragraph" | "frontmatter" | "json" | "yaml" | "text";
  text?: string;
  startLine?: number;
  endLine?: number;
  pointer?: string;
};

export type ParsedArtifact = {
  artifact: Artifact;
  nodes: ParsedNode[];
};

export type ArtifactCollection = {
  artifacts: ParsedArtifact[];
  skipped: SkippedArtifact[];
  diagnostics: Diagnostic[];
  unregisteredSafePaths: string[];
  unmatchedGlobs: string[];
};
