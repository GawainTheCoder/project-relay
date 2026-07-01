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
export const thesisKinds = ["company", "macro"] as const;
export type ThesisKind = (typeof thesisKinds)[number];
export const thesisTypes = thesisKinds;
export type ThesisType = ThesisKind;
export const thesisStatuses = ["active", "archived"] as const;
export type ThesisStatus = (typeof thesisStatuses)[number];
export const thesisEvidenceStances = [
  "supports",
  "opposes",
  "context",
] as const;
export type ThesisEvidenceStance = (typeof thesisEvidenceStances)[number];
export const macroThesisRelevances = [
  "primary",
  "secondary",
  "context",
] as const;
export type MacroThesisRelevance =
  (typeof macroThesisRelevances)[number];
export const thesisEvaluationOutcomes = [
  "unchanged",
  "reinforced",
  "weakened",
  "contradicted",
  "revised",
] as const;
export type ThesisEvaluationOutcome =
  (typeof thesisEvaluationOutcomes)[number];
export const thesisEvaluationReviewStatuses = [
  "pending",
  "accepted",
  "rejected",
  "deferred",
] as const;
export type ThesisEvaluationReviewStatus =
  (typeof thesisEvaluationReviewStatuses)[number];
export type ThesisEvaluationReviewRecommendation = "accept" | "reject";
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

export interface ThesisVersion {
  id: string;
  thesisId: string;
  version: number;
  belief: string;
  confidenceScore: number;
  unknowns: string[];
  strengtheningConditions: string[];
  weakeningConditions: string[];
  createdAt: string;
  createdByEvaluationId: string | null;
}

export interface ThesisEvidence {
  thesisId: string;
  claimId: string;
  updateId: string;
  stance: ThesisEvidenceStance;
  rationale: string;
  linkedAt: string;
  linkedByEvaluationId: string | null;
  claim: EvidenceClaim;
}

export interface Thesis {
  id: string;
  kind: ThesisKind;
  title: string;
  status: ThesisStatus;
  currentVersion: ThesisVersion;
  versions: ThesisVersion[];
  companyTickers: string[];
  layerIds: LayerId[];
  evidence: ThesisEvidence[];
  evaluations: ThesisEvaluation[];
  createdAt: string;
  updatedAt: string;
}

export interface ThesisInput {
  id?: string;
  kind: ThesisKind;
  title: string;
  belief: string;
  confidenceScore: number;
  unknowns: string[];
  strengtheningConditions: string[];
  weakeningConditions: string[];
  companyTickers: string[];
  layerIds: LayerId[];
}

export interface ThesisEvaluationEvidenceInput {
  claimId: string;
  stance: ThesisEvidenceStance;
  rationale: string;
}

export interface ThesisEvaluationInput {
  id?: string;
  thesisId: string;
  outcome: ThesisEvaluationOutcome;
  summary: string;
  rationale: string;
  proposedBelief: string;
  proposedConfidenceScore: number;
  proposedUnknowns: string[];
  proposedStrengtheningConditions: string[];
  proposedWeakeningConditions: string[];
  signalIds: string[];
  evidence: ThesisEvaluationEvidenceInput[];
  reviewRecommendation?: ThesisEvaluationReviewRecommendation | null;
  reviewRecommendationReason?: string | null;
  model?: string | null;
}

export interface ThesisEvaluation {
  id: string;
  thesisId: string;
  previousVersionId: string;
  acceptedVersionId: string | null;
  outcome: ThesisEvaluationOutcome;
  summary: string;
  rationale: string;
  proposedBelief: string;
  previousConfidenceScore: number;
  proposedConfidenceScore: number;
  confidenceDelta: number;
  proposedUnknowns: string[];
  proposedStrengtheningConditions: string[];
  proposedWeakeningConditions: string[];
  signalIds: string[];
  claimIds: string[];
  evidence: ThesisEvaluationEvidenceInput[];
  reviewRecommendation: ThesisEvaluationReviewRecommendation | null;
  reviewRecommendationReason: string | null;
  reviewStatus: ThesisEvaluationReviewStatus;
  reviewNote: string | null;
  model: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

export interface ThesisEvaluationReviewInput {
  decision: Exclude<ThesisEvaluationReviewStatus, "pending">;
  note?: string | undefined;
}

export interface ThesisEvaluationRequeueResult {
  updateId: string;
  requestedAt: string;
  alreadyQueued: boolean;
  invalidatedEvaluationIds: string[];
  macroRouteCount: number;
  routesClassified: boolean;
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

export interface MacroThesisImpact {
  id: string;
  thesisId: string;
  relevance: MacroThesisRelevance;
  stance: ThesisEvidenceStance;
  rationale: string;
  claimIds: string[];
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
  | "thesis"
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
  macroThesisImpacts: MacroThesisImpact[];
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
  domain: string | null;
  role: "primary" | "context";
  authorityTier: "first-party" | "specialist" | "context" | "unknown";
  enabled: boolean;
  userAdded: boolean;
  layerIds: LayerId[];
  companyTickers: string[];
  thesisIds: string[];
  status: "ready" | "syncing" | "error";
  lastSyncedAt: string | null;
  documentCount: number;
}

export interface SourceRefreshItem {
  sourceId: string;
  sourceName: string;
  title: string;
  sourceUrl: string | null;
  isNew: boolean;
  status: "analyzed" | "duplicate" | "error";
  updateId: string | null;
  error: string | null;
}

export interface SourceRefreshResult {
  imported: number;
  analyzed: number;
  errors: string[];
  items: SourceRefreshItem[];
}

export type SourceCoverageStatus = "automated" | "manual-only" | "missing";

export interface SourceCoverageSource {
  id: string;
  name: string;
  authorityTier: "first-party" | "specialist" | "context" | "unknown";
  role: "primary" | "context";
  automated: boolean;
}

export interface ThesisSourceCoverage {
  thesisId: string;
  thesisTitle: string;
  layerIds: LayerId[];
  status: SourceCoverageStatus;
  sources: SourceCoverageSource[];
  strongSourceCount: number;
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
  thesisEvaluationIds?: string[];
  generatedAt: string;
  model: string | null;
}

export interface DashboardPayload {
  brief: DailyBrief | null;
  updates: IntelligenceUpdate[];
  layers: StackLayer[];
  companies: Company[];
  sources: ResearchSource[];
  sourceCoverage: ThesisSourceCoverage[];
  demoData: boolean;
}

export interface ImportSourceInput {
  title: string;
  publisher: string;
  sourceUrl?: string;
  sourceProfileId?: string;
  publishedAt?: string;
  content?: string;
  sourceKind?: SourceKind;
}

export interface CompanyInput {
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
}

export interface ResearchSourceInput {
  name: string;
  type: Extract<ResearchSource["type"], "rss" | "paper" | "release">;
  url: string;
  enabled?: boolean;
  layerIds?: LayerId[];
  companyTickers?: string[];
}

export interface SourceProfileInput {
  name: string;
  domain: string;
  publicUrl: string;
  role: Extract<ResearchSource["role"], "primary" | "context">;
  authorityTier: Extract<
    ResearchSource["authorityTier"],
    "first-party" | "specialist" | "context"
  >;
  layerIds?: LayerId[];
  companyTickers?: string[];
  thesisIds?: string[];
}
