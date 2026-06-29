import type {
  LayerId,
  ResearchSource,
} from "../../shared/contracts.js";

export interface SourceParagraph {
  locator: string;
  text: string;
}

export interface NormalizedDocument {
  id: string;
  sourceType: ResearchSource["type"];
  title: string;
  publisher: string;
  sourceUrl: string | null;
  publishedAt: string;
  ingestedAt: string;
  content: string;
  paragraphs: SourceParagraph[];
}

export interface RssEntry {
  externalId: string;
  title: string;
  publisher: string;
  sourceUrl: string;
  publishedAt: string;
  content: string;
}

export type TrustedSourceRole = "primary" | "context";
export type SourceIntakeMode = "feed" | "public-url" | "manual-excerpt";
export type SourceFetchStrategy =
  | "rss"
  | "atom"
  | "on-demand-url"
  | "manual";
export type SourceAuthorityTier =
  | "first-party"
  | "specialist"
  | "context"
  | "unknown";

export interface SourceTopicRules {
  includeAny?: readonly string[];
  excludeAny?: readonly string[];
  maxAgeDays?: number;
}

export interface TrustedSourceDefinition {
  id: string;
  name: string;
  type: ResearchSource["type"];
  role: TrustedSourceRole;
  authorityTier: SourceAuthorityTier;
  layerIds: readonly LayerId[];
  companyTickers: readonly string[];
  intakeMode: SourceIntakeMode;
  fetchStrategy: SourceFetchStrategy;
  url: string | null;
  allowedDomains: readonly string[];
  enabledByDefault: boolean;
  priority: number;
  perRefreshQuota: number;
  topicRules?: SourceTopicRules;
}

export interface PublicSourceDefinition extends TrustedSourceDefinition {
  type: Extract<ResearchSource["type"], "rss" | "paper" | "release">;
  intakeMode: "feed";
  fetchStrategy: "rss" | "atom";
  url: string;
  enabledByDefault: true;
  perRefreshQuota: number;
}

export interface SourceEntryBatch {
  source: PublicSourceDefinition;
  entries: readonly RssEntry[];
}

export interface RefreshCandidate {
  source: PublicSourceDefinition;
  entry: RssEntry;
  score: number;
}
