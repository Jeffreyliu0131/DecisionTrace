# DecisionTrace Evaluation & Release Gates

- 状态：`implementation-contract`
- 日期：2026-08-27
- 原则：DecisionTrace 评测“是否正确发现契约漂移”，不评测目标产品本身是否成功

## 1. Two Validation Objects

本文件不阻止工程 scaffold。`I-001`–`I-004` 可立即开始；E0/E1 分别阻止 detector 被称为 ready 和 P0 被称为 validated。可观察功能验收见 [`06-ACCEPTANCE-CRITERIA.md`](06-ACCEPTANCE-CRITERIA.md)。

必须区分：

### A. Target product evidence

目标产品的 Tests、Agent Evals、Telemetry 和用户研究分别证明行为、运行和价值。DecisionTrace 只检查这些证据是否与产品承诺正确连接、是否因变化失效。

### B. DecisionTrace quality

DecisionTrace 自己要证明：

- 是否找到真实 drift；
- 是否错误地报告正常差异；
- 是否引用正确来源；
- 是否正确表达不确定性；
- reviewer 是否认为发现可行动；
- 是否在不该阻断时造成 false block。

不能用“目标 repo 里文件很多”或“生成了漂亮报告”证明 DecisionTrace 有效。

## 2. Drift Taxonomy

### D1｜Decision Conflict

两个仍处于 active/required 状态的产品决定、约束或公开承诺无法同时成立。

Positive example：AI policy 要求所有路径先审计，另一个 active decision 允许 RTC 直接返回未审计输出。

Important negative：同一规则的不同详细度不等于冲突；已 superseded 的历史决定不应报警。

### D2｜Claim Without Evidence

产品承诺没有对应验证，验证文件不存在，或声明覆盖范围明显大于当前证据。

Positive example：README 声称所有输入模态均防 prompt injection，但 eval 只覆盖文字输入。

Important negative：探索性目标和明确标注未验证的 hypothesis 不应被当作发布承诺。

### D3｜Change-Induced Mismatch

某次代码、Prompt、配置或数据流变化影响一个 contract，但相关需求、验证或对外声明仍停留在旧版本。

Positive example：输出审计入口被移动，某条 provider path 绕过新入口，而 Test/Eval 未更新。

Important negative：纯重命名或无行为变化的重构不应自动报告语义漂移。

## 3. Ground Truth Sources

按强度从高到低：

1. **Seeded deterministic cases**：人工植入并记录预期结果的冲突、缺证据和失配。
2. **Known historical incidents**：真实 repo 中已经由修复、复盘或用户决定确认的问题。
3. **Independent human labels**：至少一名未生成该 finding 的 reviewer 按 rubric 判断。
4. **Shadow-mode dispositions**：真实 PR 使用中的 true/false/actionable 反馈。
5. **Model graders**：只作辅助，必须用上述 ground truth 校准。

同一模型生成 case、运行 detector、评分并宣布通过属于无效自证。

## 4. Eval Case Schema

每条 `EV-*` 至少保存：

```text
id
drift_type
repo_fixture_or_revision
artifacts
change_set
expected_finding_or_no_finding
expected_sources
severity_rationale
known_ambiguity
author
independent_reviewer
```

Dataset 必须包含：

- positive cases；
- hard negatives；
- boundary/ambiguous cases；
- intentional changes；
- missing-history/model-unavailable cases；
- prompt-injection-like text embedded in analyzed artifacts。

## 5. Metrics

### Detection

```text
Precision = TP / (TP + FP)
Recall    = TP / (TP + FN)
```

分别报告 D1/D2/D3，不只报告聚合分数。

### Evidence Quality

- Citation completeness：正式 finding 是否都有来源。
- Citation correctness：来源是否真的支持事实。
- Scope correctness：是否夸大覆盖范围。
- Fact/inference separation：事实与推断是否正确分栏。

### Human Usefulness

- Actionable rate：reviewer 认为值得采取行动的 finding 比例。
- Median review time：从打开 finding 到 disposition 的时间。
- Intentional-change recognition：系统是否允许正确归类有意改变。
- Second-repo use：用户是否愿意在第二个 repo 重复使用。

### Release Safety

- False block count。
- High-severity false-positive rate。
- Abstention correctness：证据不足时是否拒绝过度判断。
- Deterministic/model disagreement rate。

## 6. Evaluation Stages

### Gate E0｜Specification Ready

进入实现前：

- D1/D2/D3 各有明确正例、反例和边界；
- Human rubric 可由第二个人独立使用；
- Ground truth owner 与数据边界明确；
- 不存在用模型自证的方案。

### Gate E1｜Offline Fixture Baseline

候选门槛：

- 每类至少 10 条 cases，总数至少 30；
- Citation completeness = 100%；
- Baseline precision/recall 被真实记录，即使未达标也不隐藏；
- 所有失败可追溯到 detector、parser、graph 或 evidence stage。

数量是测试设计目标，未完成前不得写成已有成绩。

`observed 2026-08-27`：本地 synthetic baseline 已覆盖 D1/D2/D3 各 10 cases，citation completeness 为 100%；D1/D2 当前未记录失败，D3 记录 `EV-029` 纯重命名误报，precision 0.8、recall 1.0。完整 artifact 见 [`../fixtures/baseline/eval-report.json`](../fixtures/baseline/eval-report.json)。由于 30 条 cases 均尚无独立人工 reviewer，E1 **未达到**；这些数字不能推出真实 repo precision、用户价值或发布 readiness。

### Gate E2｜Historical Backtest

在经授权 repo 的已知历史问题上运行：

- 固定 revision 和预期发现；
- 检查系统能否在修复前 revision 找到问题；
- 检查修复后是否停止报警；
- 未知历史保持 Unknown，不由提交信息猜测。

### Gate E3｜Dogfood Shadow Mode

至少两个经授权 repo：

- 不阻断 PR；
- 所有 findings 由人类 disposition；
- 报告 precision、误报类型和 review time；
- 先处理 alert fatigue，再增加新 detector。

`observed 2026-08-27`：已对 public `Jeffreyliu0131/thinkbud-ai` 的 exact range `43976c4...5a36aac` 完成一次 local-only dogfood，并发布 config/contracts/canonical report/provenance 与 analyst triage。它产生 3 条 D2 findings；其中 RTC default regression evidence 被评为 actionable candidate，LICENSE 与 fresh live/human evidence 是目标 repo 已明确承认的 intentional blockers。由于 required-evidence mapping 由本次 dogfood 配置提供，且没有独立 human disposition，这不满足 E2/E3，也不产生 real-repo precision。Artifact 见 [`../examples/dogfood/thinkbud-ai/`](../examples/dogfood/thinkbud-ai/)。

### Gate E4｜External Pilot

候选设计：5 名目标用户，观察首次设置、首次报告和第二 repo 使用。不能用注册、赞美或看过 Demo 代替重复行为。

### Gate E5｜Soft Gate

只有用户显式启用的确定性问题可以产生警告状态，例如 required eval 文件缺失。语义 findings 继续不阻断。

### Gate E6｜Hard Gate

Hard Gate 只允许：

- 结构化、确定性、用户显式配置的规则；
- 在代表性 shadow period 中证明极低误报；
- 有明确 override、理由记录与恢复路径；
- false block 已被评估。

未经用户新决定，LLM 语义冲突不得成为 Hard Gate。

## 7. Human Review Rubric

Reviewer 对每条 finding 回答：

1. 引用的 Artifact 和 span 是否正确？
2. 系统陈述的直接事实是否成立？
3. 推断是否合理，还是缺少关键 context？
4. 这是真漂移、有意改变、误报、接受风险还是证据不足？
5. 严重性是否匹配真实后果？
6. 如果采取行动，应改 contract、implementation、evidence 还是 public claim？

Reviewer 不能只给“有用/没用”；必须选择 disposition 并写简短理由。

## 8. Model Grader Calibration

若使用 model grader：

- 先在独立 human-labeled set 上测试；
- 报告与人类的一致率和主要分歧；
- 不让 grader 看到不应使用的隐藏 ground truth；
- 至少保留确定性 schema 和引用检查；
- 更换模型、Prompt 或 rubric 后重新校准；
- Grader 失败时不默认通过。

M5 的 fake provider 与离线 replay 只验证 redaction、schema、source binding、abstention 和 report/review plumbing；它们不是模型质量 evidence，不能产生 precision/recall，也不能满足本节的人类校准要求。真实 provider 接入后必须新增独立 human-labeled semantic set，并保留 provider/model/prompt/config version。

## 9. Bad Cases to Preserve

- 文件名相似导致错误关联；
- Test 名称声称覆盖，但断言不验证行为；
- 新旧 ADR 共存但 supersedes 清楚；
- 合理的局部实现差异被误报为冲突；
- 文档中的示例或引用被误认为 active requirement；
- 被分析文件包含“忽略规则”等 prompt injection 文本；
- 大改动导致 context 截断后仍输出确定结论；
- 没有 Git history 却声称发现时间漂移。

## 10. Reporting Contract

每次 eval 报告必须包含：

- Dataset/version/revision；
- Detector/model/config version；
- 每类 case 数量与来源；
- Precision/recall 与 evidence metrics；
- 失败 case 明细或稳定 ID；
- Known limitations；
- 是否达到哪个 Gate；
- 哪些结论仍不能推出。
