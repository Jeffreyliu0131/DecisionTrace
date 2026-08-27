# DecisionTrace Fixture Evaluation

- Dataset: `decisiontrace-deterministic-seed-v1` v1
- Dataset hash: `f164de2ef36c4820012c95e4cfb5bb98cc97704d2a7285d249aa928ec6b74e3f`
- Tool: `0.5.0`
- Cases: 30
- Citation completeness: 1
- Gate E1 achieved: **no**

| Drift | Cases |  TP |  FP |  FN |  TN | Precision | Recall |
| ----- | ----: | --: | --: | --: | --: | --------: | -----: |
| D1    |    10 |   4 |   0 |   0 |   6 |         1 |      1 |
| D2    |    10 |   4 |   0 |   0 |   6 |         1 |      1 |
| D3    |    10 |   4 |   1 |   0 |   5 |       0.8 |      1 |

## Failed cases

- `EV-029` false_positive at detector: Expected no finding, but the detector emitted one or more findings.

## Gate E1 reasons

- One or more cases still lack an independent human reviewer; the synthetic author cannot self-certify ground truth.

## Known limitations

- Cases are synthetic structural fixtures; they do not establish real-repository usefulness or adoption.
- Path and declared-coverage checks do not prove that tests validate runtime behavior.
- Independent human review remains pending for fixture ground truth.
