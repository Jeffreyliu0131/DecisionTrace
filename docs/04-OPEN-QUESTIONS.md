# DecisionTrace Open Questions

- 状态：Active
- 日期：2026-08-27
- 规则：这里只保存会改变产品、架构、验证或公开权利的 Unknown；答案确认后写回对应 canonical owner，并在此标记 resolved，而不是复制答案全文

## OQ-001｜第一目标用户是谁？

- 状态：Open
- 当前候选：Technical PM / AI Product Owner / Engineering Manager / Tech Lead
- 为什么重要：决定报告语言、集成入口、严重性模型和付费/分发路径。
- 需要的证据：至少 3 名候选用户对手工 drift report 的真实 review；赞美或“会使用”不算行为证据。
- Owner：用户

## OQ-002｜首批 dogfood 仓库是哪两个？

- 状态：Open
- 当前候选：ThinkBud、Stock Portfolio、合成 fixture repo
- 为什么重要：决定 parser 范围、contract 类型和隐私边界。
- 需要的决定：每个 repo 是否允许读取、是否允许将片段发送到云端模型、哪些内容必须排除。
- Owner：用户

## OQ-003｜P0 是否允许源内容离开本机？

- 状态：Open
- 选项：local-only；显式选择 cloud model；两者兼容
- 为什么重要：改变技术架构、可用模型、成本、安全说明和企业可接受度。
- 最小原则：无论选择什么，都必须显示 egress 范围并提供无密钥降级。
- Owner：用户

## OQ-004｜P0 支持哪些语言与 Artifact？

- 状态：Open
- 已确定：Markdown、JSON、YAML、Git diff 属于 P0 候选输入。
- 未确定：TypeScript/Python/Swift parser 深度、Prompt 定义、测试语义分析方式。
- 需要的证据：对两个 dogfood repo 做技术 spike，比较 AST、文本与 hybrid 方法。
- Owner：Engineering

## OQ-005｜Contract claims 如何首次建立？

- 状态：Open
- 选项：完全手工；AI 抽取候选后确认；从结构化 PRD/ADR ID 导入。
- 当前倾向：hybrid；AI 抽取只能进入 candidate，用户确认后 active。
- 最大风险：自动抽取制造一套用户从未同意的“真源”。
- Owner：用户 + Product

## OQ-006｜Graph 如何持久化？

- 状态：Open
- 选项：repo-tracked JSON/YAML；local SQLite；embedded graph DB；组合方案。
- 判断标准：可审查、可版本化、diff 友好、查询成本、私有数据边界。
- Owner：Engineering

## OQ-007｜报告首先给谁看？

- 状态：Open
- 选项：Terminal/Markdown；静态 HTML；PR comment；Web dashboard。
- 当前 P0 候选：Terminal + Markdown/JSON + 静态 HTML artifact。
- 验证：观察真实 reviewer 是否能在 5 分钟内完成 disposition，而非只比较视觉偏好。
- Owner：Product

## OQ-008｜哪些规则将来可以阻断 release？

- 状态：Open
- 当前硬边界：未经 shadow 验证的 LLM 语义 finding 不能成为 Hard Gate。
- 候选：required eval 缺失、结构化 active decision 直接冲突、report generation failure。
- 需要的证据：false-block history、override behavior 与 reviewer agreement。
- Owner：用户 + Release owner

## OQ-009｜最终开源许可证是什么？

- 状态：Open
- 候选：MIT、Apache-2.0 或其他经审核许可证。
- 为什么重要：许可证授予使用、修改和分发权；Public repo 不自动等于 open source。
- 前置：第一方权属、依赖、模型、数据集、字体、图标和 fixture provenance audit。
- Owner：用户

## OQ-010｜项目怎样获得真实外部证据？

- 状态：Open
- 当前候选路径：手工 report 访谈 → dogfood shadow mode → 5-user pilot → second-repo repeat use → OSS issues/PRs。
- 反证：只有 AI 生成代码、合成 benchmark 或 GitHub 仓库存在不能证明用户价值。
- Owner：用户

## OQ-011｜商业化假设是什么？

- 状态：Open
- 当前边界：P0 先验证 workflow blocker 与可行动性，不先设计订阅或 enterprise pricing。
- 后续需要：谁拥有 release risk、谁是 user、谁是 buyer、当前替代方案成本。
- Owner：Product

## OQ-012｜名称与品牌是否继续使用 DecisionTrace？

- 状态：Open
- 当前：Working name only。
- 前置：公开发布前检查命名冲突、域名/包名可用性和不误导的定位。
- Owner：用户

