import type {
  LayerId,
  ResearchSource,
} from "../../shared/contracts.js";

import type {
  PublicSourceDefinition,
  RefreshCandidate,
  RssEntry,
  SourceEntryBatch,
  TrustedSourceDefinition,
} from "./types.js";

const AI_INFRASTRUCTURE_TOPICS = [
  "accelerator",
  "ai cluster",
  "ai factory",
  "artificial intelligence",
  "co-packaged optics",
  "data center",
  "datacenter",
  "distributed inference",
  "distributed system",
  "gpu",
  "hbm",
  "inference",
  "interconnect",
  "machine learning system",
  "memory bandwidth",
  "ml system",
  "network fabric",
  "optical",
  "power",
  "rack scale",
  "serving",
  "training cluster",
] as const;

const LOW_SIGNAL_TOPICS = [
  "price target",
  "stock to buy",
  "stock to watch",
  "wall street says",
] as const;

const BROAD_INFRASTRUCTURE_LAYERS = [
  "cloud",
  "accelerators",
  "memory",
  "networking",
  "optics",
  "power-cooling",
  "serving",
  "manufacturing",
  "materials-builders",
] as const satisfies readonly LayerId[];

const WATCHLIST_TICKERS = [
  "NVDA",
  "AMD",
  "AVGO",
  "MRVL",
  "ANET",
  "COHR",
  "LITE",
  "GLW",
  "MU",
  "VRT",
  "ETN",
  "GEV",
  "TSM",
] as const;

export const TRUSTED_SOURCE_REGISTRY = [
  feedSource({
    id: "the-next-platform",
    name: "The Next Platform",
    type: "rss",
    url: "https://www.nextplatform.com/feed/",
    fetchStrategy: "rss",
    authorityTier: "specialist",
    layerIds: BROAD_INFRASTRUCTURE_LAYERS,
    companyTickers: WATCHLIST_TICKERS,
    priority: 100,
    perRefreshQuota: 2,
    topicRules: {
      includeAny: AI_INFRASTRUCTURE_TOPICS,
      excludeAny: LOW_SIGNAL_TOPICS,
      maxAgeDays: 21,
    },
  }),
  feedSource({
    id: "vllm-releases",
    name: "vLLM releases",
    type: "release",
    url: "https://github.com/vllm-project/vllm/releases.atom",
    fetchStrategy: "atom",
    authorityTier: "first-party",
    layerIds: ["serving", "accelerators"],
    companyTickers: [],
    priority: 98,
    perRefreshQuota: 1,
    topicRules: { maxAgeDays: 45 },
  }),
  feedSource({
    id: "sglang-releases",
    name: "SGLang releases",
    type: "release",
    url: "https://github.com/sgl-project/sglang/releases.atom",
    fetchStrategy: "atom",
    authorityTier: "first-party",
    layerIds: ["serving", "accelerators"],
    companyTickers: [],
    priority: 97,
    perRefreshQuota: 1,
    topicRules: { maxAgeDays: 45 },
  }),
  feedSource({
    id: "tensorrt-llm-releases",
    name: "TensorRT-LLM releases",
    type: "release",
    url: "https://github.com/NVIDIA/TensorRT-LLM/releases.atom",
    fetchStrategy: "atom",
    authorityTier: "first-party",
    layerIds: ["serving", "accelerators"],
    companyTickers: ["NVDA"],
    priority: 97,
    perRefreshQuota: 1,
    topicRules: { maxAgeDays: 45 },
  }),
  feedSource({
    id: "nvidia-dynamo-releases",
    name: "NVIDIA Dynamo releases",
    type: "release",
    url: "https://github.com/ai-dynamo/dynamo/releases.atom",
    fetchStrategy: "atom",
    authorityTier: "first-party",
    layerIds: ["serving", "accelerators", "networking"],
    companyTickers: ["NVDA"],
    priority: 97,
    perRefreshQuota: 1,
    topicRules: { maxAgeDays: 45 },
  }),
  feedSource({
    id: "arxiv-distributed-systems",
    name: "arXiv — AI infrastructure systems",
    type: "paper",
    url: "https://rss.arxiv.org/rss/cs.DC",
    fetchStrategy: "rss",
    authorityTier: "specialist",
    layerIds: ["serving", "memory", "networking", "cloud"],
    companyTickers: [],
    priority: 72,
    perRefreshQuota: 1,
    topicRules: {
      includeAny: AI_INFRASTRUCTURE_TOPICS,
      excludeAny: LOW_SIGNAL_TOPICS,
      maxAgeDays: 14,
    },
  }),

  publicUrlSource({
    id: "semianalysis-public",
    name: "SemiAnalysis public posts",
    url: "https://semianalysis.com/",
    allowedDomains: ["semianalysis.com"],
    priority: 100,
    layerIds: BROAD_INFRASTRUCTURE_LAYERS,
    companyTickers: WATCHLIST_TICKERS,
  }),
  manualSource({
    id: "semianalysis-manual",
    name: "SemiAnalysis manual excerpts",
    allowedDomains: ["semianalysis.com"],
    role: "primary",
    priority: 100,
    authorityTier: "specialist",
    layerIds: BROAD_INFRASTRUCTURE_LAYERS,
    companyTickers: WATCHLIST_TICKERS,
  }),

  officialCompanySource("nvidia-ir", "NVIDIA official newsroom and investor relations", "https://investor.nvidia.com/", ["investor.nvidia.com", "nvidianews.nvidia.com"], 98, "NVDA", ["accelerators", "networking", "serving"]),
  officialCompanySource("amd-ir", "AMD official newsroom and investor relations", "https://ir.amd.com/news-events/press-releases", ["amd.com", "ir.amd.com"], 96, "AMD", ["accelerators", "serving"]),
  officialCompanySource("broadcom-ir", "Broadcom official newsroom and investor relations", "https://investors.broadcom.com/", ["broadcom.com", "investors.broadcom.com"], 96, "AVGO", ["accelerators", "networking", "optics"]),
  officialCompanySource("marvell-ir", "Marvell official newsroom and investor relations", "https://investor.marvell.com/news-events/press-releases", ["marvell.com", "investor.marvell.com"], 95, "MRVL", ["accelerators", "networking", "optics"]),
  officialCompanySource("arista-ir", "Arista Networks official newsroom and investor relations", "https://investors.arista.com/", ["arista.com", "investors.arista.com"], 95, "ANET", ["networking"]),
  officialCompanySource("coherent-ir", "Coherent official newsroom and investor relations", "https://investor.coherent.com/news-events/news-releases", ["coherent.com", "investor.coherent.com"], 94, "COHR", ["optics"]),
  officialCompanySource("lumentum-ir", "Lumentum official newsroom and investor relations", "https://investor.lumentum.com/news-releases", ["lumentum.com", "investor.lumentum.com"], 94, "LITE", ["optics"]),
  officialCompanySource("corning-ir", "Corning official newsroom and investor relations", "https://investor.corning.com/news-and-events/news-releases/", ["corning.com", "investor.corning.com"], 94, "GLW", ["optics", "materials-builders"]),
  officialCompanySource("micron-ir", "Micron official newsroom and investor relations", "https://investors.micron.com/", ["micron.com", "investors.micron.com"], 96, "MU", ["memory", "manufacturing"]),
  officialCompanySource("vertiv-ir", "Vertiv official newsroom and investor relations", "https://investors.vertiv.com/", ["vertiv.com", "investors.vertiv.com"], 95, "VRT", ["power-cooling"]),
  officialCompanySource("eaton-newsroom", "Eaton official newsroom", "https://www.eaton.com/us/en-us/company/news-insights/news-releases.html", ["eaton.com"], 94, "ETN", ["power-cooling"]),
  officialCompanySource("ge-vernova-newsroom", "GE Vernova official newsroom", "https://www.gevernova.com/news/press-releases", ["gevernova.com"], 94, "GEV", ["power-cooling", "materials-builders"]),
  officialCompanySource("tsmc-ir", "TSMC official newsroom and investor relations", "https://investor.tsmc.com/", ["tsmc.com", "investor.tsmc.com"], 97, "TSM", ["manufacturing"]),

  publicUrlSource({
    id: "lightcounting",
    name: "LightCounting",
    url: "https://www.lightcounting.com/",
    allowedDomains: ["lightcounting.com"],
    priority: 94,
    layerIds: ["optics"],
    companyTickers: ["COHR", "LITE", "GLW"],
  }),
  publicUrlSource({
    id: "trendforce-memory",
    name: "TrendForce / DRAMeXchange",
    url: "https://www.trendforce.com/",
    allowedDomains: ["trendforce.com", "dramexchange.com"],
    priority: 94,
    layerIds: ["memory"],
    companyTickers: ["MU"],
  }),
  publicUrlSource({
    id: "delloro",
    name: "Dell'Oro Group",
    url: "https://www.delloro.com/",
    allowedDomains: ["delloro.com"],
    priority: 93,
    layerIds: ["networking", "optics"],
    companyTickers: ["NVDA", "AVGO", "MRVL", "ANET", "COHR", "LITE", "GLW"],
  }),
  publicUrlSource({
    id: "data-center-dynamics",
    name: "Data Center Dynamics",
    url: "https://www.datacenterdynamics.com/",
    allowedDomains: ["datacenterdynamics.com"],
    priority: 91,
    layerIds: ["power-cooling", "cloud", "materials-builders"],
    companyTickers: ["VRT", "ETN", "GEV"],
  }),
  publicUrlSource({
    id: "utility-dive",
    name: "Utility Dive",
    url: "https://www.utilitydive.com/",
    allowedDomains: ["utilitydive.com"],
    priority: 90,
    layerIds: ["power-cooling", "materials-builders"],
    companyTickers: ["VRT", "ETN", "GEV"],
  }),

  manualSource({
    id: "the-information-manual",
    name: "The Information manual excerpts",
    allowedDomains: ["theinformation.com"],
    role: "context",
    priority: 88,
    authorityTier: "context",
    layerIds: BROAD_INFRASTRUCTURE_LAYERS,
    companyTickers: WATCHLIST_TICKERS,
  }),
  manualSource({
    id: "stratechery-manual",
    name: "Stratechery manual excerpts",
    allowedDomains: ["stratechery.com"],
    role: "context",
    priority: 88,
    authorityTier: "context",
    layerIds: BROAD_INFRASTRUCTURE_LAYERS,
    companyTickers: WATCHLIST_TICKERS,
  }),
  manualSource({
    id: "latent-space-manual",
    name: "Latent Space manual excerpts",
    allowedDomains: ["latent.space"],
    role: "context",
    priority: 86,
    authorityTier: "context",
    layerIds: ["serving", "accelerators", "cloud"],
    companyTickers: [],
  }),
  manualSource({
    id: "dylan-patel-interviews-manual",
    name: "Dylan Patel interviews manual excerpts",
    allowedDomains: [],
    role: "context",
    priority: 88,
    authorityTier: "context",
    layerIds: BROAD_INFRASTRUCTURE_LAYERS,
    companyTickers: WATCHLIST_TICKERS,
  }),
  manualSource({
    id: "fabricated-knowledge-manual",
    name: "Fabricated Knowledge manual excerpts",
    allowedDomains: ["fabricatedknowledge.com"],
    role: "context",
    priority: 86,
    authorityTier: "context",
    layerIds: BROAD_INFRASTRUCTURE_LAYERS,
    companyTickers: WATCHLIST_TICKERS,
  }),
  manualSource({
    id: "chips-and-cheese-manual",
    name: "Chips and Cheese manual excerpts",
    allowedDomains: ["chipsandcheese.com"],
    role: "context",
    priority: 84,
    authorityTier: "context",
    layerIds: ["accelerators", "memory", "networking", "serving"],
    companyTickers: ["NVDA", "AMD", "AVGO", "MRVL", "MU"],
  }),
  manualSource({
    id: "serve-the-home-manual",
    name: "ServeTheHome manual excerpts",
    allowedDomains: ["servethehome.com"],
    role: "context",
    priority: 84,
    authorityTier: "context",
    layerIds: ["accelerators", "memory", "networking", "serving"],
    companyTickers: ["NVDA", "AMD", "AVGO", "MRVL", "ANET", "MU"],
  }),
  manualSource({
    id: "manual-imports",
    name: "Other manual excerpts",
    allowedDomains: [],
    role: "context",
    priority: 50,
    authorityTier: "unknown",
    layerIds: BROAD_INFRASTRUCTURE_LAYERS,
    companyTickers: WATCHLIST_TICKERS,
  }),
] as const satisfies readonly TrustedSourceDefinition[];

export const PUBLIC_SOURCE_REGISTRY: readonly PublicSourceDefinition[] =
  TRUSTED_SOURCE_REGISTRY.filter(isAutomatedSource);

export const ACTIVE_AUTOMATED_SOURCES: readonly PublicSourceDefinition[] =
  PUBLIC_SOURCE_REGISTRY.filter((source) => source.enabledByDefault);

export const SOURCE_CATALOG_ROWS: readonly ResearchSource[] =
  TRUSTED_SOURCE_REGISTRY.map((source) => ({
    id: source.id,
    name: source.name,
    type: source.type,
    url: source.url,
    enabled: source.enabledByDefault,
    userAdded: false,
    layerIds: [...source.layerIds],
    companyTickers: [...source.companyTickers],
    status: "ready",
    lastSyncedAt: null,
    documentCount: 0,
  }));

export function findSourceById(
  sourceId: string,
): TrustedSourceDefinition | undefined {
  return TRUSTED_SOURCE_REGISTRY.find((source) => source.id === sourceId);
}

export function findSourcesForUrl(
  sourceUrl: string,
): TrustedSourceDefinition[] {
  let hostname: string;
  try {
    hostname = new URL(sourceUrl).hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return [];
  }
  return TRUSTED_SOURCE_REGISTRY.filter((source) =>
    source.allowedDomains.some((domain) =>
      hostname === domain || hostname.endsWith(`.${domain}`),
    ),
  ).toSorted((left, right) =>
    right.priority - left.priority ||
    intakeRank(right.intakeMode) - intakeRank(left.intakeMode) ||
    left.name.localeCompare(right.name),
  );
}

export function findSourceForUrl(
  sourceUrl: string,
): TrustedSourceDefinition | undefined {
  return findSourcesForUrl(sourceUrl)[0];
}

export function selectRefreshCandidates(
  batches: readonly SourceEntryBatch[],
  options: { limit: number; now?: Date },
): RefreshCandidate[] {
  if (!Number.isSafeInteger(options.limit) || options.limit < 1) {
    return [];
  }

  const now = options.now ?? new Date();
  const queues = batches
    .filter((batch) => batch.source.enabledByDefault)
    .map((batch) => ({
      source: batch.source,
      candidates: prepareSourceCandidates(batch, now),
    }))
    .filter((queue) => queue.candidates.length > 0);
  const selected: RefreshCandidate[] = [];
  const seenUrls = new Set<string>();
  let round = 0;

  while (selected.length < options.limit) {
    const roundCandidates = queues
      .map((queue) => queue.candidates[round])
      .filter((candidate): candidate is RefreshCandidate =>
        candidate !== undefined,
      )
      .toSorted(compareCandidates);
    if (roundCandidates.length === 0) {
      break;
    }

    for (const candidate of roundCandidates) {
      const canonicalUrl = canonicalCandidateUrl(candidate.entry.sourceUrl);
      if (seenUrls.has(canonicalUrl)) {
        continue;
      }
      seenUrls.add(canonicalUrl);
      selected.push(candidate);
      if (selected.length >= options.limit) {
        break;
      }
    }
    round += 1;
  }

  return selected;
}

export function sourceEntryMatchesRules(
  source: TrustedSourceDefinition,
  entry: RssEntry,
  now: Date,
): boolean {
  const rules = source.topicRules;
  if (!rules) {
    return true;
  }

  const publishedAt = Date.parse(entry.publishedAt);
  if (
    rules.maxAgeDays !== undefined &&
    Number.isFinite(publishedAt) &&
    publishedAt < now.getTime() - rules.maxAgeDays * 86_400_000
  ) {
    return false;
  }

  const searchable = `${entry.title}\n${entry.content}`.toLowerCase();
  if (rules.excludeAny?.some((term) => searchable.includes(term.toLowerCase()))) {
    return false;
  }
  return !rules.includeAny ||
    rules.includeAny.some((term) => searchable.includes(term.toLowerCase()));
}

function prepareSourceCandidates(
  batch: SourceEntryBatch,
  now: Date,
): RefreshCandidate[] {
  return batch.entries
    .filter((entry) => sourceEntryMatchesRules(batch.source, entry, now))
    .map((entry) => ({
      source: batch.source,
      entry,
      score: candidateScore(batch.source, entry, now),
    }))
    .toSorted(compareCandidates)
    .slice(0, batch.source.perRefreshQuota);
}

function candidateScore(
  source: PublicSourceDefinition,
  entry: RssEntry,
  now: Date,
): number {
  const publishedAt = Date.parse(entry.publishedAt);
  const ageHours = Number.isFinite(publishedAt)
    ? Math.max(0, (now.getTime() - publishedAt) / 3_600_000)
    : 24 * 365;
  const recency = Math.max(0, 30 - Math.min(ageHours / 24, 30));
  const searchable = `${entry.title}\n${entry.content}`.toLowerCase();
  const topicMatches =
    source.topicRules?.includeAny?.filter((term) =>
      searchable.includes(term.toLowerCase()),
    ).length ?? 0;
  return source.priority * 100 + topicMatches * 10 + recency;
}

function compareCandidates(
  left: RefreshCandidate,
  right: RefreshCandidate,
): number {
  return right.score - left.score ||
    right.entry.publishedAt.localeCompare(left.entry.publishedAt) ||
    left.entry.sourceUrl.localeCompare(right.entry.sourceUrl);
}

function canonicalCandidateUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (key.toLowerCase().startsWith("utm_")) {
        url.searchParams.delete(key);
      }
    }
    url.searchParams.sort();
    return url.toString();
  } catch {
    return value;
  }
}

function isAutomatedSource(
  source: TrustedSourceDefinition,
): source is PublicSourceDefinition {
  return source.intakeMode === "feed" &&
    source.enabledByDefault &&
    source.url !== null &&
    (source.fetchStrategy === "rss" || source.fetchStrategy === "atom") &&
    (source.type === "rss" ||
      source.type === "paper" ||
      source.type === "release");
}

function feedSource(
  input: Omit<
    PublicSourceDefinition,
    "allowedDomains" | "enabledByDefault" | "intakeMode" | "role"
  >,
): PublicSourceDefinition {
  return {
    ...input,
    role: "primary",
    intakeMode: "feed",
    allowedDomains: [new URL(input.url).hostname],
    enabledByDefault: true,
  };
}

function publicUrlSource(
  input: {
    id: string;
    name: string;
    url: string;
    allowedDomains: readonly string[];
    priority: number;
    layerIds: readonly LayerId[];
    companyTickers: readonly string[];
  },
): TrustedSourceDefinition {
  return {
    ...input,
    type: "manual",
    role: "primary",
    authorityTier: "specialist",
    intakeMode: "public-url",
    fetchStrategy: "on-demand-url",
    enabledByDefault: false,
    perRefreshQuota: 0,
    topicRules: {
      includeAny: AI_INFRASTRUCTURE_TOPICS,
      excludeAny: LOW_SIGNAL_TOPICS,
    },
  };
}

function officialCompanySource(
  id: string,
  name: string,
  url: string,
  allowedDomains: readonly string[],
  priority: number,
  companyTicker: string,
  layerIds: readonly LayerId[],
): TrustedSourceDefinition {
  return {
    id,
    name,
    type: "investor-relations",
    role: "primary",
    authorityTier: "first-party",
    layerIds,
    companyTickers: [companyTicker],
    intakeMode: "public-url",
    fetchStrategy: "on-demand-url",
    url,
    allowedDomains,
    enabledByDefault: false,
    priority,
    perRefreshQuota: 0,
    topicRules: {
      includeAny: AI_INFRASTRUCTURE_TOPICS,
      excludeAny: LOW_SIGNAL_TOPICS,
    },
  };
}

function manualSource(
  input: {
    id: string;
    name: string;
    allowedDomains: readonly string[];
    role: TrustedSourceDefinition["role"];
    priority: number;
    authorityTier: TrustedSourceDefinition["authorityTier"];
    layerIds: readonly LayerId[];
    companyTickers: readonly string[];
  },
): TrustedSourceDefinition {
  return {
    ...input,
    type: "manual",
    intakeMode: "manual-excerpt",
    fetchStrategy: "manual",
    url: null,
    enabledByDefault: false,
    perRefreshQuota: 0,
    topicRules: {
      includeAny: AI_INFRASTRUCTURE_TOPICS,
      excludeAny: LOW_SIGNAL_TOPICS,
    },
  };
}

function intakeRank(mode: TrustedSourceDefinition["intakeMode"]): number {
  switch (mode) {
    case "feed":
      return 3;
    case "public-url":
      return 2;
    case "manual-excerpt":
      return 1;
  }
}
