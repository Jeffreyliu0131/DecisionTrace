# Review UI demo assets

These JPEGs are direct browser screenshots of the loopback Review UI created by `npm run demo`; they are not image-generated mockups.

[`manifest.json`](manifest.json) records dimensions, byte sizes, SHA-256 hashes, routes, and the synthetic-only boundary.

| Asset | Synthetic route/state |
|---|---|
| `review-dashboard.jpg` | Dashboard after one baseline and one diff scan; 2 formal + 2 exploratory findings; 1 synthetic disposition |
| `review-findings.jpg` | Current report with facts, inferences, validated sources, severity/confidence, and append-only review state |
| `review-compare.jpg` | Baseline/current comparison showing 2 added exploratory D3 findings and the changed implementation artifact |
| `social-preview.jpg` | Direct 720×360 Dashboard capture prepared for the repository Settings → Social preview upload |

Reproduce with:

```bash
npm ci --ignore-scripts
npm run demo
```

The runner creates a temporary synthetic Git repository and removes it on exit. Screenshot content contains only tracked synthetic fixtures; it is product-demonstration evidence, not external usage, independent ground truth, or real-repository precision.

## Architecture diagram plan

- Purpose: show how one target repository feeds deterministic and explicitly optional semantic branches, then converges on evidence/report/review outputs.
- Audience: a technical recruiter or maintainer scanning the root README.
- Type: LR flowchart. It exposes branching and the outbound trust boundary more clearly than a list; Mermaid's newer architecture syntax was avoided for wider GitHub compatibility.
- Inventory: 11 declared nodes, one subgraph, no nested subgraphs, and no color-only meaning.
