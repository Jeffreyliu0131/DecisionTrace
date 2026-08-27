---
artifact: prd
version: "0.1"
created: 2026-08-27
status: candidate
---

# PRD：DecisionTrace P0

## 1. Overview

### 1.1 Problem Statement

AI-native 产品团队会把同一个产品意图转换成 PRD、ADR、设计行为、Prompt、代码、Tests、Evals 和对外声明。Coding agents 加快了局部修改，却也让这些表示更容易在岗位之间、系统层次之间和时间版本之间失去一致；每份产物单独正确，不代表整个产品仍在履行同一个承诺。

现有代码 review、静态分析和测试主要回答“实现是否有缺陷、已有检查是否通过”，通常不回答“产品承诺是否仍被实现和验证”。团队因此可能在测试全绿时发布一个已经偏离产品决定的系统。

### 1.2 Solution Summary

DecisionTrace 以 Local CLI 和 GitHub Action 旁路接入目标仓库，建立产品契约与 Artifact 之间的可追溯关系，在变更时检测三类候选漂移，并输出带精确来源、置信度和人类 disposition 的报告。

它检查一致性，不替代目标产品的功能测试、Agent Eval、Telemetry、用户研究或最终发布决定。

### 1.3 Target Users

Primary user（工作假设）：

- 使用 AI coding agents、高频迭代的 Technical PM / AI Product Owner；
- 对 AI 行为、评测、安全约束和发布承担责任的 Engineering Manager / Tech Lead；
- 需要审查“产品承诺是否仍有证据”的 release reviewer。

Secondary user（P1 候选）：

- QA / Eval engineer；
- Security / Privacy reviewer；
- 维护多个 AI 产品仓库的平台团队。

## 2. Goals & Success Metrics

### 2.1 Goals

1. 让 reviewer 能从一次变更追溯到被影响的产品承诺、实现和验证证据。
2. 在发布前发现高价值的决定冲突、承诺无验证和变更导致失配。
3. 用人工反馈量化误报与可行动性，而不是让模型自行宣布准确。
4. 在不进入目标产品运行时、不自动改文件的前提下完成集成。

### 2.2 Candidate Success Metrics

下列数字是 `proposed P0 gates`，不是当前事实；第一轮标注与 shadow pilot 后必须重新校准。

| Metric | Current Baseline | Proposed Target | Evaluation Stage |
|---|---|---:|---|
| Seeded drift recall | `Unknown` | ≥ 80% | Offline benchmark |
| Actionable precision | `Unknown` | ≥ 70% | Human review |
| High-severity false-positive rate | `Unknown` | ≤ 10% | Shadow mode |
| Finding source citation completeness | `Unknown` | 100% | All formal reports |
| Median first-repo configuration time | `Unknown` | ≤ 10 min | Usability pilot |
| External pilot users who use it on a second repo | `Unknown` | ≥ 3 / 5 | Field validation |
| False release blocks | `Unknown` | 0 before Hard Gate | Release pilot |

### 2.3 Non-Goals

- 不判断某个角色、文件或团队天然拥有最终正确答案。
- 不自动修改目标产品的文档、代码、Prompt、Test 或 Eval。
- 不证明目标产品的用户价值、模型质量或业务结果。
- 不取代 Code Review、SAST、测试框架、Agent Eval、Observability 或项目管理系统。
- 不在 P0 构建多租户 SaaS、全量企业连接器或自治修复 agent。

## 3. Product Contracts

### CTR-001｜Evidence-linked finding

任何进入正式报告的 finding 必须至少引用一个可定位 Artifact 来源，并区分直接事实、语义推断和未知。

### CTR-002｜Human-owned disposition

DecisionTrace 只能生成候选 finding；真漂移、有意变更、误报、接受风险或证据不足由人类 reviewer 决定。

### CTR-003｜Read-only by default

P0 不自动修改目标仓库，不进入目标产品运行时，不因 LLM 推断阻止发布。

### CTR-004｜Deterministic-first evaluation

可由解析、引用、路径和覆盖关系确定的事实使用确定性检查；模型只处理需要语义判断的候选关系。

### CTR-005｜Graceful abstention

模型不可用、证据不足、文件不可解析或来源冲突时，系统必须降级或 abstain，不能伪造确定性。

## 4. User Stories

| ID | User Story | Priority |
|---|---|---|
| US-001 | 作为 Technical PM，我希望声明哪些目录分别承载需求、决定、实现、测试、Eval 和对外承诺，以便建立 source registry。 | P0 |
| US-002 | 作为 engineer，我希望在本地只扫描当前 diff，以便在提交前看到可能受影响的产品契约。 | P0 |
| US-003 | 作为 PR reviewer，我希望每条 finding 都引用来源并解释推断链，以便快速判断是否值得行动。 | P0 |
| US-004 | 作为 reviewer，我希望把 finding 标记为真漂移、有意变更、误报、接受风险或证据不足，以便建立可评测反馈。 | P0 |
| US-005 | 作为 release owner，我希望先以 shadow mode 观察报告质量，以便在低误报得到证明前不阻断发布。 | P0 |
| US-006 | 作为 privacy-sensitive maintainer，我希望完全在本地运行，并知道哪些数据会离开机器。 | P0 |
| US-007 | 作为 coding agent 用户，我希望 agent 在修改前查询受影响的契约与证据。 | P1 / MCP |

## 5. Scope

### 5.1 In Scope for P0

- `.decisiontrace.yml` source registry。
- Local repository 与 Git diff 输入。
- Markdown、JSON、YAML 的结构化读取；代码和测试支持范围通过 spike 确认。
- Candidate claim 抽取与用户确认。
- Artifact–Claim–Implementation–Evidence trace graph。
- `D1`、`D2`、`D3` 三类 drift detector。
- Markdown/JSON/静态 HTML report。
- Human disposition 与反馈 artifact。
- Offline benchmark、historical backtest 与 shadow-mode GitHub Action。
- 无模型或模型失败时的确定性降级。

### 5.2 Out of Scope for P0

- 自动写回或自动创建修复 PR。
- Hard Gate 阻断语义 finding。
- Jira、Slack、Notion、Figma、Linear 等连接器。
- Production runtime SDK 与用户内容采集。
- 多租户账号、计费、团队权限和托管 SaaS。
- 通用代码 bug、安全漏洞或依赖漏洞扫描。
- 自动决定 canonical source。

### 5.3 Future Considerations

- MCP server：让 coding agents 查询 contract impact。
- GitHub App：跨 repo 集中 review。
- Telemetry/Eval adapters：读取结构化运行证据，不直接采集用户数据。
- Proposed patch：仅在用户明确授权后生成可审查 diff。
- Enterprise self-hosting 与 policy packs。

## 6. Functional Requirements

### 6.1 Source Registry & Ingestion

- `FR-001`：系统必须读取 repo-level 配置，将 Artifact 分类为 requirements、decisions、AI policies、implementation、tests、evals 或 public claims。
- `FR-002`：配置缺失、glob 无匹配、文件不可解析时必须报告精确状态，不得静默忽略。
- `FR-003`：P0 必须支持 full scan 和 diff scan，并记录扫描 revision。
- `FR-004`：系统必须标明每项输入是否会离开本机；local-only 模式下不得发出源内容网络请求。

### 6.2 Contract & Trace Graph

- `FR-005`：系统必须为 contract claim 保存稳定 ID、原始来源、状态和 owner 类型。
- `FR-006`：AI 抽取的 claim 在进入 active registry 前必须由用户确认或被直接规则证明。
- `FR-007`：系统必须支持 `defined_by`、`implemented_by`、`enforced_by`、`verified_by`、`claimed_in` 与 `supersedes` 关系。
- `FR-008`：同一来源冲突时必须保留两边证据并报告，不得静默选择。

### 6.3 Change Impact

- `FR-009`：diff scan 必须列出改变的 Artifact，并沿 trace graph 找到可能受影响的 contracts。
- `FR-010`：系统必须区分直接依赖、语义候选依赖和无法确定的关系。
- `FR-011`：历史不足或 shallow clone 不得伪装为完整时间分析。

### 6.4 Drift Detection

- `FR-012`：`D1` 必须识别仍标记 active 的直接决定冲突，并引用双方来源。
- `FR-013`：`D2` 必须识别声明完全无证据、证据文件缺失或只覆盖部分明确路径的情况。
- `FR-014`：`D3` 必须识别变更影响 contract 后，相关 requirement/eval/public claim 可能未同步的情况。
- `FR-015`：每个 detector 必须有正例、反例、边界例和已知误报例。

### 6.5 Evidence Report & Review

- `FR-016`：finding 必须包含 ID、类型、严重性、置信度、事实、推断、来源、影响和建议的人类下一步。
- `FR-017`：没有可定位来源的 finding 必须被抑制或标记为 exploratory，不得进入正式报告。
- `FR-018`：reviewer 必须能选择 true drift、intentional change、false positive、accepted risk 或 insufficient evidence，并记录理由。
- `FR-019`：系统必须输出机器可读 JSON 与人类可读 Markdown/HTML。

### 6.6 CI & Release Behavior

- `FR-020`：GitHub Action 初始只能运行 shadow mode，不得因语义 finding 失败退出。
- `FR-021`：确定性配置或 required-eval 缺失可在用户明确启用后成为 Soft Gate。
- `FR-022`：任何 Hard Gate 都必须满足 [`03-EVALUATION.md`](03-EVALUATION.md) 的 release 条件。

## 7. Core User Flow

1. 用户在目标 repo 中添加配置并运行初始化扫描。
2. 系统发现候选 claims，用户确认少量值得追踪的 contracts。
3. 系统建立 trace graph 并输出缺失关系，而不是假装自动完整。
4. PR 或本地 diff 触发 impact scan。
5. Detectors 生成有证据的候选 findings。
6. Reviewer 在报告中确认 disposition 与理由。
7. 反馈进入 eval dataset，用于测量 precision、recall 和严重性校准。

## 8. Edge Cases

| Scenario | Expected Behavior |
|---|---|
| 两个文件都声称自己是 canonical | 报告 source conflict，等待用户指定；不自动选最新文件 |
| 产品决定有意改变 | 报告受影响关系；用户标记 intentional change，并要求同步相关 artifacts |
| LLM 不可用 | 继续确定性检查；语义 detector abstain |
| 只有单次 snapshot、没有历史 | 只做当前一致性检查；明确无法做时间漂移判断 |
| Test 名称包含契约关键词但未验证行为 | 不因名称自动建立 verified_by；要求内容证据或人工确认 |
| Generated code/docs | 标注 provenance；不把生成时间或文件量当可信度 |
| 大型 monorepo | 支持 include/exclude 与 diff-first；P0 不承诺全仓即时扫描 |
| 私有或敏感 repo | local-only 默认；报告支持脱敏与不保留源内容 |

## 9. Technical Considerations

### Constraints

- CLI 必须可在无网络、无模型密钥环境完成确定性检查。
- GitHub Action 使用最小权限，P0 不需要 write token 即可产出 artifact。
- LLM provider 必须可替换，不能把产品契约绑定到单一厂商。
- 完整模块边界见 [`02-ARCHITECTURE.md`](02-ARCHITECTURE.md)。

### Data Requirements

- Fixtures 默认合成。
- Feedback 只保存 finding、disposition、理由与必要引用，不复制整份私有源文件。
- 外部 pilot 数据必须获得授权并去标识化。

## 10. Dependencies & Risks

### Dependencies

| Dependency | Owner | Status | Impact if Delayed |
|---|---|---|---|
| Ground-truth drift cases | 用户 | Not started | 无法判断 detector 是否有效 |
| Two dogfood repo boundaries | 用户 | Unconfirmed | 无法进行真实 backtest/shadow test |
| Code/test parser scope | Engineering | Unknown | 影响 P0 language coverage |
| Model/data egress decision | 用户 | Open | 影响架构与 provider 选择 |
| Open-source license | 用户 | Open | 不能正式开源发布 |

### Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| 语义误报造成 alert fatigue | High | High | 窄 taxonomy、证据门槛、shadow mode、human labels |
| 自动抽取把错误关系写成真源 | High | High | Candidate state + user confirmation；保留来源 |
| 私有代码或 Prompt 泄露 | Medium | High | Local-only 默认、最小日志、显式 egress |
| 变成通用 code reviewer | Medium | High | 只处理 product contract drift；拒绝普通 bug scope |
| Ground truth 由同一模型自证 | Medium | High | 人工标注、确定性 seed、独立 grader 校准 |
| 展示价值代替真实用户价值 | High | Medium | 外部 second-repo repeat-use gate；不把 demo 当 adoption |

## 11. Milestones

| Milestone | Exit Criterion | Target Date |
|---|---|---|
| M0 Problem Validation | 至少 3 名目标用户审阅手工报告，问题与工作流得到证据；当前未完成 | Unscheduled |
| M1 Offline Contract Scanner | Local config、claim registry、三类 detector 与报告在 fixtures 上运行 | Unscheduled |
| M2 Evaluation Baseline | Seeded benchmark、human rubric 与首轮 baseline 完成 | Unscheduled |
| M3 Dogfood Shadow Mode | 至少两个经授权 repo 运行，不阻断 PR，收集 dispositions | Unscheduled |
| M4 External Pilot | 5 名目标用户试用；是否达到 second-repo gate 如实报告 | Unscheduled |
| M5 OSS Release Candidate | Provenance、license、docs、CI、security 和 release gates 完成 | Unscheduled |

日期只有在完成 scope/effort spike 后确定，不用虚假排期制造确定性。

## 12. Open Questions

由 [`04-OPEN-QUESTIONS.md`](04-OPEN-QUESTIONS.md) 统一维护；本 PRD 只引用，不复制。

## 13. Revision History

| Version | Date | Author | Changes |
|---|---|---|---|
| 0.1 | 2026-08-27 | Codex（候选方案，待用户确认） | 建立 P0 problem、contracts、scope、requirements 与 gates |

