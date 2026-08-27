import type {
  ApiErrorResponse,
  DashboardData,
  FindingReviewRequest,
  ReportComparison,
  ReportDetail,
  ReportHistory,
  Review,
  SemanticReview,
  SemanticReviewRequest,
  SessionResponse,
} from "./types.js";

export class ApiClientError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "ApiClientError";
    this.code = code;
    this.status = status;
  }
}

let sessionPromise: Promise<SessionResponse> | undefined;

async function parseResponse<T>(response: Response): Promise<T> {
  const body = (await response.json()) as T | ApiErrorResponse;
  if (!response.ok) {
    const error = (body as { error?: { code?: unknown; message?: unknown } })
      .error;
    throw new ApiClientError(
      typeof error?.code === "string" ? error.code : "UI_REQUEST_FAILED",
      typeof error?.message === "string"
        ? error.message
        : `Request failed with ${response.status}`,
      response.status,
    );
  }
  return body as T;
}

async function request<T>(
  pathname: string,
  options?: RequestInit & { mutation?: boolean },
): Promise<T> {
  const headers = new Headers(options?.headers);
  headers.set("Accept", "application/json");
  if (options?.mutation) {
    const session = await getSession();
    headers.set("Content-Type", "application/json");
    headers.set("X-DecisionTrace-Token", session.csrfToken);
  }
  const response = await fetch(pathname, {
    ...options,
    headers,
    credentials: "same-origin",
  });
  return parseResponse<T>(response);
}

export function getSession(): Promise<SessionResponse> {
  sessionPromise ??= request<SessionResponse>("/api/session").catch(
    (error: unknown) => {
      sessionPromise = undefined;
      throw error;
    },
  );
  return sessionPromise;
}

export function getDashboard(): Promise<DashboardData> {
  return request<DashboardData>("/api/dashboard");
}

export function getHistory(): Promise<ReportHistory> {
  return request<ReportHistory>("/api/reports");
}

export function getReport(reportKey: string): Promise<ReportDetail> {
  return request<ReportDetail>(`/api/reports/${encodeURIComponent(reportKey)}`);
}

export function compareReports(
  left: string,
  right: string,
): Promise<ReportComparison> {
  const query = new URLSearchParams({ left, right });
  return request<ReportComparison>(`/api/compare?${query.toString()}`);
}

export async function submitFindingReview(
  input: FindingReviewRequest,
): Promise<Review> {
  const response = await request<{ review: Review }>("/api/reviews/findings", {
    method: "POST",
    mutation: true,
    body: JSON.stringify(input),
  });
  return response.review;
}

export async function submitSemanticReview(
  input: SemanticReviewRequest,
): Promise<SemanticReview> {
  const response = await request<{ review: SemanticReview }>(
    "/api/reviews/semantic",
    {
      method: "POST",
      mutation: true,
      body: JSON.stringify(input),
    },
  );
  return response.review;
}
