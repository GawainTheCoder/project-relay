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
export type ReviewDecision = "proposed" | "accepted" | "rejected";

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
  decision: ReviewDecision;
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
  brief: DailyBrief;
  updates: IntelligenceUpdate[];
  layers: StackLayer[];
  companies: Company[];
  sources: ResearchSource[];
}

export interface ImportSourceInput {
  title: string;
  publisher: string;
  sourceUrl?: string;
  publishedAt?: string;
  content?: string;
}

export interface DecisionInput {
  decision: Exclude<ReviewDecision, "proposed">;
}
