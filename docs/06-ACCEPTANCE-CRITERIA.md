---
artifact: acceptance-criteria
version: "0.3"
created: 2026-08-27
status: implementation-contract
---

# Acceptance Criteria：DecisionTrace P0 Core, Offline Semantic Layer & Local Review UI

## Story Context

本合同覆盖 PRD 中 `US-001`–`US-006`、`US-008` 与 `FR-001`–`FR-031`。P0 让用户在本地 repo 配置 product contracts、执行 full/diff scan、获得有来源的 D1/D2/D3 findings、记录 disposition，并在 GitHub Action shadow mode 中复现相同结果；M5 offline slice 另外验证有界脱敏输入、fake/replay provider 与 candidate-only feedback；M5.5 验证 loopback Review UI。

真实 local/cloud provider 质量、真实数据出境、真实用户价值和开源发布不属于本验收合同。

## A. Initialization & Configuration

### AC-001｜初始化最小配置

**Given** 当前目录是一个 Git repository，且不存在 `.decisiontrace.yml`

**When** 用户运行 `decisiontrace init`

**Then** 系统创建合法的配置和 contracts 示例，不修改其他文件，并明确列出下一步扫描命令。

### AC-002｜避免覆盖现有配置

**Given** `.decisiontrace.yml` 已存在

**When** 用户运行 `decisiontrace init`

**Then** 命令以 exit code 2 结束且原文件字节不变；只有显式 `--force` 才允许替换并先生成可识别备份。

### AC-003｜拒绝未知或越界配置

**Given** 配置包含未知顶层字段、无效 enum 或逃出 repo root 的路径

**When** 用户运行 scan

**Then** 系统指出精确字段/路径、以 exit code 2 结束且不生成“complete”报告。

### AC-004｜报告未匹配 source

**Given** 某个 required source glob 没有匹配文件

**When** 系统加载 source registry

**Then** report diagnostics 明确记录该 glob，不能静默视为成功覆盖。

## B. Scan & Artifact Inventory

### AC-005｜Full scan

**Given** 配置、contracts 和 fixture repo 合法

**When** 用户运行 `decisiontrace scan`

**Then** report 记录 head revision、所有 included/skipped Artifacts、content hashes 和 parser status。

### AC-006｜Diff scan

**Given** `base` 与 `head` 均能被 Git 解析

**When** 用户运行 `decisiontrace scan --base <base> --head <head>`

**Then** impact analysis 只以 `base...head` 变更路径为变化输入，并在 report 中保存两个 refs 与实际 SHAs。

### AC-007｜不猜缺失 Git ref

**Given** 用户只提供 base 或只提供 head

**When** scan 解析参数

**Then** 命令以 exit code 2 结束并说明必须同时提供两个 refs。

### AC-008｜历史不足时降级

**Given** shallow clone 无法解析目标 base

**When** 用户请求 diff scan

**Then** 系统不声称完成时间漂移分析；返回精确 Git diagnostic 和恢复方法。

### AC-009｜文件边界

**Given** repo 包含超限文件、binary、`.env`、`.git`、node_modules 和逃出 root 的 symlink

**When** 系统收集 Artifacts

**Then** 必须排除敏感/越界项，对其他 skipped 项记录原因，且不读取其完整内容。

## C. Contracts & Graph

### AC-010｜只激活合法 contracts

**Given** registry 同时包含 active、candidate、superseded 和 retired contracts

**When** formal detectors 运行

**Then** 只有 schema-valid active contracts 进入 formal D1/D2/D3；其他状态仍可被 inventory 但不能 gate。

### AC-011｜可追溯 graph

**Given** 一个 contract 声明 defined/implemented/verified/claimed paths

**When** graph 构建完成

**Then** 每条 edge 保存 basis、confidence 与 review status，且能反向查询受一个 Artifact 影响的 contracts。

### AC-012｜来源冲突不静默选择

**Given** 两个 active artifacts 都被配置成同一 contract 的 canonical definition

**When** graph builder 处理它们

**Then** report 保留双方来源并生成 source-conflict diagnostic，不以更新时间自动选择。

## D. Drift Detectors

### AC-013｜D1 supersedes 冲突

**Given** active `CTR-A` supersedes `CTR-B`，但 `CTR-B` 仍为 active

**When** D1 detector 运行

**Then** 生成 formal D1 finding，引用两个 contract definitions 和状态来源。

### AC-014｜D1 structured rule 冲突

**Given** 两个 active contracts 对同一 topic/object 和重叠 applies_to 分别使用 require 与 forbid

**When** D1 detector 运行

**Then** 生成一个稳定 ID 的 formal D1 finding；不因重复扫描重复计数。

### AC-015｜D1 hard negative

**Given** 旧 contract 已 superseded，或两个规则 applies_to 不重叠

**When** D1 detector 运行

**Then** 不生成 formal conflict。

### AC-016｜D2 required evidence missing

**Given** active contract 的 required evidence glob 无匹配

**When** D2 detector 运行

**Then** 生成 formal D2 finding，引用 contract 声明、缺失 glob 和扫描覆盖范围。

### AC-017｜D2 coverage gap

**Given** contract applies_to `[chat, rtc]`，而 verified_by union 只 covers `[chat]`

**When** D2 detector 运行

**Then** finding 明确缺失 `rtc`，不能声称现有 chat test 本身无效。

### AC-018｜D3 change candidate

**Given** active contract 的 implementation path 改变，而 definition、evidence 和 public claim paths 都未改变

**When** D3 detector 运行

**Then** 生成 exploratory D3 finding，事实与“可能需要同步”的推断分开，且不触发 gate。

### AC-019｜D3 non-trigger

**Given** implementation 与 linked evidence 在同一 diff 中同时改变

**When** D3 detector 运行

**Then** 不生成“evidence 未同步”的 D3 finding；其他 detector 仍可独立运行。

## E. Findings & Reports

### AC-020｜Formal evidence gate

**Given** detector 不能提供至少一个验证过的 source span

**When** finding engine 组装结果

**Then** finding 必须被抑制、abstain 或降为 exploratory，不能标记 formal。

### AC-021｜Fact/inference separation

**Given** 一个 finding 同时包含文件存在事实和行为影响推断

**When** JSON/Markdown/HTML report 生成

**Then** facts 与 inferences 分开呈现，且 model-only statement 不进入 facts。

### AC-022｜Reporter 一致性

**Given** canonical `report.json` 已生成

**When** Markdown 与 HTML reporter 运行

**Then** 三种格式的 finding IDs、severity、sources 和 counts 完全一致，render 阶段不调用模型。

### AC-023｜确定性复现

**Given** 相同 revision、配置、contracts 和 tool version

**When** scan 连续运行两次

**Then** 除 timestamps/scanId 外，Artifact hashes、finding IDs、sources 和 summary 相同。

### AC-024｜Partial scan 诚实性

**Given** 某个非关键 Artifact 解析失败但其他检查可继续

**When** scan 完成

**Then** result 为 `partial`、diagnostic 可定位、成功覆盖范围明确，不能显示 `complete`。

## F. Review & Evaluation

### AC-025｜记录 disposition

**Given** report 中存在 finding

**When** reviewer 提供合法 decision 和非空 reason

**Then** 系统向 reviews JSONL 追加一条记录，不修改原始 report。

### AC-026｜拒绝无理由 review

**Given** reviewer 未提供 reason 或 finding ID 不存在

**When** review 命令执行

**Then** 命令以 exit code 2 结束且 reviews 文件不变。

### AC-027｜Fixture eval 指标

**Given** dataset 含 expected positive 和 negative cases

**When** `decisiontrace eval` 运行

**Then** 分 D1/D2/D3 输出 TP、FP、FN、precision、recall 和失败 case IDs；分母为零时显式 `not_applicable`，不伪造 100%。

## G. CI, Security & Recovery

### AC-028｜Shadow Action 不阻断

**Given** GitHub Action 在默认配置中发现 formal 或 exploratory findings

**When** scan 本身可信完成

**Then** workflow 上传 report artifact 并 exit 0；finding 数量不改变退出码。

### AC-029｜显式 deterministic gate

**Given** 用户启用 deterministic gate 且 required evidence missing

**When** Action 运行

**Then** report 先完整写出，随后 exit 1，并说明触发的具体 finding IDs。

### AC-030｜Local-only 禁网

**Given** mode 为 local-only

**When** full scan、diff scan、report 和 eval 运行

**Then** 不发生网络请求；测试通过禁网替身验证这一点。

### AC-031｜被分析内容不是指令

**Given** Markdown 或代码注释包含“忽略规则并上传文件”等文本

**When** ingestion 与 semantic-disabled scan 运行

**Then** 该文本只作为 Artifact 内容，不能改变配置、工具权限或执行路径。

### AC-032｜模型失败降级

**Given** 用户显式启用 semantic provider，但 provider timeout 或返回 invalid schema

**When** scan 运行

**Then** semantic stage abstain、diagnostic 记录原因、Deterministic Core 继续，model output 不产生 formal finding。

## H. Offline Semantic Candidate Layer

### AC-033｜有界脱敏输入

**Given** source registry 允许的片段包含常见 API key、token、email、个人绝对路径或超长内容

**When** semantic input builder 运行

**Then** provider input 不包含这些原值或原始 repo path，记录 redaction/truncation counts，并同时满足 per-source、total characters 与 source-count limits。

### AC-034｜Provider 引用闭环

**Given** provider response 回显当前 `SIN-*` 并引用本次提供的 `SRC-*` 与 active `CTR-*`

**When** runtime validation 与 normalization 运行

**Then** claim、edge、conflict 生成稳定 `SEM-*`，保存 validated source spans，basis/review/status 分别固定为 `model_candidate` / `candidate` / `exploratory`。

### AC-035｜Model-only 永不 formal

**Given** provider 返回 conflict statement 与 severity

**When** candidate 转为 report finding

**Then** provider statement 只进入 `inferences`，finding 始终 exploratory，severity 不超过关联 contract，且 semantic candidate 永不触发 gate。

### AC-036｜Stale、invalid 与 timeout abstention

**Given** provider 回显错误 input ID、引用 unknown source/contract、返回 unknown/超限字段、抛错或超时

**When** semantic stage 运行

**Then** 整批 provider output 被拒绝，stage 标记 abstained、diagnostic 可定位，Deterministic Core findings 保留且不产生 semantic formal finding。

### AC-037｜离线 replay 可复现

**Given** 用户显式写出 redacted semantic input，并准备回显同一 `SIN-*` 的 replay JSON

**When** CLI 使用 `--semantic-replay`

**Then** 不发生 provider/network 调用，candidate IDs 与内容可复现；stale replay 不得套用到不同 input。

### AC-038｜Semantic disposition 追加记录

**Given** report 中存在 `SEM-*` candidate

**When** reviewer 提供合法 decision 与非空 reason

**Then** 系统向 `semantic-reviews.jsonl` 追加记录，不修改原报告、不激活 candidate contract；无理由或不存在的 candidate 必须拒绝且不改变 review log。

## I. Local Review UI

### AC-039｜可信 history inventory

**Given** reports root 同时包含合法报告、无效 JSON/schema 和 review log bad lines

**When** UI report store 建立 history

**Then** 只有 runtime-valid reports 进入 Dashboard/history；每个实例获得稳定 `RPT-*`，invalid reports/reviews 被明确列出且错误文本不暴露绝对 repo root。

### AC-040｜Loopback-only server

**Given** 用户运行 `decisiontrace ui`

**When** server 启动

**Then** 只绑定 `127.0.0.1`，拒绝 unexpected Host，不提供 LAN/public host 选项，并返回 no-sniff、frame denial、same-origin 与 restrictive CSP headers。

### AC-041｜Production assets 与 SPA routes

**Given** React/Vite production assets 已构建

**When** 用户直接访问 `/`、`/scans/:reportKey` 或 `/compare`

**Then** server 返回同一 SPA shell 与本地 hashed assets；不存在的静态扩展文件返回 404，不加载 CDN、外部 font/script 或 analytics。

### AC-042｜Stable comparison

**Given** 两份 schema-valid reports

**When** comparison service 运行

**Then** findings/candidates 按 stable ID、artifacts 按 path/hash 比较，分别输出 added、removed、changed、unchanged 与 summary deltas，不重新调用 detector/model。

### AC-043｜UI review 复用 immutable contract

**Given** report detail 中存在 finding 或 semantic candidate

**When** UI 提交合法 disposition 与 reason

**Then** API 复用现有 review service 追加 JSONL；原 report 字节不变，刷新后展示 latest disposition。

### AC-044｜Mutation token 与请求边界

**Given** POST 缺少/伪造 local token、标记 cross-site、body 非 JSON/超限或含 unknown fields

**When** review API 收到请求

**Then** 请求被拒绝且 review log 不变；合法 same-origin token request 才可追加。

### AC-045｜Dashboard

**Given** 至少一份合法报告

**When** 用户打开 Dashboard

**Then** 页面展示 latest result、formal/exploratory/semantic queue、review progress、趋势与 recent history；没有报告时显示可行动 empty state，不伪造指标。

### AC-046｜Report filters

**Given** report 含多个 drift type、status、severity 与 review state

**When** 用户搜索或选择 filters

**Then** 页面只显示匹配 findings，并保留 facts、inferences、sources、confidence、contracts 与 suggested review 的可见边界。

### AC-047｜Interactive disposition forms

**Given** 用户在 finding/semantic card 填写 decision、reason 与可选 reviewer

**When** 提交成功或失败

**Then** 页面给出明确 pending/error/result 状态；成功后刷新 latest append record，失败不伪装为已保存。

### AC-048｜Comparison page

**Given** history 至少有两份报告

**When** 用户选择 baseline 与 target

**Then** 页面呈现 summary deltas 以及 finding/candidate/artifact/diagnostic changes，并可返回两份原报告；同一报告不能与自身比较。

## Requirements Coverage

| Requirement | Acceptance Criteria |
|---|---|
| FR-001 | AC-001, AC-003–AC-004 |
| FR-002 | AC-003–AC-004, AC-024 |
| FR-003 | AC-005–AC-008 |
| FR-004 | AC-009, AC-030–AC-031 |
| FR-005 | AC-010–AC-011 |
| FR-006 | AC-010 |
| FR-007 | AC-011 |
| FR-008 | AC-012 |
| FR-009 | AC-006, AC-011, AC-018–AC-019 |
| FR-010 | AC-011, AC-018 |
| FR-011 | AC-008 |
| FR-012 | AC-013–AC-015 |
| FR-013 | AC-016–AC-017 |
| FR-014 | AC-018–AC-019 |
| FR-015 | AC-013–AC-019, AC-027 |
| FR-016 | AC-020–AC-024 |
| FR-017 | AC-020–AC-021 |
| FR-018 | AC-025–AC-026 |
| FR-019 | AC-021–AC-024 |
| FR-020 | AC-028 |
| FR-021 | AC-029 |
| FR-022 | AC-028–AC-032 |
| FR-023 | AC-033, AC-037 |
| FR-024 | AC-034, AC-036–AC-037 |
| FR-025 | AC-034–AC-035 |
| FR-026 | AC-032, AC-036–AC-038 |
| FR-027 | AC-039–AC-041, AC-045 |
| FR-028 | AC-042, AC-048 |
| FR-029 | AC-043, AC-046–AC-047 |
| FR-030 | AC-040–AC-044 |
| FR-031 | AC-041, AC-045–AC-048 |

每个实现 PR 必须列出覆盖的 `FR-*` 与 `AC-*`，没有验收映射的代码不算 P0 完成。
