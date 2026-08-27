export const DEFAULT_CONFIG = `version: 1
mode: local-only

sources:
  requirements:
    include: ["docs/**/*.md"]
  decisions:
    include: ["docs/adr/**/*.md"]
  ai_policies:
    include: ["docs/policies/**/*.md"]
  implementation:
    include: ["src/**/*.{ts,tsx,js,jsx}"]
  tests:
    include: ["**/*.{test,spec}.{ts,tsx,js,jsx}"]
  evals:
    include: ["evals/**/*.{json,jsonl,yaml,yml}"]
  public_claims:
    include: ["README.md", "CHANGELOG.md"]

exclude:
  - ".git/**"
  - "node_modules/**"
  - "dist/**"
  - "coverage/**"
  - ".decisiontrace/cache/**"
  - ".decisiontrace/reports/**"
  - "**/.env*"
  - "**/*secret*"

contracts: ".decisiontrace/contracts.yml"
reports: ".decisiontrace/reports"

limits:
  max_file_bytes: 1048576
  max_total_text_bytes: 26214400

gates:
  enabled: false
  deterministic_only: true
`;

export const DEFAULT_CONTRACTS = `version: 1
contracts: []

# Add human-confirmed contracts here. Candidate example:
# - id: CTR-001
#   title: Evidence-linked finding
#   status: candidate
#   severity: high
#   topic: formal_finding_evidence
#   rule:
#     operator: require
#     object: source_citation
#     applies_to: [formal_report]
#   defined_by:
#     - path: docs/01-PRD.md
#       locator: CTR-001
`;
