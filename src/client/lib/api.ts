import type {
  DashboardPayload,
  DailyBrief,
  ImpactReview,
  ImpactReviewInput,
  ImportSourceInput,
  IntelligenceUpdate,
  SearchResult,
} from "../../shared/contracts";

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function requestJson<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const isFormData =
    typeof FormData !== "undefined" && init?.body instanceof FormData;
  const response = await fetch(path, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.body && !isFormData
        ? { "Content-Type": "application/json" }
        : {}),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const payload = (await response.json()) as {
        error?: string | { message?: string };
        message?: string;
      };
      message =
        typeof payload.error === "string"
          ? payload.error
          : (payload.error?.message ?? payload.message ?? message);
    } catch {
      // Keep the status-derived error when the server did not return JSON.
    }
    throw new ApiError(message, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export function getDashboard(signal?: AbortSignal) {
  return requestJson<DashboardPayload>("/api/dashboard", {
    ...(signal ? { signal } : {}),
  });
}

export interface ImportSourceResult {
  documentId: string;
  duplicate: boolean;
  status: string;
  update?: IntelligenceUpdate;
}

export function importSource(
  input: ImportSourceInput,
): Promise<ImportSourceResult> {
  return requestJson<ImportSourceResult>("/api/sources/import", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export interface SearchResponse {
  query: string;
  results: SearchResult[];
}

export function searchRelay(
  query: string,
  options: { limit?: number; signal?: AbortSignal } = {},
): Promise<SearchResponse> {
  const parameters = new URLSearchParams({ q: query });
  if (options.limit) {
    parameters.set("limit", String(options.limit));
  }
  return requestJson<SearchResponse>(`/api/search?${parameters}`, {
    ...(options.signal ? { signal: options.signal } : {}),
  });
}

export function reviewImpact(
  impactId: string,
  input: ImpactReviewInput,
): Promise<ImpactReview> {
  return requestJson<ImpactReview>(
    `/api/impacts/${encodeURIComponent(impactId)}/review`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export interface RefreshSourcesResult {
  imported: number;
  analyzed: number;
  errors: string[];
}

export function refreshSources(): Promise<RefreshSourcesResult> {
  return requestJson<RefreshSourcesResult>("/api/sources/refresh", {
    method: "POST",
  });
}

export function generateBrief(): Promise<DailyBrief> {
  return requestJson<DailyBrief>("/api/briefs/generate", {
    method: "POST",
  });
}
