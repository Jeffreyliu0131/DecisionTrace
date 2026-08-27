# Semantic BYOK example

[`byok.example.json`](byok.example.json) 只演示 DecisionTrace 的 provider-agnostic HTTP-JSON transport contract。域名、model ID、价格和预算都是不可直接使用的占位值；仓库没有内置任何 provider key，也没有用真实 provider 校准过输出质量。

要显式启用一次请求：

1. 将示例复制到目标 repository 内，替换 endpoint、精确 model ID、官方输入/输出价格、`maxOutputTokens` 与 `maxRequestUsd`。
2. cloud mode 只接受 HTTPS endpoint；local mode 只接受 loopback HTTP(S)。endpoint 必须实现生成的 [`semantic-byok-request.v1.schema.json`](../../schemas/semantic-byok-request.v1.schema.json) 与 [`semantic-byok-response.v1.schema.json`](../../schemas/semantic-byok-response.v1.schema.json)；live response 必须提供 token usage，`costUsd` 可由 adapter 报告或由 DecisionTrace 按 config 价格计算。
3. 只在本次外部调用和费用已经明确授权时设置 config 中 `apiKeyEnv` 指定的环境变量。Key 不写进 JSON、请求 body、report 或 diagnostics。
4. 显式运行：

```bash
export DECISIONTRACE_SEMANTIC_API_KEY='<provider-key>'
node dist/cli/main.js scan \
  --repo /path/to/target-repo \
  --semantic cloud \
  --semantic-byok .decisiontrace/semantic-byok.json \
  --semantic-timeout-ms 5000
```

没有 `--semantic-byok`、schema-valid budget config 或非空 key 时，DecisionTrace 不发送 BYOK 请求。Preflight 使用序列化 request 的 UTF-8 byte count 作为保守的 transport-side input estimate，并把 `limits.maxOutputTokens` 发给 adapter；它不是 provider tokenizer 或额外 prompt framing 的账单上界，adapter 必须执行 output limit 并回报完整 usage。HTTP error、timeout、超限响应、credential echo、invalid/stale output 或 postflight 超预算都会 abstain，保留 Deterministic Core，且不自动重试。

客户端 preflight 只能限制它是否发起请求，postflight 只能拒绝输出；二者都不能撤销 provider 已经计费的请求。任何 semantic candidate 继续是 exploratory，不会修改 contract 或触发 gate。
