# thinkbud-ai dogfood analysis

## Conclusion

DecisionTrace completed a local-only diff scan of the public [`Jeffreyliu0131/thinkbud-ai`](https://github.com/Jeffreyliu0131/thinkbud-ai) repository at exact head `5a36aac88c5d2377105ab224b7e518e99b177c5c`, using base `43976c4c080c7791c51df035f06ea02c42d8f6b4` and semantic mode `off`.

The scan produced three deterministic D2 findings and no D1 or D3 findings. This is a source-backed dogfood result, not a precision claim: the five contracts and their required-evidence mappings were authored specifically for this run, and no independent human disposition has been recorded.

## Reproduction

1. Clone the public target and check out head `5a36aac88c5d2377105ab224b7e518e99b177c5c` with base `43976c4c080c7791c51df035f06ea02c42d8f6b4` available.
2. Copy [`config.yml`](config.yml) to the target root as `.decisiontrace.yml`.
3. Copy [`contracts.yml`](contracts.yml) to `.decisiontrace/contracts.yml`.
4. Ignore `.decisiontrace.yml` and `.decisiontrace/` locally so the public target remains clean.
5. From a built DecisionTrace checkout at `b1f1eab5bed92849e8c7c8dbecb6d643fcc8820a`, run:

```bash
node dist/cli/main.js scan \
  --repo <thinkbud-ai-path> \
  --base 43976c4 \
  --head 5a36aac88c5d2377105ab224b7e518e99b177c5c \
  --semantic off \
  --output .decisiontrace/reports/dogfood
```

The recorded run finished `complete`, with no parser/config diagnostics. The exact canonical output is [`sample/report.json`](sample/report.json).

## Finding triage

### `FND-468fd01826a9` — RTC default has no dedicated regression evidence

- Observed: `README.md` and `docs/ARCHITECTURE.md` state that managed RTC bypasses the application output guard and is disabled by default.
- Observed: `src/types/chatState.ts` implements the default through `VITE_ENABLE_RTC === 'true'`.
- Observed: no test file references `VITE_ENABLE_RTC`; the existing `useRTCVoice` tests exercise connection and recovery behavior, not the release default.
- Inferred: this is an actionable evidence gap for a safety-critical default.
- Proposed disposition: `true_drift` / D2 evidence gap, subject to independent human review.
- Important configuration boundary: the exact expected path `src/types/chatState.test.ts` is a dogfood evidence requirement, not a pre-existing thinkbud-ai file promise.

### `FND-6a3e0981e61b` — fresh live-model and human-review evidence is absent

- Observed: `docs/RELEASE_CHECKLIST.md` explicitly keeps the full release blocked until fresh live-model evidence and blinded human review exist.
- Observed: `evals/live/results/latest.json` is absent at the scanned revision.
- Inferred: the finding confirms an intentional current blocker rather than an accidental product drift.
- Proposed disposition: `accepted_risk` while the product remains a public technical prototype; do not claim model-release readiness.

### `FND-957f7d38f463` — project license evidence is absent

- Observed: no `LICENSE` file exists.
- Observed: the target README explicitly says no open-source license is granted and all rights are reserved.
- Inferred: the finding is a known release/distribution blocker, not evidence that the repository is internally inconsistent.
- Proposed disposition: `accepted_risk` until the owner makes the separate legal decision.

## Correct non-findings

- No D1 was emitted. The documentation explicitly distinguishes guarded text chat from unguarded managed RTC, so the narrower contracts are not mutually exclusive.
- No D3 was emitted for the selected diff. The changed paths are generated evaluation/provenance artifacts; none of the five declared implementation paths changed.
- No semantic candidate was emitted because semantic mode was deliberately `off`.

## Product limitations exposed by dogfood

1. D2 currently validates evidence path existence and declared coverage, not evidence contents. It therefore does not flag that `release/privacy-approval.json` has `approved: false` or that all entries in `provenance/assets.json` still have `ownerAttested: false`.
2. Required-evidence mappings are configuration judgments. A formal D2 finding proves the configured path is absent; it does not prove the team agreed that the path was required.
3. A matching test path does not prove behavioral sufficiency. The current deterministic core intentionally abstains from that semantic judgment.
4. This run covers one public revision range and no user behavior, production model call, child record, private source, or adoption evidence.

The dogfood result should be used as a review artifact and roadmap input, not as a claim of real-repository precision.
