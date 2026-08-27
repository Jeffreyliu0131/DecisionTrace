import type {
  Finding,
  ScanReport,
  SemanticCandidate,
} from "../schemas/index.js";

function markdownEscape(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("`", "\\`")
    .replaceAll("|", "\\|");
}

function htmlEscape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function markdownFinding(finding: Finding): string {
  const sourceLines = finding.sources.length
    ? finding.sources
        .map((source) => {
          const location =
            source.startLine === undefined
              ? ""
              : `:${source.startLine}${source.endLine === undefined || source.endLine === source.startLine ? "" : `-${source.endLine}`}`;
          const locator =
            source.locator === undefined ? "" : ` (${source.locator})`;
          return `- \`${markdownEscape(source.path)}${location}\`${markdownEscape(locator)}`;
        })
        .join("\n")
    : "- None validated";
  const facts = finding.facts.length
    ? finding.facts
        .map((fact) => `- ${markdownEscape(fact.statement)}`)
        .join("\n")
    : "- None";
  const inferences = finding.inferences.length
    ? finding.inferences
        .map((inference) => `- ${markdownEscape(inference.statement)}`)
        .join("\n")
    : "- None";
  return `### ${finding.id} · ${finding.driftType} · ${finding.status}

- Severity: \`${finding.severity}\`
- Confidence: \`${finding.confidence.toFixed(2)}\`
- Contracts: ${finding.contractIds.map((id) => `\`${id}\``).join(", ") || "None"}

#### Facts

${facts}

#### Inferences

${inferences}

#### Sources

${sourceLines}

#### Suggested human review

${markdownEscape(finding.suggestedReview)}
`;
}

function markdownSemanticCandidate(candidate: SemanticCandidate): string {
  const detail =
    candidate.kind === "claim"
      ? `Proposed contract: ${candidate.proposedContract.title}`
      : candidate.kind === "edge"
        ? `Proposed edge: ${candidate.fromContractId} ${candidate.relation} ${candidate.toSourceId}`
        : `Candidate ${candidate.driftType}: ${candidate.contractIds.join(", ")}`;
  return `### ${candidate.id} · ${candidate.kind} · exploratory

- Provider: \`${markdownEscape(candidate.provider)}\`
- Confidence: \`${candidate.confidence.toFixed(2)}\`
- ${markdownEscape(detail)}
- Sources: ${candidate.sources.map((source) => `\`${markdownEscape(source.path)}\``).join(", ")}

#### Model inference

${markdownEscape(candidate.statement)}

#### Suggested human review

${markdownEscape(candidate.suggestedReview)}
`;
}

export function renderMarkdown(report: ScanReport): string {
  const diagnostics = report.diagnostics.length
    ? report.diagnostics
        .map(
          (diagnostic) =>
            `- \`${diagnostic.severity}\` \`${diagnostic.code}\`: ${markdownEscape(diagnostic.message)}`,
        )
        .join("\n")
    : "- None";
  const findings = report.findings.length
    ? report.findings.map(markdownFinding).join("\n")
    : "No findings.";
  const semanticCandidates = report.semantic.candidates.length
    ? report.semantic.candidates.map(markdownSemanticCandidate).join("\n")
    : "No semantic candidates.";
  return `# DecisionTrace Scan Report

| Field | Value |
|---|---|
| Scan | \`${report.scanId}\` |
| Result | \`${report.result}\` |
| Mode | \`${report.mode}\` |
| Head | \`${report.repository.head}\` |
| Base | ${report.repository.base === undefined ? "N/A" : `\`${report.repository.base}\``} |
| Semantic mode | \`${report.semanticMode}\` |
| Semantic stage | \`${report.semantic.status}\` via \`${markdownEscape(report.semantic.provider)}\` |
| Semantic candidates | ${report.semantic.candidates.length} |
| Included artifacts | ${report.artifacts.length} |
| Skipped artifacts | ${report.coverage.skipped.length} |
| Findings | ${report.summary.total} (${report.summary.formal} formal, ${report.summary.exploratory} exploratory, ${report.summary.abstained} abstained) |

## Diagnostics

${diagnostics}

## Semantic Candidates

${semanticCandidates}

## Findings

${findings}

---

DecisionTrace findings are candidates. A human reviewer owns disposition and release decisions.
`;
}

function htmlFinding(finding: Finding): string {
  const list = (items: { statement: string }[]): string =>
    items.length
      ? `<ul>${items.map((item) => `<li>${htmlEscape(item.statement)}</li>`).join("")}</ul>`
      : "<p>None</p>";
  const sources = finding.sources.length
    ? `<ul>${finding.sources
        .map((source) => {
          const location =
            source.startLine === undefined
              ? ""
              : `:${source.startLine}${source.endLine === undefined || source.endLine === source.startLine ? "" : `-${source.endLine}`}`;
          return `<li><code>${htmlEscape(source.path + location)}</code>${source.locator === undefined ? "" : ` (${htmlEscape(source.locator)})`}</li>`;
        })
        .join("")}</ul>`
    : "<p>None validated</p>";
  return `<article>
  <h3>${htmlEscape(finding.id)} · ${finding.driftType} · ${finding.status}</h3>
  <dl><dt>Severity</dt><dd>${finding.severity}</dd><dt>Confidence</dt><dd>${finding.confidence.toFixed(2)}</dd><dt>Contracts</dt><dd>${htmlEscape(finding.contractIds.join(", ") || "None")}</dd></dl>
  <h4>Facts</h4>${list(finding.facts)}
  <h4>Inferences</h4>${list(finding.inferences)}
  <h4>Sources</h4>${sources}
  <h4>Suggested human review</h4><p>${htmlEscape(finding.suggestedReview)}</p>
</article>`;
}

function htmlSemanticCandidate(candidate: SemanticCandidate): string {
  const detail =
    candidate.kind === "claim"
      ? `Proposed contract: ${candidate.proposedContract.title}`
      : candidate.kind === "edge"
        ? `Proposed edge: ${candidate.fromContractId} ${candidate.relation} ${candidate.toSourceId}`
        : `Candidate ${candidate.driftType}: ${candidate.contractIds.join(", ")}`;
  return `<article>
  <h3>${htmlEscape(candidate.id)} · ${candidate.kind} · exploratory</h3>
  <dl><dt>Provider</dt><dd>${htmlEscape(candidate.provider)}</dd><dt>Confidence</dt><dd>${candidate.confidence.toFixed(2)}</dd><dt>Candidate</dt><dd>${htmlEscape(detail)}</dd></dl>
  <h4>Model inference</h4><p>${htmlEscape(candidate.statement)}</p>
  <h4>Sources</h4><ul>${candidate.sources.map((source) => `<li><code>${htmlEscape(source.path)}</code></li>`).join("")}</ul>
  <h4>Suggested human review</h4><p>${htmlEscape(candidate.suggestedReview)}</p>
</article>`;
}

export function renderHtml(report: ScanReport): string {
  const diagnostics = report.diagnostics.length
    ? `<ul>${report.diagnostics.map((item) => `<li><code>${htmlEscape(item.severity)} ${htmlEscape(item.code)}</code>: ${htmlEscape(item.message)}</li>`).join("")}</ul>`
    : "<p>None</p>";
  const findings = report.findings.length
    ? report.findings.map(htmlFinding).join("\n")
    : "<p>No findings.</p>";
  const semanticCandidates = report.semantic.candidates.length
    ? report.semantic.candidates.map(htmlSemanticCandidate).join("\n")
    : "<p>No semantic candidates.</p>";
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
  <title>DecisionTrace ${htmlEscape(report.scanId)}</title>
  <style>body{max-width:960px;margin:0 auto;padding:2rem;font:16px/1.5 system-ui;color:#1f2937}code{background:#f3f4f6;padding:.1rem .3rem}article{border-top:1px solid #d1d5db;padding:1rem 0}dl{display:grid;grid-template-columns:max-content 1fr;gap:.25rem 1rem}dt{font-weight:700}h1,h2,h3{line-height:1.2}.warning{color:#92400e}</style>
</head>
<body>
  <h1>DecisionTrace Scan Report</h1>
  <dl><dt>Scan</dt><dd><code>${htmlEscape(report.scanId)}</code></dd><dt>Result</dt><dd>${report.result}</dd><dt>Mode</dt><dd>${report.mode}</dd><dt>Head</dt><dd><code>${htmlEscape(report.repository.head)}</code></dd><dt>Semantic stage</dt><dd>${report.semantic.status} via ${htmlEscape(report.semantic.provider)}</dd><dt>Semantic candidates</dt><dd>${report.semantic.candidates.length}</dd><dt>Findings</dt><dd>${report.summary.total} (${report.summary.formal} formal, ${report.summary.exploratory} exploratory, ${report.summary.abstained} abstained)</dd></dl>
  <h2>Diagnostics</h2>${diagnostics}
  <h2>Semantic Candidates</h2>${semanticCandidates}
  <h2>Findings</h2>${findings}
  <p class="warning">DecisionTrace findings are candidates. A human reviewer owns disposition and release decisions.</p>
</body>
</html>
`;
}
