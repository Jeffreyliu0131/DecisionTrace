# DecisionTrace Open Questions

- 状态：Active
- 日期：2026-08-27
- 规则：这里只保存会改变产品、架构、验证或公开权利的 Unknown；答案确认后写回对应 canonical owner，并在此标记 resolved，而不是复制答案全文

## OQ-001｜第一目标用户是谁？

- 状态：Resolved for P0；真实需求强度仍待验证
- P0 决定：Primary user 为 Technical PM / AI Product Owner；Engineering Manager、Tech Lead 与 release reviewer 为协作用户。
- 为什么重要：决定报告语言、集成入口、严重性模型和付费/分发路径。
- 需要的证据：至少 3 名候选用户对手工 drift report 的真实 review；赞美或“会使用”不算行为证据。
- Owner：用户

## OQ-002｜首批 dogfood 仓库是哪两个？

- 状态：Partially resolved
- P0 决定：Synthetic fixture repo 是唯一无需额外授权的首个对象，可直接实现；它不算真实 dogfood。
- Observed：用户已授权对 public `Jeffreyliu0131/thinkbud-ai` 做只读 dogfood；exact-revision sample 与 limitations 已记录。它是第一个真实公开 target，但尚无独立 human disposition，因此不计为 E3 完成。
- 仍 Open：第二个真实 repo；Stock Portfolio 或其他 repo 仍需在当前请求分别授权读取范围、敏感排除和模型出境。
- 为什么重要：决定 parser 范围、contract 类型和隐私边界。
- 需要的决定：每个 repo 是否允许读取、是否允许将片段发送到云端模型、哪些内容必须排除。
- Owner：用户

## OQ-003｜P0 是否允许源内容离开本机？

- 状态：Resolved for M1–M4 and M5 development；真实 cloud egress 仍 Open
- P0 决定：Deterministic Core 固定 `local-only`，不发送网络请求。M5 的 provider-agnostic interface、fake provider、redaction 与离线 replay 可使用 synthetic fixtures 直接开发，不等待产品投入使用或真实 egress 方案。
- 仍 Open：真正连接 local/cloud model 前再决定 provider；任何真实/私有片段离机、付费 API 或 API key 使用仍需明确发送范围与当前授权。
- 为什么重要：改变技术架构、可用模型、成本、安全说明和企业可接受度。
- 最小原则：无论最终选择什么，都必须显示 egress 范围并提供无密钥降级；fake/replay 结果不得冒充真实模型质量。
- Owner：用户

## OQ-004｜P0 支持哪些语言与 Artifact？

- 状态：Resolved for P0
- P0 决定：结构化解析 Markdown、JSON、YAML；所有文本代码只保存 path、line span、hash 与 Git diff，不实现 AST/行为理解。语义分析属于 M5 exploratory layer。
- Owner：Engineering

## OQ-005｜Contract claims 如何首次建立？

- 状态：Resolved for P0
- P0 决定：先从 repo-tracked YAML contracts 和结构化 IDs 导入；未来 AI 只能抽取 candidate，用户确认后才 active。
- 最大风险：自动抽取制造一套用户从未同意的“真源”。
- Owner：用户 + Product

## OQ-006｜Graph 如何持久化？

- 状态：Resolved for P0
- P0 决定：Contracts 使用 repo-tracked YAML；graph 和 report 由每次 scan 生成 JSON；cache/reviews 默认本地保存。P0 不使用数据库。
- Owner：Engineering

## OQ-007｜报告首先给谁看？

- 状态：Resolved for P0
- P0 决定：Canonical JSON 仍是唯一报告真源；Markdown/static HTML/terminal 为导出入口，loopback single-user Review UI 提供 Dashboard、history、filters、comparison 与 append-only disposition。PR comment、hosted dashboard 与多用户账号继续延后。
- 验证：观察真实 reviewer 是否能在 5 分钟内完成 disposition，而非只比较视觉偏好。
- Owner：Product

## OQ-008｜哪些规则将来可以阻断 release？

- 状态：Resolved for P0；未来 Hard Gate 仍 Open
- P0 决定：默认 shadow、finding 不改变退出码。用户显式启用后，只有 deterministic required-evidence/config rule 可 Soft Gate。LLM finding 不 gate。
- 未来需要的证据：false-block history、override behavior 与 reviewer agreement。
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
