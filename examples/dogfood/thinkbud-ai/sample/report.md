# DecisionTrace Scan Report

| Field | Value |
|---|---|
| Scan | `SCAN-20260827T133420362Z-ead1089d` |
| Result | `complete` |
| Mode | `diff` |
| Head | `5a36aac88c5d2377105ab224b7e518e99b177c5c` |
| Base | `43976c4c080c7791c51df035f06ea02c42d8f6b4` |
| Semantic mode | `off` |
| Semantic stage | `off` via `off` |
| Semantic candidates | 0 |
| Included artifacts | 195 |
| Skipped artifacts | 6 |
| Findings | 3 (3 formal, 0 exploratory, 0 abstained) |

## Diagnostics

- None

## Semantic Candidates

No semantic candidates.

## Findings

### FND-468fd01826a9 · D2 · formal

- Severity: `critical`
- Confidence: `1.00`
- Contracts: `CTR-504`

#### Facts

- Required evidence 'src/types/chatState.test.ts' matched no safe artifact.

#### Inferences

- None

#### Sources

- `docs/ARCHITECTURE.md:25-35` (\| RTC output \|)

#### Suggested human review

Add or correctly register the required evidence, or explicitly revise the contract's evidence requirement.

### FND-6a3e0981e61b · D2 · formal

- Severity: `high`
- Confidence: `1.00`
- Contracts: `CTR-505`

#### Facts

- Required evidence 'evals/live/results/latest.json' matched no safe artifact.

#### Inferences

- None

#### Sources

- `docs/RELEASE_CHECKLIST.md:5` (The deterministic engineering gate can pass)

#### Suggested human review

Add or correctly register the required evidence, or explicitly revise the contract's evidence requirement.

### FND-957f7d38f463 · D2 · formal

- Severity: `high`
- Confidence: `1.00`
- Contracts: `CTR-505`

#### Facts

- Required evidence 'LICENSE' matched no safe artifact.

#### Inferences

- None

#### Sources

- `docs/RELEASE_CHECKLIST.md:5` (The deterministic engineering gate can pass)

#### Suggested human review

Add or correctly register the required evidence, or explicitly revise the contract's evidence requirement.


---

DecisionTrace findings are candidates. A human reviewer owns disposition and release decisions.
