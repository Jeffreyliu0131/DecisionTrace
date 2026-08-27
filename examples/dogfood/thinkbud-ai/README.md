# thinkbud-ai dogfood configuration

This configuration targets the public repository [`Jeffreyliu0131/thinkbud-ai`](https://github.com/Jeffreyliu0131/thinkbud-ai). It is intentionally narrow and read-only.

The tracked contracts come from explicit public product and release statements. `CTR-504` additionally declares a dedicated regression test as required evidence for the safety-critical RTC default. That evidence requirement is a DecisionTrace dogfood judgment, not a claim that thinkbud-ai already promised a file with that exact name.

To reproduce against the recorded revision, copy `config.yml` to the target root as `.decisiontrace.yml`, copy `contracts.yml` to `.decisiontrace/contracts.yml`, ignore those local overlay paths, then run the command documented in `analysis.md`. Do not execute target-repository scripts merely to run DecisionTrace.

Recorded artifacts:

- [`analysis.md`](analysis.md): source-backed analyst triage and limitations.
- [`provenance.json`](provenance.json): exact target/tool revisions and artifact hashes.
- [`sample/report.json`](sample/report.json): canonical machine report.
- [`sample/report.md`](sample/report.md) and [`sample/report.html`](sample/report.html): renderings of the same JSON.

These artifacts do not copy thinkbud-ai source text. They retain public repo-relative paths, hashes, spans, structured contract metadata, and generated findings.
