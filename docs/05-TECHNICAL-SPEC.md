# DecisionTrace P0 Technical Specification

- 状态：`local-review-ui-implemented`
- 版本：0.3
- 日期：2026-08-27
- 作用：锁定 coding agent 可以直接实现的 P0 技术合同；产品范围仍以 [`01-PRD.md`](01-PRD.md) 为准

## 1. P0 Delivery Slice

P0 分成两个清晰层次：

1. **Deterministic Core（M1–M4 必须完成）**：配置、Artifact inventory、contract registry、trace graph、Git diff、D1/D2/D3 规则、报告、review feedback 和 fixture eval。无网络、无模型密钥也必须完整运行。
2. **Semantic Candidate Layer（M5，受控可选）**：模型只生成候选 claim、edge 或 conflict；默认关闭，只能输出 `exploratory` finding，不能成为 gate。
3. **Local Review UI（M5.5）**：单用户 React UI + loopback Node API，只读取 canonical reports，并通过现有 review services 追加 disposition；不自动 scan、不修改报告、不提供远程账号或 hosted service。

因此工程可以立即从 Deterministic Core 开始，不等待外部用户、许可证或云模型决定。外部发布、真实 repo dogfood 和模型数据出境仍受独立闸门约束。

## 2. Locked P0 Technology Choices

| Area | P0 Decision | Reason |
|---|---|---|
| Runtime | Node.js 22 LTS | 本地 CLI、GitHub Action 与跨平台分发共用运行时 |
| Language | TypeScript，strict，ESM | 让 schema、finding 和 reporter contract 可静态检查 |
| Package manager | npm，提交 lockfile | 降低额外工具前置条件 |
| CLI | Commander 类薄 CLI 层 | 解析参数；业务逻辑不得写进 command handler |
| Runtime schema | Zod 类 runtime validator | 所有配置、model output 和 report 先验证再进入 domain |
| YAML | 成熟 YAML parser | `.decisiontrace.yml` 与 contracts 文件 |
| Globs | 支持 POSIX-style glob 的库 | include/exclude 与 contract path mapping |
| Tests | Vitest 类快速测试框架 | unit、integration、fixtures 与 snapshot schema checks |
| UI | React 19 + React Router + Vite | 本地 Dashboard、history、filters、review 与 comparison；production 资源 bundle 到 `dist/web` |
| Build | `tsc` 生成 server ESM + Vite 生成 browser assets | CLI/API 与 browser runtime 分开构建；无 CDN/runtime 外部依赖 |
| Persistence | Repo-tracked YAML + generated JSON/Markdown/HTML；无数据库 | 可审查、可 diff、无需服务 |
| Git access | `execFile("git", args)`，禁止拼 shell string | 使用现有 Git 真源并降低命令注入风险 |
| Network | Deterministic Core 禁止 outbound；UI 仅绑定 `127.0.0.1` | 保持 local-only，不开放 LAN/public listener |

依赖的精确版本在首次 scaffold 时选择兼容的稳定版本并写入 lockfile；本文不固定会过期的版本号。

## 3. Repository Layout

```text
DecisionTrace/
├── AGENTS.md
├── README.md
├── package.json
├── package-lock.json
├── tsconfig.json
├── src/
│   ├── cli/
│   │   ├── main.ts
│   │   └── commands/
│   ├── config/
│   ├── artifacts/
│   ├── contracts/
│   ├── graph/
│   ├── git/
│   ├── impact/
│   ├── detectors/
│   │   ├── d1-decision-conflict.ts
│   │   ├── d2-claim-without-evidence.ts
│   │   └── d3-change-induced-mismatch.ts
│   ├── findings/
│   ├── reporters/
│   ├── review/
│   ├── eval/
│   ├── semantic/
│   └── ui/                             # local API, report store, comparison
├── ui/                                 # React/Vite browser application
│   └── src/
├── schemas/
├── fixtures/
│   ├── d1/
│   ├── d2/
│   ├── d3/
│   └── negatives/
├── tests/
└── docs/
```

目标 repo 接入后使用：

```text
target-repo/
├── .decisiontrace.yml                 # tracked
└── .decisiontrace/
    ├── contracts.yml                  # tracked, human-confirmed
    ├── cache/                          # ignored, disposable
    ├── reports/                        # ignored by default
    ├── reviews.jsonl                   # deterministic finding dispositions
    └── semantic-reviews.jsonl          # semantic candidate dispositions; local by default
```

DecisionTrace 自身和被扫描目标 repo 是两个不同概念；实现不得假设目标 repo 使用相同语言或目录结构。

## 4. CLI Contract

### 4.1 Commands

```text
decisiontrace init [--force]
decisiontrace scan [--repo <path>] [--base <git-ref>] [--head <git-ref>]
                   [--format json|markdown|html|all] [--output <dir>]
                   [--semantic off|local|cloud]
                   [--semantic-input-output <json>]
                   [--semantic-replay <json>] [--semantic-timeout-ms <n>]
decisiontrace review <report.json> --finding <id>
                   --decision <true_drift|intentional_change|false_positive|accepted_risk|insufficient_evidence>
                   --reason <text>
decisiontrace semantic-review <report.json> --candidate <SEM-id>
                   --decision <confirmed|rejected|needs_context|duplicate>
                   --reason <text>
decisiontrace eval --dataset <path> [--output <dir>]
decisiontrace ui [--repo <path>] [--port <1..65535>] [--api-only]
```

### 4.2 Defaults

- `--repo`：当前工作目录。
- 无 `--base/--head`：full scan。
- 同时提供 `--base/--head`：扫描 `base...head` diff。
- `--format`：`all`。
- `--output`：`<repo>/.decisiontrace/reports/<scan-id>/`。
- `--semantic`：`off`。
- `--semantic-timeout-ms`：`5000`；允许范围 1–600000。
- `--semantic-input-output` / `--semantic-replay`：默认不写出、不加载；必须显式启用 semantic mode。
- `ui --repo`：当前目录或 `DECISIONTRACE_UI_REPO`；`--port` 默认 `4173`；host 固定为 `127.0.0.1`，不能通过 CLI 改为 LAN/public bind。

只提供一个 Git ref 时属于配置错误；不得猜另一个 ref。

### 4.3 Exit Codes

| Code | Meaning |
|---:|---|
| 0 | 命令完成；shadow findings 不改变退出码 |
| 1 | 用户显式启用的 deterministic gate 失败 |
| 2 | 配置、输入、Git、解析或写出错误导致命令无法可信完成 |

Partial/abstained 状态写入 report；shadow mode 不用非零退出码制造 CI failure。

## 5. Configuration Contract

候选 `.decisiontrace.yml` v1：

```yaml
version: 1
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
```

Rules：

- Unknown top-level fields fail validation，避免拼写错误被静默忽略。
- Include path 必须在 repo root 内；解析后逃出 root 的路径必须拒绝。
- `.git`、credentials 和 `.env*` 永远默认排除；用户不能用 broad include 隐式覆盖。
- `mode: local-only` 时进程不得执行网络请求。

## 6. Contract Registry Schema

`.decisiontrace/contracts.yml` v1：

```yaml
version: 1
contracts:
  - id: CTR-001
    title: Evidence-linked finding
    status: active
    severity: high
    topic: formal_finding_evidence
    rule:
      operator: require
      object: source_citation
      applies_to: [formal_report]
    defined_by:
      - path: docs/01-PRD.md
        locator: "CTR-001"
    implemented_by:
      - glob: src/findings/**
    verified_by:
      - glob: tests/findings/**
        required: true
        covers: [formal_report]
    claimed_in:
      - path: README.md
    supersedes: []
```

Required fields：`id`、`title`、`status`、`severity`、`topic`、`rule`、`defined_by`。

Enums：

- `status`: `candidate | active | superseded | retired`
- `severity`: `critical | high | medium | low | info`
- `rule.operator`: `require | forbid | allow | limit`

Only `active` contracts participate in formal D1/D2/D3 detection. `candidate` can appear in exploratory output but cannot gate。

## 7. Domain Schemas

### 7.1 Artifact

```ts
type Artifact = {
  id: string;                 // ART-<sha256(path) first 12 hex>
  category: SourceCategory;
  path: string;               // repo-relative POSIX path
  revision: string;
  contentHash: string;
  byteSize: number;
  parserStatus: "parsed" | "text_only" | "skipped" | "error";
  diagnostics: Diagnostic[];
};
```

### 7.2 Trace Edge

```ts
type TraceEdge = {
  fromId: string;
  relation: "defined_by" | "implemented_by" | "enforced_by" |
            "verified_by" | "claimed_in" | "supersedes" | "affects";
  toId: string;
  basis: "declared" | "deterministic" | "model_candidate";
  confidence: number;         // 0..1
  reviewStatus: "confirmed" | "candidate" | "rejected";
};
```

### 7.3 Finding

```ts
type Finding = {
  id: string;                 // FND-<stable 12 hex>
  scanId: string;
  driftType: "D1" | "D2" | "D3";
  status: "formal" | "exploratory" | "abstained";
  severity: Severity;
  confidence: number;
  contractIds: string[];
  facts: EvidenceStatement[];
  inferences: EvidenceStatement[];
  sources: SourceSpan[];
  affectedPaths: string[];
  suggestedReview: string;
};
```

Formal finding requires at least one `facts` item and one validated `sources` item. Model-only content must stay in `inferences` and cannot be the sole basis of `formal`。

### 7.4 Scan Report

```ts
type ScanReport = {
  schemaVersion: 1;
  scanId: string;
  repository: { rootHash: string; base?: string; head: string };
  mode: "full" | "diff";
  semanticMode: "off" | "local" | "cloud";
  semantic: SemanticStage;      // off | complete | abstained + candidate inventory
  startedAt: string;
  completedAt: string;
  coverage: { included: string[]; skipped: SkippedArtifact[] };
  diagnostics: Diagnostic[];
  findings: Finding[];
  summary: FindingSummary;
  result: "complete" | "partial" | "failed";
};
```

Stable finding ID derives from sorted `driftType + contractIds + source paths + normalized reason key`; same evidence on same revision must produce the same ID。

## 8. Deterministic Detector Contracts

### 8.1 D1 Decision Conflict

Formal D1 triggers when either condition is true：

1. An active contract `supersedes` another contract that is still active。
2. Two active contracts have the same `topic`、overlapping `applies_to` and mutually exclusive structured operators：`require` vs `forbid` for the same object。

`allow` vs `forbid` or natural-language similarity is exploratory until reviewed。

### 8.2 D2 Claim Without Evidence

Formal D2 triggers when an active contract has a `verified_by.required: true` entry and：

- no matching path exists；or
- matching paths are outside allowed source registry；or
- declared `applies_to` contains values absent from union of `verified_by.covers`。

P0 does not claim that a matching test is behaviorally sufficient; it only proves declared evidence exists and claims coverage。Semantic sufficiency belongs to M5 exploratory analysis。

### 8.3 D3 Change-Induced Mismatch

Formal inputs：Git diff changed paths + declared contract globs。

D3 candidate triggers when：

- at least one `implemented_by` path for an active contract changed；and
- none of its `defined_by`、`verified_by` or `claimed_in` paths changed。

Because unchanged evidence may still remain valid，D3 status is `exploratory` by default，severity cannot exceed contract severity，and it never gates in P0。

## 9. Parsing Boundary

- Markdown：保留 heading、paragraph 与 line span；front matter 使用 YAML 解析。
- JSON/YAML：完整结构验证并保留 JSON pointer / YAML path。
- TypeScript/JavaScript/Python/Swift 及其他文本代码：P0 只做 repo-relative path、line span、hash 和 diff hunk；不声称 AST 或行为理解。
- Binary、generated、超限文件：skip 并写入 coverage diagnostics。
- Symlink：解析 real path 后若逃出 repo root 则拒绝。

## 10. Report Contract

每次成功或 partial scan 必须生成：

```text
report.json       # canonical machine result
report.md         # human review
report.html       # same JSON rendered; no new facts
manifest.json     # tool/config/schema/revision hashes
```

Reporter 只能呈现 canonical JSON，不得在 Markdown/HTML 渲染阶段重新调用模型或创造新 finding。

## 11. Review Feedback Contract

`reviews.jsonl` 每行一个 disposition：

```json
{"findingId":"FND-...","scanId":"SCAN-...","decision":"false_positive","reason":"Refactor did not alter behavior","reviewedAt":"..."}
```

Reason 不能为空。P0 不要求身份系统；`reviewer` 为可选本地标签。Original report immutable，feedback 作为追加记录保存。

`semantic-review` 对 `SEM-*` 记录 `confirmed | rejected | needs_context | duplicate`，追加到 `semantic-reviews.jsonl`。它不修改原报告、不把 candidate 写入 active contracts，也不等价于独立 ground truth calibration。

## 12. Semantic Provider Boundary

M5 provider-agnostic boundary：

```ts
interface SemanticAnalyzer {
  readonly name: string;
  analyze(input: RedactedSemanticInput, signal: AbortSignal): Promise<unknown>;
}
```

Rules：

- Default provider 是 `off`；tests 使用 fake provider。
- Analyzer 只能接收 source registry 明确允许的片段；输入先去除常见 key/token/private-key/email/个人绝对路径，再执行每 source、总字符数和 source 数量上限。
- Provider input 不含原始 repo path，只含稳定 `SRC-*` aliases、content hash、span/pointer、redacted text、active structured contracts 与 stable `SIN-*` input ID。
- Provider response schema 固定为 `{schemaVersion: 1, inputId, candidates[]}`；必须回显当前 input ID，unknown source/contract、stale input、unknown field 或超限字符串整批拒绝。
- Candidate 支持 `claim | edge | conflict`；normalized basis 固定 `model_candidate`、review status 固定 `candidate`、status 固定 `exploratory`。
- 只有 conflict 可派生 exploratory `FND-*`；provider statement 只进入 `inferences`，deterministic fact 仅陈述引用经过本地校验。Severity 不得超过被引用 contract 的 severity。
- Provider error、abort、timeout 或 invalid output 导致 semantic stage abstain；Deterministic Core 继续，semantic output 永不 gate。
- `--semantic-input-output` 与 `--semantic-replay` 提供离线两步闭环；replay 文件上限 1 MiB，并绑定精确 `SIN-*`，不会隐式调用模型。
- Fake/replay 开发不需要真实 egress 决定；真正连接 local/cloud provider、发送真实片段、使用 API key 或付费 API 前仍需当前授权。

## 13. Local Review UI Contract

- `decisiontrace ui` 读取配置声明的 reports root，递归发现 `report.json`，每份先经过 `scanReportSchema`；invalid report 和 invalid review line 必须单列，不能静默进入 Dashboard。
- Report route 使用 `RPT-<stable 12 hex>`，由 repo-relative report path + scan ID 派生；重复 scan ID 不覆盖。
- Routes：`/` Dashboard、`/scans` history、`/scans/:reportKey` detail/filter/review、`/compare` stable-ID/hash comparison；production server 对 SPA route 回退到同一 `index.html`。
- Read API：`/api/session`、`/api/dashboard`、`/api/reports`、`/api/reports/:key`、`/api/compare`。Mutation API 只允许 finding/semantic review append，并复用现有 review schemas/services。
- Server 固定监听 `127.0.0.1`；拒绝 unexpected Host 和 cross-site mutation。POST 必须带从 same-origin `/api/session` 获取的随机 `X-DecisionTrace-Token`，body 上限 64 KiB。
- Static responses 使用 CSP、`nosniff`、`DENY` frame policy、same-origin resource/opener policy；browser bundle 不加载 CDN、外部字体、analytics 或远程 script。
- UI 不自动运行 scan、不执行目标 repo 内容、不暴露绝对 repo root，也不把 review 写回 report.json。

## 14. Security Requirements

- 所有 Git 命令使用参数数组和固定 executable，不经过 shell。
- 不执行被分析 repo 中的代码、scripts、hooks 或文档指令。
- 不读取 repo root 外文件。
- 默认排除 secrets、`.env*`、`.git` 和依赖目录。
- Local-only 测试必须在禁网条件下通过。
- Logs 不输出完整私有内容；diagnostics 使用 path、span、hash 和短摘录。
- Local UI 的 loopback HTTP 不改变 Deterministic Core 的禁网合同；它没有 outbound provider/network 调用。

## 15. Definition of Technical Done

一个模块只有在以下全部成立时才算完成：

1. Schema 和错误行为已实现。
2. Unit tests 覆盖 happy、negative、boundary 和 recovery。
3. 对应 [`06-ACCEPTANCE-CRITERIA.md`](06-ACCEPTANCE-CRITERIA.md) 场景通过。
4. 不改变未授权外部状态。
5. `npm run check` 通过：format/lint、typecheck、tests、build、fixture eval。
6. 文档与实际 CLI/schema 一致。
