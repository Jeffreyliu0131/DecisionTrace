# DecisionTrace

- 状态：`framing`
- 创建日期：2026-08-27
- 当前阶段：P0 产品定义与验证设计
- 项目负责人：用户（产品判断、ground truth 与发布决定）
- AI 角色：研究、实现、测试与审查协作者；不能替用户确认需求、误报和用户价值
- 开源状态：计划开源；许可证尚未选择，当前不授予任何复用权利

DecisionTrace 是一个面向 AI-native 产品团队的**产品契约可追溯与漂移检测系统**。它检查同一个产品承诺在 PRD、ADR、AI 行为规范、代码、Prompt、Tests、Evals、README 和 Release Claims 中是否仍然一致，并把潜在失配转成有来源、可审查的候选问题。

它不是通用 AI Code Review、项目管理工具或自动改文档机器人。P0 以本地 CLI 和 GitHub Action 的形式旁路接入仓库，不进入目标产品的用户请求链路，不自动修改目标文件，也不把 LLM 判断当作真相。

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

同一内容只在一个 owner 文件中维护；其他文件使用相对链接引用，不复制完整正文。

## 当前已确认与未确认

### 用户已确认

- DecisionTrace 值得作为候选 AI 产品继续定义。
- 它的本质不是岗位管理，而是对齐同一产品承诺在不同产物中的表示。
- 它应以可嵌入其他产品研发与发布流程的形式工作。
- 本轮先创建本地项目文件夹与 Markdown 真源，不开始编码。

### 当前工作假设

- Primary user 是使用 AI coding agents、高频修改产品的 Technical PM、AI Product Owner、Engineering Manager 或 Tech Lead。
- P0 采用 Local CLI + GitHub Action + 静态报告 + 人工反馈。
- Markdown/JSON/YAML 与 Git diff 是首批输入；具体编程语言支持范围待技术 spike。
- ThinkBud、Stock Portfolio 与合成 fixture repo 可作为首批 dogfood 候选，但使用前仍需分别确认授权与边界。

### 仍未知

- 首批真实外部用户是谁，以及他们是否愿意在第二个仓库重复使用。
- 哪些 artifact 应成为默认 source of truth，哪些只能由用户显式指定。
- P0 使用本地模型、云端模型还是二者兼容。
- 最终开源许可证、仓库地址、技术栈、预算、开发周期和发布方式。

## 开始构建前的闸门

正式实现前至少完成：

1. 人工建立不少于 30 条候选 contract claims 与 ground truth cases；数量是测试设计目标，不是当前完成事实。
2. 用无产品化脚本或人工流程验证三类 drift 是否能被可靠区分。
3. 确认至少两个 dogfood 仓库的读取边界和敏感信息策略。
4. 决定 P0 是否允许任何源代码离开本机。
5. 确认许可证后才增加 `LICENSE` 并公开称为 open source。

## 非目标

- 不自动判断 PM、设计、工程或 QA 谁正确。
- 不自动覆盖 PRD、ADR、代码、Test 或 Eval。
- 不证明目标产品有用户价值、学习效果或商业结果。
- 不在 P0 连接 Jira、Slack、Notion、Figma 等全量企业系统。
- 不把所有语义差异作为错误，更不让 LLM 推断直接阻断发布。

