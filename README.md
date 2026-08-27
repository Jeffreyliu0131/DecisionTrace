# DecisionTrace

- 状态：`byok-contract-implemented; independent-validation-and-live-calibration-pending`
- 创建日期：2026-08-27
- 当前阶段：Deterministic Core、本地 Review UI、hosted CI/shadow Action、首个 public thinkbud-ai dogfood sample，以及受预算约束的 provider-agnostic BYOK transport 已完成；独立人工复核与真实 provider calibration 仍待完成
- 项目负责人：用户（产品判断、ground truth 与发布决定）
- AI 角色：研究、实现、测试与审查协作者；不能替用户确认需求、误报和用户价值
- 开源状态：计划开源；许可证尚未选择，当前不授予任何复用权利
- Public repository：https://github.com/Jeffreyliu0131/DecisionTrace

DecisionTrace 是一个面向 AI-native 产品团队的**产品契约可追溯与漂移检测系统**。它检查同一个产品承诺在 PRD、ADR、AI 行为规范、代码、Prompt、Tests、Evals、README 和 Release Claims 中是否仍然一致，并把潜在失配转成有来源、可审查的候选问题。

它不是通用 AI Code Review、项目管理工具或自动改文档机器人。P0 以本地 CLI、loopback Review UI 和 GitHub Action 的形式旁路接入仓库，不进入目标产品的用户请求链路，不自动修改目标文件，也不把 LLM 判断当作真相。

## P0 要回答的问题

当一个产品发生变化时，DecisionTrace 要能回答：

1. 这次变更影响了哪些已确认的产品承诺或约束？
2. 对应实现、Tests、Evals 和对外声明是否仍然完整且一致？
3. 哪些地方可能存在决定冲突、承诺无验证或变更造成的语义失配？
4. 每条发现的直接证据在哪里，哪些部分只是 AI 推断？
5. 人类 reviewer 最终确认它是真漂移、有意变更、误报还是证据不足？

## P0 形态

```text
Target repository
├── PRD / ADR / AI policy
├── Prompt / Code / Config
├── Tests / Eval datasets
└── README / Release claims
            │
            ▼
 DecisionTrace CLI / GitHub Action
            │
            ▼
 Evidence-linked finding report
            │
            ▼
 Human review and disposition
```

P0 只检测三类漂移：

- `D1 Decision Conflict`：多个仍被视为有效的决定或约束互相冲突。
- `D2 Claim Without Evidence`：产品承诺没有对应 Test/Eval，或证据只覆盖部分路径。
- `D3 Change-Induced Mismatch`：代码、Prompt、配置或数据流变化后，相关需求、验证或对外声明没有同步。

## 文件导航

| 文件 | 唯一职责 |
|---|---|
| [`AGENTS.md`](AGENTS.md) | 约束人类与 coding agents 如何在本项目工作 |
| [`docs/01-PRD.md`](docs/01-PRD.md) | 定义为什么做、为谁做、P0 做什么以及怎样验收 |
| [`docs/02-ARCHITECTURE.md`](docs/02-ARCHITECTURE.md) | 定义集成形态、模块、数据流与信任边界 |
| [`docs/03-EVALUATION.md`](docs/03-EVALUATION.md) | 定义 ground truth、评测阶段、指标与 release gates |
| [`docs/04-OPEN-QUESTIONS.md`](docs/04-OPEN-QUESTIONS.md) | 保存尚未确认、会改变方案的重要问题 |
| [`docs/05-TECHNICAL-SPEC.md`](docs/05-TECHNICAL-SPEC.md) | 锁定技术栈、目录、CLI、schema、detector 与安全合同 |
| [`docs/06-ACCEPTANCE-CRITERIA.md`](docs/06-ACCEPTANCE-CRITERIA.md) | 用 Given/When/Then 定义 P0 可观察完成条件 |
| [`docs/07-IMPLEMENTATION-PLAN.md`](docs/07-IMPLEMENTATION-PLAN.md) | 定义 I-001 起的实施顺序、每阶段 exit gate 与首个 agent prompt |

同一内容只在一个 owner 文件中维护；其他文件使用相对链接引用，不复制完整正文。

## 当前已确认与未确认

### 用户已确认

- DecisionTrace 值得作为候选 AI 产品继续定义。
- 它的本质不是岗位管理，而是对齐同一产品承诺在不同产物中的表示。
- 它应以可嵌入其他产品研发与发布流程的形式工作。
- 已创建本地 Git 项目和 public GitHub repository；当前公开源码尚无开源许可证。
- 本轮要求把文档补齐到 coding agent 可直接开始实现的程度。

### 当前工作假设

- P0 primary user 锁定为使用 AI coding agents、高频修改产品的 Technical PM / AI Product Owner；Engineering Manager、Tech Lead 和 release reviewer 是协作用户。
- P0 采用 Node.js/TypeScript Local CLI + React/Vite loopback Review UI + GitHub Action + JSON/Markdown/HTML report + 人工反馈。
- Markdown/JSON/YAML 结构化解析；代码文件 P0 只作路径、line span、hash 和 diff，不声称 AST/行为理解。
- Synthetic fixture repo 是首个实现与评测对象；ThinkBud、Stock Portfolio 只有在当前请求明确授权后才 dogfood。
- Deterministic Core 默认 local-only、禁网、无模型密钥可完整运行；Semantic Candidate Layer 默认关闭，支持有界脱敏输入、fake/offline replay 与显式 BYOK HTTP-JSON adapter，所有输出只可 exploratory。

### 仍未知

- 首批真实外部用户是谁，以及他们是否愿意在第二个仓库重复使用。
- 首批真实 repo dogfood 的精确读取、隐私与数据出境授权。
- Semantic Candidate Layer 最终使用本地模型、云端模型还是二者兼容；当前没有绑定真实 provider。
- 最终开源许可证、预算、开发周期、package 分发和公开发布方式。

## 可以直接开始什么

Deterministic Core 已实现。当前可依次运行 `npm ci` 和 `npm run check`，或用 `node dist/cli/main.js --help` 查看 CLI。30-case synthetic baseline 保存在 [`fixtures/baseline/eval-report.json`](fixtures/baseline/eval-report.json)：D1/D2 在当前结构化 cases 上无记录失败，D3 保留 `EV-029` 这一条已知纯重命名误报；这只是合成基线，不是外部有效性证明。

M5 可通过 `--semantic local --semantic-input-output <path>` 导出有界脱敏输入，再用 `--semantic-replay <response.json>` 离线复现 provider 输出；claim、edge 与 conflict 均保留为 `SEM-*` candidate，只有 conflict 会额外生成 exploratory finding。`semantic-review` 只追加人工 disposition，不激活 contract、不修改原报告。

真实 provider 只通过显式 `--semantic-byok <config.json>` 接入。一次 live call 同时要求：调用者选择 `local|cloud` semantic mode、提供含 endpoint/model/价格与单请求预算的 schema-valid config，以及在 config 指定的 `DECISIONTRACE_*` 专用环境变量中提供 key。缺任一项即不发请求并 abstain；local endpoint 只能是 loopback，cloud endpoint 必须 HTTPS。示例与精确协议见 [`examples/semantic/`](examples/semantic/)。示例价格只是占位值，实际运行前必须按 provider 官方价格替换。DecisionTrace 不自动重试付费请求；preflight/postflight cost 会进入 JSON/Markdown/HTML 与 Review UI，但客户端预算不能撤销 provider 已产生的账单。

本地 UI 依次运行 `npm run build` 与 `node dist/cli/main.js ui --repo <target-repo>`，然后访问输出的 `127.0.0.1` 地址。开发模式可设置 `DECISIONTRACE_UI_REPO=<target-repo>` 后运行 `npm run dev`。UI 提供 Dashboard、扫描历史、finding/semantic filters、append-only disposition 表单和 stable-ID/hash 报告对比；不自动启动扫描、不部署、不开放局域网监听。

首个真实公开 dogfood 固定在 [`Jeffreyliu0131/thinkbud-ai@5a36aac`](examples/dogfood/thinkbud-ai/analysis.md)。该次 local-only diff scan 记录了 3 条配置依赖的 D2 evidence findings，并明确保留无独立 human disposition、无 real-repo precision claim，以及“文件存在不等于 JSON 内容通过”的 detector limitation。

hosted CI 与 synthetic shadow workflow 已在 public `main` 实际绿色，但这不替代 ground truth。下一步证据缺口仍是：由未参与生成 fixtures 的人独立复核 `EV-001`–`EV-030`，以及在明确 provider、key、预算和发送范围后做真实 semantic calibration。完成前，E1、真实模型质量与外部采用均保持未通过。

以下事项**不阻塞 M1–M4 Deterministic Core**，但继续阻塞相应外部动作：

- 30+ cases 是 M4 Evaluation Gate，不是写第一行代码的前置条件。
- 新增 dogfood repo 需要用户对每个 repo 明确授权；已发布的 thinkbud-ai sample 仍不等于 second-repo evidence。
- BYOK transport 已实现，但真实 semantic provider、付费 API 与真实数据出境仍需要逐次明确授权；fake/replay 与 adapter tests 没有发起 live call。
- 确认许可证后才增加 `LICENSE` 并正式称为 open source。
- Push、release、package publish、部署和联系用户仍需当前请求明确授权。

## 非目标

- 不自动判断 PM、设计、工程或 QA 谁正确。
- 不自动覆盖 PRD、ADR、代码、Test 或 Eval。
- 不证明目标产品有用户价值、学习效果或商业结果。
- 不在 P0 连接 Jira、Slack、Notion、Figma 等全量企业系统。
- 不把所有语义差异作为错误，更不让 LLM 推断直接阻断发布。
