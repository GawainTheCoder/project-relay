import type {
  Company,
  CompanyInput,
  DashboardPayload,
  DailyBrief,
  ImpactReview,
  ImpactReviewInput,
  ImportSourceInput,
  IntelligenceUpdate,
  ResearchSource,
  ResearchSourceInput,
  SearchResult,
  SourceRefreshResult,
  Thesis,
  ThesisEvaluation,
  ThesisEvaluationReviewInput,
} from "../../shared/contracts";

// Presentation models derived from the canonical shared Thesis contract.
export type BeliefKind = "company" | "macro";
export type BeliefEvidenceStance = "supports" | "opposes" | "context";
export type BeliefEvaluationOutcome =
  | "unchanged"
  | "reinforced"
  | "weakened"
  | "contradicted"
  | "revised";

export interface BeliefEvidence {
  id: string;
  claimId: string | null;
  quote: string;
  locator: string | null;
  publisher: string;
  sourceTitle: string;
  publishedAt: string;
  stance: BeliefEvidenceStance;
  updateId: string | null;
}

export interface BeliefEvaluation {
  id: string;
  outcome: BeliefEvaluationOutcome;
  proposedStatement: string | null;
  confidenceDelta: number;
  rationale: string;
  evidenceIds: string[];
  createdAt: string;
}

export interface BeliefVersion {
  id: string;
  version: number;
  statement: string;
  confidence: number;
  rationale: string | null;
  createdAt: string;
}

export interface BeliefSummary {
  id: string;
  kind: BeliefKind;
  title: string;
  statement: string;
  confidence: number;
  companyTicker: string | null;
  layerIds: string[];
  updatedAt: string;
  supportingEvidenceCount: number;
  opposingEvidenceCount: number;
  pendingEvaluationCount: number;
}

export interface BeliefDetail extends BeliefSummary {
  whyItMatters: string | null;
  latestChange: string | null;
  unknowns: string[];
  strengtheningConditions: string[];
  weakeningConditions: string[];
  supportingEvidence: BeliefEvidence[];
  opposingEvidence: BeliefEvidence[];
  contextualEvidence: BeliefEvidence[];
  pendingEvaluations: BeliefEvaluation[];
  versions: BeliefVersion[];
}

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

export type RefreshSourcesResult = SourceRefreshResult;

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

export interface EvaluateBeliefsResult {
  evaluatedAt: string;
  model: string;
  evaluations: ThesisEvaluation[];
}

export function evaluateBeliefs(): Promise<EvaluateBeliefsResult> {
  return requestJson<EvaluateBeliefsResult>("/api/theses/evaluate", {
    method: "POST",
  });
}

export function reviewBeliefEvaluation(
  evaluationId: string,
  input: ThesisEvaluationReviewInput,
): Promise<ThesisEvaluation> {
  return requestJson<ThesisEvaluation>(
    `/api/thesis-evaluations/${encodeURIComponent(evaluationId)}/review`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export function createCompany(input: CompanyInput): Promise<Company> {
  return requestJson<Company>("/api/companies", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function removeCompany(ticker: string): Promise<void> {
  return requestJson<void>(
    `/api/companies/${encodeURIComponent(ticker)}`,
    { method: "DELETE" },
  );
}

export function createResearchSource(
  input: ResearchSourceInput,
): Promise<ResearchSource> {
  return requestJson<ResearchSource>("/api/sources", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function removeResearchSource(id: string): Promise<void> {
  return requestJson<void>(`/api/sources/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export function listBriefs(
  limit = 30,
  signal?: AbortSignal,
): Promise<DailyBrief[]> {
  const parameters = new URLSearchParams({ limit: String(limit) });
  return requestJson<{ briefs: DailyBrief[] }>(
    `/api/briefs?${parameters}`,
    {
      ...(signal ? { signal } : {}),
    },
  ).then((response) => response.briefs);
}

export function getBrief(
  id: string,
  signal?: AbortSignal,
): Promise<DailyBrief> {
  return requestJson<DailyBrief>(
    `/api/briefs/${encodeURIComponent(id)}`,
    {
      ...(signal ? { signal } : {}),
    },
  );
}

export function listBeliefs(signal?: AbortSignal): Promise<BeliefSummary[]> {
  return requestJson<{ theses: Thesis[] } | Thesis[]>(
    "/api/theses",
    {
      ...(signal ? { signal } : {}),
    },
  ).then((response) =>
    (Array.isArray(response) ? response : response.theses).map(
      thesisToBeliefSummary,
    ),
  );
}

export function getBelief(
  id: string,
  signal?: AbortSignal,
): Promise<BeliefDetail> {
  return requestJson<Thesis | { thesis: Thesis }>(
    `/api/theses/${encodeURIComponent(id)}`,
    {
      ...(signal ? { signal } : {}),
    },
  ).then((response) =>
    thesisToBeliefDetail("thesis" in response ? response.thesis : response),
  );
}

function thesisToBeliefSummary(thesis: Thesis): BeliefSummary {
  return {
    id: thesis.id,
    kind: thesis.kind,
    title: thesis.title,
    statement: thesis.currentVersion.belief,
    confidence: thesis.currentVersion.confidenceScore,
    companyTicker:
      thesis.kind === "company"
        ? (thesis.companyTickers[0] ?? null)
        : null,
    layerIds: thesis.layerIds,
    updatedAt: thesis.updatedAt,
    supportingEvidenceCount: thesis.evidence.filter(
      (evidence) => evidence.stance === "supports",
    ).length,
    opposingEvidenceCount: thesis.evidence.filter(
      (evidence) => evidence.stance === "opposes",
    ).length,
    pendingEvaluationCount: thesis.evaluations.filter(
      (evaluation) =>
        evaluation.reviewStatus === "pending" ||
        evaluation.reviewStatus === "deferred",
    ).length,
  };
}

function thesisToBeliefDetail(thesis: Thesis): BeliefDetail {
  const currentEvaluation = thesis.currentVersion.createdByEvaluationId
    ? thesis.evaluations.find(
        (evaluation) =>
          evaluation.id === thesis.currentVersion.createdByEvaluationId,
      )
    : undefined;
  const evidence = thesis.evidence.map((item): BeliefEvidence => ({
    id: `${item.thesisId}:${item.claimId}`,
    claimId: item.claimId,
    quote: item.claim.quote,
    locator: item.claim.locator,
    publisher: "Source evidence",
    sourceTitle: item.rationale,
    publishedAt: item.linkedAt,
    stance: item.stance,
    updateId: item.updateId,
  }));
  const summary = thesisToBeliefSummary(thesis);
  return {
    ...summary,
    whyItMatters: null,
    latestChange: currentEvaluation?.rationale ?? null,
    unknowns: thesis.currentVersion.unknowns,
    strengtheningConditions: thesis.currentVersion.strengtheningConditions,
    weakeningConditions: thesis.currentVersion.weakeningConditions,
    supportingEvidence: evidence.filter((item) => item.stance === "supports"),
    opposingEvidence: evidence.filter((item) => item.stance === "opposes"),
    contextualEvidence: evidence.filter((item) => item.stance === "context"),
    pendingEvaluations: thesis.evaluations
      .filter(
        (evaluation) =>
          evaluation.reviewStatus === "pending" ||
          evaluation.reviewStatus === "deferred",
      )
      .map((evaluation) => ({
        id: evaluation.id,
        outcome: evaluation.outcome,
        proposedStatement: evaluation.proposedBelief || null,
        confidenceDelta: evaluation.confidenceDelta,
        rationale: evaluation.rationale,
        evidenceIds: evaluation.claimIds,
        createdAt: evaluation.createdAt,
      })),
    versions: thesis.versions.map((version) => ({
      id: version.id,
      version: version.version,
      statement: version.belief,
      confidence: version.confidenceScore,
      rationale: version.createdByEvaluationId
        ? (thesis.evaluations.find(
            (evaluation) =>
              evaluation.id === version.createdByEvaluationId,
          )?.rationale ?? "Accepted evidence changed this thesis.")
        : "Initial thesis capture.",
      createdAt: version.createdAt,
    })),
  };
}
