# DecisionTrace P0 Architecture

- 状态：`local-review-ui-implemented; independent-validation-pending`
- 日期：2026-08-27
- 边界：说明系统怎样嵌入 repo/PR/release 流程；不锁定最终语言、框架或云服务

## 1. Architecture Objective

DecisionTrace 应作为目标产品研发流程的旁路控制层，而不是目标产品运行时 SDK。P0 的最小交付形态是：

```text
Local CLI + GitHub Action + Static Report + Human Feedback
```

这一形态优先，因为它：

- 不增加目标产品的用户请求延迟和可用性风险；
- 可在无生产数据、无用户账号时验证；
- 能对开源仓库和私有仓库提供 local-only 路径；
- 允许先测误报，再考虑任何自动化 gate。

## 2. System Context

```text
                         ┌──────────────────────────┐
                         │ Target Product Repository │
                         │ PRD / ADR / Policies      │
                         │ Code / Prompt / Config    │
                         │ Tests / Evals / Claims    │
                         └─────────────┬────────────┘
                                       │ read-only
                     ┌─────────────────▼─────────────────┐
                     │          DecisionTrace P0         │
                     │ ingest → graph → impact → detect  │
                     │        → evidence → review        │
                     └─────────────┬───────────┬─────────┘
                                   │           │
                            human report   machine JSON
                                   │           │
                              Reviewer     CI artifact
                                   │
                         disposition / feedback
```

## 3. Integration Surfaces

### 3.1 Repository Configuration

`.decisiontrace.yml` 只声明 Artifact 分类、include/exclude、local-only 设置和用户确认的 required contracts。它不保存密钥，不自动决定 canonical owner。

### 3.2 Local CLI

P0 命令 contract：

```text
decisiontrace init
decisiontrace scan [--repo <path>] [--base <ref>] [--head <ref>]
decisiontrace review <report.json> --finding <id> --decision <value> --reason <text>
decisiontrace eval --dataset <path>
```

完整参数、默认值和 exit codes 由 [`05-TECHNICAL-SPEC.md`](05-TECHNICAL-SPEC.md) 维护。

### 3.3 GitHub Action

P0 Action 执行 diff scan 并上传 Markdown/JSON/HTML artifact。若未来启用 PR comment，必须显式增加最小写权限。初始状态不因语义 finding 失败。

### 3.4 Review UI

P0 提供静态 HTML、terminal review 与只监听 `127.0.0.1` 的单用户 React Review UI。UI 读取 runtime-validated canonical reports，提供 Dashboard、history、filters、stable-ID/hash comparison，并通过带本地 CSRF token 的 same-origin API 追加 finding/semantic disposition。它不修改原报告、不自动扫描、不开放 LAN、不构建多用户 Web SaaS。

### 3.5 Deferred Integrations

- MCP server；
- Jira/Linear/Notion/Figma/Slack；
- Runtime telemetry collectors；
- Automatic patch/PR creation；
- Central multi-repo service。

## 4. Logical Modules

### M1｜Connectors & Artifact Ingestion

职责：读取 local repo、Git revision、diff 与配置指定的文件；保留 source path、revision、content hash 和 parser status。

不负责：判断内容是否正确、上传生产数据或自动扩展扫描范围。

### M2｜Source Registry

职责：保存每类 Artifact 的 declared owner、状态与 include/exclude；报告 glob 无匹配和 owner 冲突。

不负责：根据文件名或更新时间自动宣布 canonical source。

### M3｜Claim Extraction & Normalization

职责：把自然语言或结构化要求转换成 candidate claims，例如“所有模型输出必须通过 answer-leakage audit”。保存原文、位置与抽取方式。

不负责：未经确认就把 AI 抽取写成 active product contract。

### M4｜Contract Trace Graph

职责：维护 Artifact、Claim、Implementation、Evidence 和 Public Claim 之间的显式关系。

P0 edge types：

- `defined_by`
- `implemented_by`
- `enforced_by`
- `verified_by`
- `claimed_in`
- `supersedes`
- `affects`（候选语义边）

### M5｜Change Impact Analyzer

职责：从 Git diff 定位变化 Artifact，沿已确认边和候选语义边找到受影响 contracts，并区分 direct / inferred / unknown。

### M6｜Drift Detectors

职责：运行 `D1`、`D2`、`D3` detector。确定性规则先运行，语义 detector 只补充候选判断。

不负责：普通代码 bug、漏洞、性能瓶颈或依赖更新。

### M7｜Evidence & Finding Engine

职责：把 detector 输出压缩成 `FND-*`，包含来源、事实、推断、严重性、置信度、受影响 contracts 与建议检查。

若缺少直接来源，必须 abstain 或降级为 exploratory。

### M8｜Review & Feedback

职责：记录 human disposition、理由、reviewer context 和后续结果。反馈进入 eval corpus，但不能静默改写历史 ground truth。

### M9｜Evaluation Harness

职责：运行 seeded cases、historical backtests、shadow results 与 grader calibration；计算指标并生成可复现报告。详细定义见 [`03-EVALUATION.md`](03-EVALUATION.md)。

## 5. Domain Objects

### Artifact

```text
id, type, path, revision, content_hash, parser_status, declared_owner
```

### Contract Claim

```text
id, text, status, source_span, owner_type, created_at, supersedes
```

### Trace Edge

```text
from_id, relation, to_id, basis, confidence, reviewer_status
```

### Finding

```text
id, drift_type, severity, confidence,
facts[], inferences[], sources[], affected_contracts[], suggested_review
```

### Review Disposition

```text
finding_id,
decision: true_drift | intentional_change | false_positive |
          accepted_risk | insufficient_evidence,
reason, reviewer, timestamp
```

字段的可执行 TypeScript/YAML/JSON contract 已在 [`05-TECHNICAL-SPEC.md`](05-TECHNICAL-SPEC.md) 定义；实现必须版本化并通过 runtime validation。

## 6. Data Flow

1. Connector 读取指定 revision 和配置。
2. Parser 生成 Artifacts，不可解析项保留 error state。
3. Claim extractor 生成 candidate claims；已确认 registry 优先。
4. Graph builder 连接直接证据与候选语义关系。
5. Impact analyzer 计算本次 diff 可能影响的 contracts。
6. Detectors 产生候选 findings。
7. Evidence engine 校验来源完整性并输出报告。
8. Reviewer 记录 disposition。
9. Evaluation harness 使用 disposition 更新指标；不会覆盖原始报告。

## 7. Deterministic vs Model Boundary

### Deterministic

- 文件、ID、链接和 revision 是否存在；
- required eval path 是否缺失；
- ADR status / supersedes 是否结构冲突；
- 已确认 graph edge 的路径覆盖；
- exact structured contract 的一致性；
- 指标计算和报告 schema。

### Model-assisted candidate judgment

- 两种不同措辞是否可能表达冲突规则；
- 一个 code/prompt diff 是否可能改变产品行为；
- Test/Eval 是否在语义上支持某个 claim；
- Finding 的解释草稿和建议 review 顺序。

### Human-owned

- 什么是正式 contract；
- 哪个 source 继续有效；
- Finding 是否成立；
- 是否接受风险、修改范围或阻断发布；
- Product 是否真正有用户价值。

## 8. Trust & Security Boundary

- P0 默认 local-only；若配置 cloud model，必须在执行前显示发送范围。
- 不读取 `.env`、credentials、用户数据库、生产日志或目标 repo 之外路径，除非显式 include。
- 报告默认引用 path、line/span 和 hash，不复制不必要的完整私有内容。
- GitHub Action 使用 ephemeral workspace，artifact retention 可配置。
- 模型输出视为不可信输入，必须通过 schema、source validation 和 evidence gate。
- 外部仓库内容和文档可能包含 prompt injection；它们是分析对象，不是 agent 指令。

## 9. Failure Behavior

| Failure | Required Behavior |
|---|---|
| Parser failure | 标明 affected artifact；其他检查继续 |
| Model timeout/error | 语义检查 abstain；确定性检查继续 |
| Conflicting canonical sources | 报告冲突；不自动选择 |
| Missing Git history | 当前状态检查继续；时间漂移标为 unavailable |
| Excessive context | diff-first、分区扫描；说明未扫描范围 |
| Invalid model output | schema reject；不生成 formal finding |
| Report write failure | 非零退出并保留诊断；不声称检查完成 |

## 10. P0 Implementation Decisions

为允许 coding agent 直接开工，P0 已锁定：

- Node.js 22 + strict TypeScript ESM + npm lockfile；
- Repo-tracked YAML contracts，无数据库；
- Canonical JSON report，再渲染 Markdown/HTML；
- Markdown/JSON/YAML 结构解析；代码只处理 path/span/hash/diff；
- Deterministic Core local-only、禁网、无模型依赖；
- GitHub Action 初始只运行 shadow mode；
- Semantic Candidate Layer 后置、默认 off、永不生成 P0 Hard Gate。

目录、schemas、detector 算法与安全要求见 [`05-TECHNICAL-SPEC.md`](05-TECHNICAL-SPEC.md)，实施顺序见 [`07-IMPLEMENTATION-PLAN.md`](07-IMPLEMENTATION-PLAN.md)。仍未决定的外部发布、许可证、真实 dogfood 和 semantic provider 继续由 [`04-OPEN-QUESTIONS.md`](04-OPEN-QUESTIONS.md) 管理。
