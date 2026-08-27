# DecisionTrace P0 Implementation Plan

- 状态：`recruiter-public-proof-implemented; metadata-and-independent-validation-pending`
- 日期：2026-08-27
- 原则：一次只实现一个可验证 vertical slice；Local UI 必须保持 loopback/single-user，不得扩成 hosted dashboard、MCP 或 cloud LLM

## 1. Start Conditions

Coding agent 开工前必须：

1. 读取 `AGENTS.md` 和 `docs/01`–`07`。
2. 确认 Git status 与当前分支，不覆盖用户未提交内容。
3. 只实现当前标记 task；发现更大方向问题先记录，不扩 scope。
4. 不调用付费 API、不部署、不 push、不添加 LICENSE，除非当前请求明确授权。

以下条件不阻塞 M1：真实外部用户、许可证、真实 dogfood repo、云模型。它们阻塞的是外部发布与相应后续阶段，不阻塞 fixture-based Deterministic Core。

## 2. Milestone Sequence

```text
M1 Scaffold & Schemas
  ↓
M2 Inventory & Contract Graph
  ↓
M3 Deterministic Detectors & Reports
  ↓
M4 Review, Eval & GitHub Shadow Action
  ↓
M5 Semantic Candidate Layer (optional, gated)
  ↓
M5.5 Local Review UI (loopback only)
  ↓
M5.6 Recruiter-first Public Proof
  ↓
M6 Dogfood / External Validation / OSS Release
```

`observed 2026-08-27`：`I-001`–`I-015`、`I-017`、M5 offline `I-018`–`I-021`、Local UI `I-023`–`I-028`、public dogfood `I-029`、BYOK transport `I-030` 与 recruiter proof `I-031` 已实现；hosted CI 与 Synthetic Shadow Scan 已在 public main 绿色。`I-016` independent reviewer、second dogfood repo、live provider/calibration 与其余 M6 外部动作保持未完成。

## 3. M1｜Scaffold & Schemas

### I-001｜Project scaffold

- 创建 Node.js 22 + strict TypeScript ESM package。
- 配置 npm scripts：`build`、`typecheck`、`test`、`check`。
- 建立 [`05-TECHNICAL-SPEC.md`](05-TECHNICAL-SPEC.md) 指定的 `src/`、`tests/`、`fixtures/` 边界。
- 不实现业务逻辑。

Acceptance：项目在无 API key 环境安装、typecheck、空测试和 build 通过。

### I-002｜Runtime schemas

- 实现 config、contract、artifact、edge、finding、report、review 与 eval-case schema。
- Unknown fields fail closed。
- 增加 schema version 与错误 path。

Coverage：FR-001、FR-005、FR-016、FR-019；AC-003、AC-010、AC-020。

### I-003｜CLI shell

- 实现 command routing、help、argument validation 与 exit-code mapping。
- Command handler 只调用 application services。
- `scan/review/eval` 未实现部分返回明确 `not implemented`，不能假成功。

Coverage：AC-001–AC-003、AC-007。

### I-004｜First fixtures and CI

- 每类 D1/D2/D3 建 1 positive、1 hard negative、1 boundary fixture。
- 增加 GitHub Actions 运行 `npm ci && npm run check`。
- CI 只检查 DecisionTrace 自身，不扫描未经授权 repo。

M1 Exit：I-001–I-004 完成；`npm run check` 通过；schema 与 CLI help 和文档一致。

## 4. M2｜Inventory & Contract Graph

### I-005｜Config and safe file collection

- `init` 创建配置与 contracts 示例。
- 实现 include/exclude、limits、repo-root containment、symlink 和 sensitive defaults。
- 不执行目标 repo 内容。

Coverage：FR-001–FR-004；AC-001–AC-009、AC-030–AC-031。

### I-006｜Git adapter

- 解析 repo root、HEAD、base/head SHA 与 changed paths。
- 使用 `execFile` 参数数组。
- 区分 full/diff，保留 shallow-history error。

Coverage：FR-003、FR-009、FR-011；AC-005–AC-008。

### I-007｜Artifact parsers

- Markdown line spans/front matter；JSON pointer；YAML path；generic code text/diff boundary。
- Binary、generated、oversize 和 parser failure 进入 coverage diagnostics。

Coverage：FR-002、FR-003；AC-004–AC-009、AC-024。

### I-008｜Contract registry and graph

- 只让 active contracts 进入 formal detector。
- 建立 declared edges 和 reverse impact lookup。
- Source conflict 保留双方。

Coverage：FR-005–FR-010；AC-010–AC-012。

M2 Exit：fixture repo 可产生稳定 Artifact inventory 与 graph JSON；相同 revision 复现一致。

## 5. M3｜Detectors & Reports

### I-009｜D1 detector

按 Technical Spec 的两条 formal rule 实现；其他语义冲突不加入 formal。

Coverage：FR-012、FR-015；AC-013–AC-015。

### I-010｜D2 detector

实现 required evidence existence 与 declared applies_to coverage gap。

Coverage：FR-013、FR-015；AC-016–AC-017。

### I-011｜D3 detector

实现 changed implementation vs unchanged definition/evidence/claim；始终 exploratory。

Coverage：FR-009、FR-014–FR-015；AC-018–AC-019。

### I-012｜Finding engine

- Stable IDs。
- Facts/inferences/sources 分离。
- Evidence gate、abstention、severity cap。

Coverage：FR-016–FR-018；AC-020–AC-024。

### I-013｜Reporters

- Canonical JSON first。
- Markdown/HTML 只渲染同一 JSON。
- Manifest 保存 schema/tool/config/revision hashes。

Coverage：FR-019；AC-021–AC-024。

M3 Exit：D1/D2/D3 fixture tests 全部通过，report 三格式一致，citation completeness 100%。

## 6. M4｜Review, Eval & Shadow Action

### I-014｜Review append log

实现 disposition enum、non-empty reason 和 immutable report。

Coverage：FR-018；AC-025–AC-026。

### I-015｜Evaluation harness

- Eval case loader。
- D1/D2/D3 分组 confusion matrix。
- Zero denominator 输出 `not_applicable`。
- 失败 case IDs 可追溯。

Coverage：FR-015；AC-027；Evaluation Gate E1。

### I-016｜Expand fixture dataset

- 每类至少 10 cases，总数至少 30。
- 记录 author、independent reviewer 与 known ambiguity。
- 真实 baseline 无论高低均保存。

### I-017｜GitHub Action shadow mode

- checkout exact revision。
- `npm ci` 后运行 scan。
- 上传 reports；findings 默认 exit 0。
- 最小 `contents: read` 权限。

Coverage：FR-020–FR-022；AC-028–AC-030。

M4 Exit：E1 完成；Action 可在本 repo 的合成 fixture 上运行；没有实际 dogfood/adoption 声明。

## 7. M5｜Semantic Candidate Layer

M5 的 provider-agnostic 开发可以在以下成立后开始：

- Deterministic baseline 和误报已知；
- 输入/输出 schema 稳定；
- 使用 synthetic fixtures、fake provider 或离线 replay，不发送真实源内容。

真正连接 local/cloud provider 前仍必须明确 provider、发送范围、成本与 API key 边界。

### I-018｜Semantic schemas and redaction

- Stable `SIN-*` / `SRC-*` aliases、input limits、常见 secret/email/个人路径 redaction。
- Provider input 不包含原始 repo path，只接收 source registry 允许片段。

Coverage：FR-023；AC-033。

### I-019｜Provider runtime, fake and replay

- `SemanticAnalyzer` + `AbortSignal`、fake provider、1 MiB offline replay。
- Input ID echo、source/contract reference validation、schema reject、timeout/error abstention。

Coverage：FR-024、FR-026；AC-032、AC-036–AC-037。

### I-020｜Candidate normalization and reports

- Claim、edge、conflict 生成稳定 `SEM-*`；所有 output 固定 exploratory。
- Conflict 可派生 exploratory finding；model text 只进入 inference，severity cap，永不 gate。
- JSON/Markdown/HTML 呈现同一 canonical candidate inventory。

Coverage：FR-024–FR-025；AC-034–AC-035。

### I-021｜Semantic feedback

- `semantic-review` 对 `SEM-*` 追加 `confirmed | rejected | needs_context | duplicate` 与 reason。
- 原报告 immutable，不自动激活 claim/edge/contract。

Coverage：FR-026；AC-038。

### I-022｜Live provider and independent calibration

只有用户明确 provider、发送范围、成本/API key，并取得独立 human-labeled set 后才开始。不得用 fake/replay 自证真实模型 precision。

### I-030｜Budgeted provider-agnostic BYOK transport

- Repo-contained v1 config 指定 HTTP-JSON endpoint/model、key 环境变量、认证头、response bound、显式价格与单请求预算；local 只允许 loopback，cloud 只允许 HTTPS。
- Request 只含 redacted semantic input 与 output-token limit；missing key/preflight over-budget 不 fetch，timeout/redirect/HTTP/stream/schema/secret echo/postflight over-limit 全部 abstain 且不 retry。
- Semantic cost 进入 canonical report/renderers/Review UI；所有 provider output 继续 candidate-only，不改 contract、不 gate。
- Tests 仅使用 injected fetch；没有真实 key、付费调用、provider quality 或 billing guarantee 声明。

Coverage：FR-033–FR-035；AC-050–AC-054。

M5 Controlled Exit：I-018–I-021、I-030 与 AC-033–AC-038、AC-050–AC-054 本地通过；I-022 继续 pending，不宣称真实 provider quality。

## 8. M5.5｜Local Review UI

### I-023｜Report store and UI API contracts

- Runtime-validated history、stable `RPT-*`、Dashboard aggregates、invalid artifact diagnostics。
- Finding/candidate/artifact/diagnostic stable comparison。

Coverage：FR-027–FR-028；AC-039、AC-042。

### I-024｜Loopback API server

- 固定 `127.0.0.1`、Host validation、random mutation token、64 KiB JSON body limit。
- CSP/no-sniff/frame-deny/same-origin headers 与 SPA fallback；不提供 LAN/public bind。

Coverage：FR-027、FR-030–FR-031；AC-040–AC-044。

### I-025｜React shell, router and development server

- React/Vite app shell、BrowserRouter、Dashboard/history/detail/compare routes。
- Production bundle 到 `dist/web`；Vite dev proxy 到 loopback API；无 CDN/runtime remote assets。

Coverage：FR-027、FR-031；AC-041、AC-045。

### I-026｜Dashboard and history

- Latest metrics、review queues、trend、recent reports、search/filter 与 invalid artifact visibility。

Coverage：FR-027、FR-031；AC-039、AC-045。

### I-027｜Report detail, filters and disposition forms

- Findings/semantic/diagnostics/coverage tabs；drift/status/severity/review/search filters。
- Finding 与 semantic append-only forms 复用已有 review services，刷新 latest disposition。

Coverage：FR-029–FR-031；AC-043–AC-047。

### I-028｜Comparison and UI verification

- Baseline/target selection、summary deltas、finding/candidate/artifact/diagnostic changes。
- Frontend interaction tests、loopback HTTP integration、production build 与浏览器视觉/路由验证。

Coverage：FR-028、FR-031；AC-042、AC-048。

M5.5 Exit：I-023–I-028 与 AC-039–AC-048 通过；UI 仍是本地 review surface，不自动 scan、不部署、不宣称用户 adoption。

## 9. M5.6｜Recruiter-first Public Proof

### I-031｜Reproducible public product surface

- Root README 首屏解释问题/差异/运行，包含 CI/shadow badge、可复制 CLI/Action、可渲染 architecture、真实 dogfood sample 与 evidence/failure-boundary table。
- `npm run demo` 在 canonical temp realpath 创建独立 synthetic Git target，跑 full + diff、追加 synthetic review、启动 loopback UI并清理；`demo:check` 进入全量门禁。
- Dashboard/finding/compare screenshots 来自同一真实 browser run；manifest 固定 route/dimensions/bytes/SHA-256，测试验证 README references 与 JPEG integrity。
- Demo、截图和 GitHub presence 不进入 precision/adoption/E1 claims；README 首屏保留 no-license boundary。

Coverage：FR-036–FR-037；AC-055–AC-057。

M5.6 Exit：一命令 demo、README、Mermaid render、browser routes、assets manifest/tests 与 `npm run check` 通过；公开展示不等于外部 validation。

## 10. M6｜Dogfood, Field Validation & OSS

分别需要用户明确授权：

- 扫描 ThinkBud/Stock Portfolio 或任何私有 repo；
- 将源片段发送到云模型；
- 联系目标用户；
- 添加许可证；
- push、发布 package、release 或部署站点。

M6 的真实结果更新 Evidence，不回写成虚假 P0 完成。

### I-029｜First public dogfood sample

- 只读扫描 public `Jeffreyliu0131/thinkbud-ai` exact revision，不执行 target scripts、不调用模型。
- 发布最小 config/contracts、canonical JSON + Markdown/HTML、manifest、provenance 与 analyst triage。
- 保留配置依赖、detector blind spots、无 human disposition 与无 precision claim。

Coverage：FR-032；AC-049。

## 11. Next Coding Task Boundary

新的 coding agent 不应重做 M1–M5.6、I-029–I-031 已实现 slice。当前授权顺序中的下一步是完成 Git 可表达的 repository metadata，再报告只能由 GitHub/Profile UI 完成的 pin/homepage 动作；之后才选择独立 reviewer、已知 bad case 或用户明确 provider/key/budget/发送范围后的 I-022 calibration。Hosted SaaS、MCP、额外真实 repo、部署、license 与 package release 仍需当前请求授权。

## 12. Definition of P0 Complete

P0 只有在以下全部满足时完成：

- FR-001–FR-037 均有实现与 AC 映射；
- AC-001–AC-057 全部有自动化或明确人工验证记录；
- 30+ seeded cases 的真实 baseline 已记录；
- JSON/Markdown/HTML 一致；
- local-only 禁网验证通过；
- GitHub Action 默认 shadow、不误阻断；
- 所有已知失败、局限和 Unknown 保留；
- 未宣称外部 adoption、商业结果或正式 open source，除非对应事实与许可证真实存在。
