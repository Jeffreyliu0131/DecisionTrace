import { randomBytes } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { lstat, readFile } from "node:fs/promises";
import path from "node:path";

import { DecisionTraceError } from "../errors.js";
import { parseSchema } from "../schemas/validation.js";
import {
  resolveExistingInsideRoot,
  resolveInsideRoot,
} from "../utils/paths.js";
import { TOOL_VERSION } from "../version.js";
import type { ApiErrorResponse, SessionResponse } from "./contracts.js";
import { LocalReportStore } from "./report-store.js";
import {
  findingReviewRequestSchema,
  reportKeySchema,
  semanticReviewRequestSchema,
} from "./schemas.js";

const MAX_REQUEST_BYTES = 64 * 1024;

const CONTENT_TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

export type UiServerOptions = {
  repo: string;
  port?: number;
  apiOnly?: boolean;
  assetsDirectory?: string;
};

export type UiServerHandle = {
  url: string;
  port: number;
  csrfToken: string;
  close: () => Promise<void>;
};

function securityHeaders(api: boolean): Record<string, string> {
  return {
    "Cache-Control": api ? "no-store" : "no-cache",
    "Content-Security-Policy":
      "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
  };
}

function sendJson(
  response: ServerResponse,
  status: number,
  value: unknown,
): void {
  response.writeHead(status, {
    ...securityHeaders(true),
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(`${JSON.stringify(value)}\n`);
}

function apiError(error: unknown): { status: number; body: ApiErrorResponse } {
  if (error instanceof DecisionTraceError) {
    const notFound = error.code.includes("NOT_FOUND");
    const forbidden =
      error.code === "UI_CSRF_REJECTED" || error.code === "UI_HOST_REJECTED";
    return {
      status: notFound ? 404 : forbidden ? 403 : 400,
      body: { error: { code: error.code, message: error.message } },
    };
  }
  return {
    status: 500,
    body: {
      error: {
        code: "UI_INTERNAL_ERROR",
        message: "The local UI server could not complete the request.",
      },
    },
  };
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  if (!request.headers["content-type"]?.startsWith("application/json")) {
    throw new DecisionTraceError("POST requests require application/json.", {
      code: "UI_CONTENT_TYPE_INVALID",
    });
  }
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request as AsyncIterable<Uint8Array>) {
    const buffer = Buffer.from(chunk);
    total += buffer.byteLength;
    if (total > MAX_REQUEST_BYTES) {
      throw new DecisionTraceError(
        `Request body exceeds ${MAX_REQUEST_BYTES} bytes.`,
        { code: "UI_REQUEST_TOO_LARGE" },
      );
    }
    chunks.push(buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new DecisionTraceError("Request body is not valid JSON.", {
      code: "UI_JSON_INVALID",
    });
  }
}

function requireMutationToken(
  request: IncomingMessage,
  csrfToken: string,
): void {
  if (request.headers["sec-fetch-site"] === "cross-site") {
    throw new DecisionTraceError("Cross-site mutation request rejected.", {
      code: "UI_CSRF_REJECTED",
    });
  }
  if (request.headers["x-decisiontrace-token"] !== csrfToken) {
    throw new DecisionTraceError("Missing or invalid local UI token.", {
      code: "UI_CSRF_REJECTED",
    });
  }
}

async function serveStatic(
  request: IncomingMessage,
  response: ServerResponse,
  assetsDirectory: string,
  pathname: string,
): Promise<void> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    sendJson(response, 405, {
      error: { code: "UI_METHOD_NOT_ALLOWED", message: "Method not allowed." },
    });
    return;
  }
  const decoded = decodeURIComponent(pathname);
  const requested =
    decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
  let target = resolveInsideRoot(assetsDirectory, requested, "UI asset");
  try {
    target = await resolveExistingInsideRoot(
      assetsDirectory,
      target,
      "UI asset",
    );
    const metadata = await lstat(target);
    if (!metadata.isFile()) throw new Error("Not a file");
  } catch {
    if (path.extname(requested) !== "") {
      sendJson(response, 404, {
        error: { code: "UI_ASSET_NOT_FOUND", message: "Asset not found." },
      });
      return;
    }
    target = await resolveExistingInsideRoot(
      assetsDirectory,
      path.join(assetsDirectory, "index.html"),
      "UI index",
    );
  }
  const body = await readFile(target);
  response.writeHead(200, {
    ...securityHeaders(false),
    "Cache-Control":
      path.basename(target) === "index.html"
        ? "no-cache"
        : "public, max-age=31536000, immutable",
    "Content-Type":
      CONTENT_TYPES[path.extname(target)] ?? "application/octet-stream",
  });
  response.end(request.method === "HEAD" ? undefined : body);
}

export async function startUiServer(
  options: UiServerOptions,
): Promise<UiServerHandle> {
  const store = await LocalReportStore.open(options.repo);
  const csrfToken = randomBytes(24).toString("hex");
  const apiOnly = options.apiOnly ?? false;
  const assetsDirectory =
    options.assetsDirectory ?? path.resolve(import.meta.dirname, "../web");
  if (!apiOnly) {
    await resolveExistingInsideRoot(
      path.dirname(assetsDirectory),
      assetsDirectory,
      "UI assets",
    ).catch(() => {
      throw new DecisionTraceError(
        `Built UI assets not found: ${assetsDirectory}. Run 'npm run build:ui' first.`,
        { code: "UI_ASSETS_NOT_FOUND" },
      );
    });
  }

  let boundPort = 0;
  const server = createServer((request, response) => {
    void (async () => {
      try {
        const allowedHosts = new Set([
          `127.0.0.1:${boundPort}`,
          `localhost:${boundPort}`,
        ]);
        if (!allowedHosts.has(request.headers.host ?? "")) {
          throw new DecisionTraceError("Unexpected Host header.", {
            code: "UI_HOST_REJECTED",
          });
        }
        const url = new URL(
          request.url ?? "/",
          `http://${request.headers.host}`,
        );
        if (!url.pathname.startsWith("/api/")) {
          if (apiOnly) {
            sendJson(response, 404, {
              error: { code: "UI_API_ONLY", message: "API-only server." },
            });
            return;
          }
          await serveStatic(request, response, assetsDirectory, url.pathname);
          return;
        }

        if (request.method === "GET" && url.pathname === "/api/session") {
          const body: SessionResponse = {
            csrfToken,
            toolVersion: TOOL_VERSION,
          };
          sendJson(response, 200, body);
          return;
        }
        if (request.method === "GET" && url.pathname === "/api/health") {
          sendJson(response, 200, { status: "ok", toolVersion: TOOL_VERSION });
          return;
        }
        if (request.method === "GET" && url.pathname === "/api/dashboard") {
          sendJson(response, 200, await store.dashboard());
          return;
        }
        if (request.method === "GET" && url.pathname === "/api/reports") {
          sendJson(response, 200, await store.history());
          return;
        }
        if (
          request.method === "GET" &&
          url.pathname.startsWith("/api/reports/")
        ) {
          const key = parseSchema(
            reportKeySchema,
            url.pathname.slice("/api/reports/".length),
            "report key",
          );
          sendJson(response, 200, await store.detail(key));
          return;
        }
        if (request.method === "GET" && url.pathname === "/api/compare") {
          const left = parseSchema(
            reportKeySchema,
            url.searchParams.get("left"),
            "left report key",
          );
          const right = parseSchema(
            reportKeySchema,
            url.searchParams.get("right"),
            "right report key",
          );
          sendJson(response, 200, await store.compare(left, right));
          return;
        }
        if (
          request.method === "POST" &&
          url.pathname === "/api/reviews/findings"
        ) {
          requireMutationToken(request, csrfToken);
          const body = parseSchema(
            findingReviewRequestSchema,
            await readJsonBody(request),
            "finding review",
          );
          sendJson(response, 201, { review: await store.reviewFinding(body) });
          return;
        }
        if (
          request.method === "POST" &&
          url.pathname === "/api/reviews/semantic"
        ) {
          requireMutationToken(request, csrfToken);
          const body = parseSchema(
            semanticReviewRequestSchema,
            await readJsonBody(request),
            "semantic review",
          );
          sendJson(response, 201, { review: await store.reviewSemantic(body) });
          return;
        }
        sendJson(response, 404, {
          error: { code: "UI_ROUTE_NOT_FOUND", message: "Route not found." },
        });
      } catch (error) {
        const mapped = apiError(error);
        sendJson(response, mapped.status, mapped.body);
      }
    })();
  });
  server.on("clientError", (_error, socket) => {
    socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 4173, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new DecisionTraceError("UI server did not bind a TCP port.", {
      code: "UI_BIND_FAILED",
    });
  }
  boundPort = address.port;
  return {
    url: `http://127.0.0.1:${boundPort}`,
    port: boundPort,
    csrfToken,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) =>
          error === undefined ? resolve() : reject(error),
        );
      });
    },
  };
}
