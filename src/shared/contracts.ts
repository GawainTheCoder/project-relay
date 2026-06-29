export const layerIds = [
  "model-labs",
  "cloud",
  "accelerators",
  "memory",
  "networking",
  "optics",
  "power-cooling",
  "serving",
  "manufacturing",
  "materials-builders",
] as const;

export type LayerId = (typeof layerIds)[number];
export type Sentiment = "bullish" | "bearish" | "neutral" | "not-material";
export type Materiality = "high" | "medium" | "low" | "not-material";
export type Confidence = "high" | "medium" | "low";
export type SignalNovelty =
  | "new"
  | "confirmation"
  | "contradiction"
  | "repetition";
export type ReviewDecision = "proposed" | "accepted" | "rejected";
export const impactReviewDecisions = [
  "accepted",
  "rejected",
  "deferred",
] as const;
export type ImpactReviewDecision = (typeof impactReviewDecisions)[number];
export const impactReviewReasonTags = [
  "wrong-company",
  "wrong-layer",
  "overstated-materiality",
  "unsupported-conclusion",
  "missed-important-claim",
  "useful-analysis",
  "other",
] as const;
export type ImpactReviewReasonTag = (typeof impactReviewReasonTags)[number];
export type SourceKind =
  | "earnings-release"
  | "transcript"
  | "paper"
  | "technical"
  | "other";

export interface EvidenceClaim {
  id: string;
  quote: string;
  sourceId: string;
  locator: string;
}

export interface ThesisImpact {
  id: string;
  companyTicker: string;
  direction: Sentiment;
  summary: string;
  confidence: Confidence;
  horizon: string;
  thesisDelta: string;
  decision: ReviewDecision;
  review?: ImpactReview | null;
}

export interface ImpactReview {
  impactId: string;
  updateId: string;
  companyTicker: string;
  decision: ImpactReviewDecision;
  reasonTags: ImpactReviewReasonTag[];
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ImpactReviewInput {
  decision: ImpactReviewDecision;
  reasonTags: ImpactReviewReasonTag[];
  note?: string;
}

export interface ImpactReviewSummary {
  total: number;
  byDecision: Record<ImpactReviewDecision, number>;
  byReason: Record<ImpactReviewReasonTag, number>;
  byCompany: Record<string, number>;
}

export type SearchResultType =
  | "brief"
  | "company"
  | "evidence"
  | "update";

export interface SearchResult {
  type: SearchResultType;
  id: string;
  title: string;
  subtitle: string;
  snippet: string;
  href: string;
  matchedField: string;
}

export interface IntelligenceUpdate {
  id: string;
  title: string;
  publisher: string;
  sourceUrl: string | null;
  publishedAt: string;
  ingestedAt: string;
  layerIds: LayerId[];
  companyTickers: string[];
  materiality: Materiality;
  materialityReason: string;
  novelty: SignalNovelty;
  sentiment: Sentiment;
  whatHappened: string;
  whyItMatters: string;
  beneficiaries: string[];
  threatened: string[];
  watchNext: string[];
  claims: EvidenceClaim[];
  thesisImpacts: ThesisImpact[];
  model: string | null;
}

export interface Company {
  ticker: string;
  name: string;
  layerIds: LayerId[];
  description: string;
  thesis: string;
  whyItMatters: string;
  provesRight: string[];
  breaksThesis: string[];
  watchMetrics: string[];
  confidence: Confidence;
  updatedAt: string;
}

export interface StackLayer {
  id: LayerId;
  name: string;
  description: string;
  companyTickers: string[];
  dependsOn: LayerId[];
}

export interface ResearchSource {
  id: string;
  name: string;
  type: "rss" | "investor-relations" | "filing" | "paper" | "release" | "manual";
  url: string | null;
  enabled: boolean;
  status: "ready" | "syncing" | "error";
  lastSyncedAt: string | null;
  documentCount: number;
}

export interface DailyBrief {
  id: string;
  date: string;
  title: string;
  summary: string;
  signal: string;
  secondarySignals: string[];
  updateIds: string[];
  citationClaimIds: string[];
  generatedAt: string;
  model: string | null;
}

export interface DashboardPayload {
  brief: DailyBrief | null;
  updates: IntelligenceUpdate[];
  layers: StackLayer[];
  companies: Company[];
  sources: ResearchSource[];
  demoData: boolean;
}

export interface ImportSourceInput {
  title: string;
  publisher: string;
  sourceUrl?: string;
  publishedAt?: string;
  content?: string;
  sourceKind?: SourceKind;
}
