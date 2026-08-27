import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { ParsedArtifact } from "../src/artifacts/types.js";
import { main } from "../src/cli/main.js";
import {
  contractSchema,
  scanReportSchema,
  type ByokSemanticConfig,
  type Contract,
} from "../src/schemas/index.js";
import {
  HttpJsonByokSemanticAnalyzer,
  validateByokEndpoint,
} from "../src/semantic/byok.js";
import { buildRedactedSemanticInput } from "../src/semantic/redaction.js";
import { runSemanticStage } from "../src/semantic/runtime.js";
import { sha256 } from "../src/utils/hash.js";
import {
  cleanupRepository,
  copyShadowRepository,
  PROJECT_ROOT,
} from "./helpers/repository.js";

const repositories: string[] = [];

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(repositories.splice(0).map(cleanupRepository));
});

function contract(): Contract {
  return contractSchema.parse({
    id: "CTR-601",
    title: "Synthetic BYOK contract",
    status: "active",
    severity: "high",
    topic: "byok_test",
    rule: { operator: "require", object: "audit", applies_to: ["chat"] },
    defined_by: [{ path: "docs/contract.md", locator: "CTR-601" }],
  });
}

function context() {
  const text =
    "The provider may bypass the audit. api_key=sk-synthetic-not-a-real-key";
  const artifacts: ParsedArtifact[] = [
    {
      artifact: {
        id: `ART-${sha256("docs/contract.md").slice(0, 12)}`,
        category: "requirements",
        path: "docs/contract.md",
        revision: "fixture",
        contentHash: sha256(text),
        byteSize: Buffer.byteLength(text),
        parserStatus: "parsed",
        diagnostics: [],
      },
      nodes: [
        {
          kind: "paragraph",
          text,
          startLine: 1,
          endLine: 1,
        },
      ],
    },
  ];
  return buildRedactedSemanticInput({
    scanId: "SCAN-BYOK",
    mode: "local",
    contracts: [contract()],
    artifacts,
    changedPaths: [],
  });
}

function config(
  overrides: Partial<ByokSemanticConfig> = {},
): ByokSemanticConfig {
  return {
    schemaVersion: 1,
    transport: "http-json",
    endpoint: "http://127.0.0.1:8787/semantic",
    model: "synthetic-provider-model",
    apiKeyEnv: "DECISIONTRACE_TEST_BYOK_KEY",
    authHeader: "Authorization",
    authPrefix: "Bearer ",
    responseMaxBytes: 1_048_576,
    budget: {
      maxRequestUsd: 0.1,
      inputUsdPerMillionTokens: 1,
      outputUsdPerMillionTokens: 2,
      maxOutputTokens: 500,
    },
    ...overrides,
  };
}

describe("provider-agnostic BYOK boundary", () => {
  it("[AC-050] keeps the tracked BYOK example schema-valid without a key", async () => {
    const example = JSON.parse(
      await readFile(
        path.join(PROJECT_ROOT, "examples/semantic/byok.example.json"),
        "utf8",
      ),
    ) as unknown;
    expect(
      () =>
        new HttpJsonByokSemanticAnalyzer({
          config: example,
          mode: "cloud",
          environment: {},
          fetchImplementation: vi.fn<typeof fetch>(),
        }),
    ).not.toThrow();
  });

  it("[AC-050] accepts only HTTPS cloud or loopback local endpoints and safe auth headers", () => {
    expect(() => validateByokEndpoint(config(), "local")).not.toThrow();
    expect(() =>
      validateByokEndpoint(
        config({ endpoint: "http://provider.example/semantic" }),
        "cloud",
      ),
    ).toThrow(/HTTPS/u);
    expect(() =>
      validateByokEndpoint(
        config({ endpoint: "https://provider.example/semantic" }),
        "local",
      ),
    ).toThrow(/localhost/u);
    expect(() =>
      validateByokEndpoint(
        config({ endpoint: "https://user:password@provider.example/semantic" }),
        "cloud",
      ),
    ).toThrow(/credentials/u);
    expect(
      () =>
        new HttpJsonByokSemanticAnalyzer({
          config: { ...config(), authHeader: "Cookie" },
          mode: "local",
          environment: {},
          fetchImplementation: vi.fn<typeof fetch>(),
        }),
    ).toThrow(/authHeader/u);
    expect(
      () =>
        new HttpJsonByokSemanticAnalyzer({
          config: { ...config(), apiKeyEnv: "GITHUB_TOKEN" },
          mode: "local",
          environment: {},
          fetchImplementation: vi.fn<typeof fetch>(),
        }),
    ).toThrow(/apiKeyEnv/u);
    expect(() =>
      validateByokEndpoint(config({ authHeader: "x-api-key" }), "local"),
    ).not.toThrow();
  });

  it("[AC-051] abstains before fetch when key is missing", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const analyzer = new HttpJsonByokSemanticAnalyzer({
      config: config(),
      mode: "local",
      environment: {},
      fetchImplementation: fetchMock,
    });
    const result = await runSemanticStage({
      mode: "local",
      analyzer,
      context: context(),
      contracts: [contract()],
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.stage.status).toBe("abstained");
    expect(result.stage.cost.status).toBe("estimated");
    expect(result.diagnostics[0]?.code).toBe("SEMANTIC_BYOK_KEY_MISSING");
  });

  it("[AC-050, AC-051] preserves a maximum-length model identity in abstention", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const model = "m".repeat(200);
    const analyzer = new HttpJsonByokSemanticAnalyzer({
      config: config({ model }),
      mode: "local",
      environment: {},
      fetchImplementation: fetchMock,
    });
    const result = await runSemanticStage({
      mode: "local",
      analyzer,
      context: context(),
      contracts: [contract()],
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.stage.provider).toBe(`byok-http:${model}`);
    expect(result.stage.status).toBe("abstained");
  });

  it("[AC-051] rejects implicit or conflicting CLI provider options before scanning", async () => {
    const messages: string[] = [];
    const io = {
      stdout: () => undefined,
      stderr: (message: string) => messages.push(message),
    };
    expect(
      await main(
        [
          "node",
          "decisiontrace",
          "scan",
          "--repo",
          PROJECT_ROOT,
          "--semantic",
          "off",
          "--semantic-byok",
          "examples/semantic/byok.example.json",
        ],
        io,
      ),
    ).toBe(2);
    expect(messages.join("\n")).toContain("require --semantic local");

    messages.length = 0;
    expect(
      await main(
        [
          "node",
          "decisiontrace",
          "scan",
          "--repo",
          PROJECT_ROOT,
          "--semantic",
          "local",
          "--semantic-replay",
          "unused-replay.json",
          "--semantic-byok",
          "unused-byok.json",
        ],
        io,
      ),
    ).toBe(2);
    expect(messages.join("\n")).toContain("mutually exclusive");
  });

  it("[AC-052] blocks a request whose preflight maximum exceeds budget", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const analyzer = new HttpJsonByokSemanticAnalyzer({
      config: config({
        budget: {
          maxRequestUsd: 0.000001,
          inputUsdPerMillionTokens: 10,
          outputUsdPerMillionTokens: 100,
          maxOutputTokens: 1000,
        },
      }),
      mode: "local",
      environment: { DECISIONTRACE_TEST_BYOK_KEY: "synthetic-test-key" },
      fetchImplementation: fetchMock,
    });
    const result = await runSemanticStage({
      mode: "local",
      analyzer,
      context: context(),
      contracts: [contract()],
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.diagnostics[0]?.code).toBe("SEMANTIC_BYOK_BUDGET_EXCEEDED");
  });

  it("[AC-052] preserves an extreme over-budget estimate in the abstained report", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const analyzer = new HttpJsonByokSemanticAnalyzer({
      config: config({
        budget: {
          maxRequestUsd: 100,
          inputUsdPerMillionTokens: 10_000,
          outputUsdPerMillionTokens: 10_000,
          maxOutputTokens: 32_768,
        },
      }),
      mode: "local",
      environment: { DECISIONTRACE_TEST_BYOK_KEY: "synthetic-test-key" },
      fetchImplementation: fetchMock,
    });
    const result = await runSemanticStage({
      mode: "local",
      analyzer,
      context: context(),
      contracts: [contract()],
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.stage.status).toBe("abstained");
    expect(result.stage.cost.status).toBe("estimated");
    if (result.stage.cost.status !== "estimated") {
      throw new Error("Expected estimated BYOK cost");
    }
    expect(result.stage.cost.estimatedMaxUsd).toBeGreaterThan(100);
    expect(result.diagnostics[0]?.code).toBe("SEMANTIC_BYOK_BUDGET_EXCEEDED");
  });

  it("[AC-053] sends only redacted protocol input and records reported cost", async () => {
    const semanticContext = context();
    const sourceId = semanticContext.input.sources[0]!.id;
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          schemaVersion: 1,
          inputId: semanticContext.input.inputId,
          candidates: [
            {
              kind: "conflict",
              statement: "The provider proposes a synthetic conflict.",
              confidence: 0.7,
              sourceIds: [sourceId],
              suggestedReview: "Review the synthetic provider output.",
              driftType: "D1",
              contractIds: ["CTR-601"],
              severity: "critical",
            },
          ],
          usage: { inputTokens: 120, outputTokens: 40, costUsd: 0.0002 },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
    const analyzer = new HttpJsonByokSemanticAnalyzer({
      config: config(),
      mode: "local",
      environment: { DECISIONTRACE_TEST_BYOK_KEY: "synthetic-test-key" },
      fetchImplementation: fetchMock,
    });
    const result = await runSemanticStage({
      mode: "local",
      analyzer,
      context: semanticContext,
      contracts: [contract()],
    });
    expect(result.stage.status).toBe("complete");
    expect(result.stage.candidates).toHaveLength(1);
    expect(result.findingDrafts[0]?.status).toBe("exploratory");
    expect(result.stage.cost).toMatchObject({
      status: "reported",
      reportedInputTokens: 120,
      reportedOutputTokens: 40,
      reportedUsd: 0.0002,
    });

    const [requestUrl, requestInit] = fetchMock.mock.calls[0]!;
    const actualUrl =
      typeof requestUrl === "string"
        ? requestUrl
        : requestUrl instanceof URL
          ? requestUrl.href
          : requestUrl.url;
    expect(actualUrl).toBe("http://127.0.0.1:8787/semantic");
    const headers = new Headers(requestInit?.headers);
    expect(headers.get("Authorization")).toBe("Bearer synthetic-test-key");
    expect(requestInit?.redirect).toBe("error");
    const body = requestInit?.body;
    if (typeof body !== "string")
      throw new Error("Expected string request body");
    expect(body).toContain('"protocol":"decisiontrace.semantic.v1"');
    expect(body).toContain('"limits":{"maxOutputTokens":500}');
    expect(body).not.toContain("docs/contract.md");
    expect(body).not.toContain("sk-synthetic-not-a-real-key");
    expect(body).not.toContain("synthetic-test-key");
  });

  it("[AC-052] discards output when the provider exceeds the requested token limit", async () => {
    const semanticContext = context();
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          schemaVersion: 1,
          inputId: semanticContext.input.inputId,
          candidates: [],
          usage: { inputTokens: 100, outputTokens: 501, costUsd: 0.001 },
        }),
        { status: 200 },
      ),
    );
    const analyzer = new HttpJsonByokSemanticAnalyzer({
      config: config(),
      mode: "local",
      environment: { DECISIONTRACE_TEST_BYOK_KEY: "synthetic-test-key" },
      fetchImplementation: fetchMock,
    });
    const result = await runSemanticStage({
      mode: "local",
      analyzer,
      context: semanticContext,
      contracts: [contract()],
    });
    expect(result.stage.status).toBe("abstained");
    expect(result.stage.candidates).toHaveLength(0);
    expect(result.diagnostics[0]?.code).toBe(
      "SEMANTIC_BYOK_OUTPUT_LIMIT_EXCEEDED",
    );
  });

  it("[AC-052] discards output when reported cost exceeds budget", async () => {
    const semanticContext = context();
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          schemaVersion: 1,
          inputId: semanticContext.input.inputId,
          candidates: [],
          usage: { inputTokens: 100, outputTokens: 10, costUsd: 0.2 },
        }),
        { status: 200 },
      ),
    );
    const analyzer = new HttpJsonByokSemanticAnalyzer({
      config: config(),
      mode: "local",
      environment: { DECISIONTRACE_TEST_BYOK_KEY: "synthetic-test-key" },
      fetchImplementation: fetchMock,
    });
    const result = await runSemanticStage({
      mode: "local",
      analyzer,
      context: semanticContext,
      contracts: [contract()],
    });
    expect(result.stage.status).toBe("abstained");
    expect(result.stage.cost).toMatchObject({
      status: "reported",
      reportedUsd: 0.2,
    });
    expect(result.diagnostics[0]?.code).toBe(
      "SEMANTIC_BYOK_REPORTED_COST_EXCEEDED",
    );
  });

  it("[AC-054] hides provider response bodies and does not retry HTTP failures", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response("private provider diagnostic", { status: 429 }),
      );
    const analyzer = new HttpJsonByokSemanticAnalyzer({
      config: config(),
      mode: "local",
      environment: { DECISIONTRACE_TEST_BYOK_KEY: "synthetic-test-key" },
      fetchImplementation: fetchMock,
    });
    const result = await runSemanticStage({
      mode: "local",
      analyzer,
      context: context(),
      contracts: [contract()],
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(result.stage.status).toBe("abstained");
    expect(result.diagnostics[0]?.code).toBe("SEMANTIC_BYOK_HTTP_ERROR");
    expect(JSON.stringify(result.diagnostics)).not.toContain(
      "private provider diagnostic",
    );
  });

  it("[AC-054] rejects a live response without usage evidence", async () => {
    const semanticContext = context();
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          schemaVersion: 1,
          inputId: semanticContext.input.inputId,
          candidates: [],
        }),
        { status: 200 },
      ),
    );
    const analyzer = new HttpJsonByokSemanticAnalyzer({
      config: config(),
      mode: "local",
      environment: { DECISIONTRACE_TEST_BYOK_KEY: "synthetic-test-key" },
      fetchImplementation: fetchMock,
    });
    const result = await runSemanticStage({
      mode: "local",
      analyzer,
      context: semanticContext,
      contracts: [contract()],
    });
    expect(result.stage.status).toBe("abstained");
    expect(result.stage.cost.status).toBe("estimated");
    expect(result.diagnostics[0]?.code).toBe("SEMANTIC_BYOK_RESPONSE_INVALID");
  });

  it("[AC-054] aborts a slow BYOK request once without accepting output", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("aborted", "AbortError")),
            { once: true },
          );
        }),
    );
    const analyzer = new HttpJsonByokSemanticAnalyzer({
      config: config(),
      mode: "local",
      environment: { DECISIONTRACE_TEST_BYOK_KEY: "synthetic-test-key" },
      fetchImplementation: fetchMock,
    });
    const result = await runSemanticStage({
      mode: "local",
      analyzer,
      context: context(),
      contracts: [contract()],
      timeoutMilliseconds: 5,
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(result.stage.status).toBe("abstained");
    expect(result.diagnostics[0]?.code).toBe("SEMANTIC_PROVIDER_TIMEOUT");
  });

  it("[AC-054] stops reading an oversized response stream", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("x".repeat(128), { status: 200 }));
    const analyzer = new HttpJsonByokSemanticAnalyzer({
      config: config({ responseMaxBytes: 32 }),
      mode: "local",
      environment: { DECISIONTRACE_TEST_BYOK_KEY: "synthetic-test-key" },
      fetchImplementation: fetchMock,
    });
    const result = await runSemanticStage({
      mode: "local",
      analyzer,
      context: context(),
      contracts: [contract()],
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(result.stage.status).toBe("abstained");
    expect(result.diagnostics[0]?.code).toBe(
      "SEMANTIC_BYOK_RESPONSE_TOO_LARGE",
    );
  });

  it("[AC-054] discards credential echo without persisting the key", async () => {
    const credential = "synthetic-test-key";
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(JSON.stringify({ leaked: credential }), { status: 200 }),
      );
    const analyzer = new HttpJsonByokSemanticAnalyzer({
      config: config(),
      mode: "local",
      environment: { DECISIONTRACE_TEST_BYOK_KEY: credential },
      fetchImplementation: fetchMock,
    });
    const result = await runSemanticStage({
      mode: "local",
      analyzer,
      context: context(),
      contracts: [contract()],
    });
    expect(result.diagnostics[0]?.code).toBe("SEMANTIC_BYOK_SECRET_ECHO");
    expect(JSON.stringify(result)).not.toContain(credential);
  });

  it("[AC-051] CLI missing-key BYOK remains a deterministic partial scan with no live call", async () => {
    vi.stubEnv("DECISIONTRACE_TEST_BYOK_KEY", "");
    const root = await copyShadowRepository();
    repositories.push(root);
    const configPath = path.join(root, ".decisiontrace/cache/byok.json");
    await mkdir(path.dirname(configPath), { recursive: true });
    await writeFile(configPath, JSON.stringify(config()));
    const exitCode = await main(
      [
        "node",
        "decisiontrace",
        "scan",
        "--repo",
        root,
        "--semantic",
        "local",
        "--semantic-byok",
        ".decisiontrace/cache/byok.json",
        "--output",
        ".decisiontrace/reports/byok-missing-key",
      ],
      { stdout: () => undefined, stderr: () => undefined },
    );
    expect(exitCode).toBe(0);
    const report = scanReportSchema.parse(
      JSON.parse(
        await readFile(
          path.join(
            root,
            ".decisiontrace/reports/byok-missing-key/report.json",
          ),
          "utf8",
        ),
      ),
    );
    expect(report.result).toBe("partial");
    expect(report.findings.some((finding) => finding.status === "formal")).toBe(
      true,
    );
    expect(report.semantic).toMatchObject({
      status: "abstained",
      provider: "byok-http:synthetic-provider-model",
      cost: { status: "estimated" },
    });
    expect(report.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "SEMANTIC_BYOK_KEY_MISSING" }),
      ]),
    );
  });
});
