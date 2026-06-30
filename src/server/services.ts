import type {
  DailyBrief,
  ImportSourceInput,
  IntelligenceUpdate,
  ResearchSource,
  SourceRefreshItem,
  SourceRefreshResult,
} from "../shared/contracts.js";

import type { AppServices } from "./app.js";
import type { RelayRepository } from "./db/repository.js";
import {
  analyzeDocument,
  analyzeImportedSource as analyzePastedSource,
  analyzeUrlSource,
  selectBriefEligibleUpdates,
  type AnalysisContext,
  type AnalysisSourceProfile,
  synthesizeDailyBrief,
} from "./intelligence/index.js";
import {
  ACTIVE_AUTOMATED_SOURCES,
  deduplicateRssEntries,
  fetchRssSource,
  findSourceById,
  findSourceForUrl,
  normalizeRssEntry,
  selectRefreshCandidates,
  type PublicSourceDefinition,
  type SourceEntryBatch,
  type TrustedSourceDefinition,
} from "./ingestion/index.js";

const DEFAULT_REFRESH_MAX_ITEMS = 6;
const MAX_REFRESH_ITEMS = 12;

export function createAppServices(repository: RelayRepository): AppServices {
  return {
    analyzeImportedSource: (input) =>
      analyzeImportedSource(repository, input),
    refreshSources: () => refreshPublicSources(repository),
    generateBrief: () => generateDailyBrief(repository),
  };
}

export async function analyzeImportedSource(
  repository: RelayRepository,
  input: ImportSourceInput,
): Promise<IntelligenceUpdate> {
  const source =
    (input.sourceUrl ? findSourceForUrl(input.sourceUrl) : undefined) ??
    findSourceById("manual-imports");
  const context = buildAnalysisContext(repository, source);
  if (input.content?.trim()) {
    return analyzePastedSource(input, { analysis: { context } });
  }
  if (!input.sourceUrl) {
    throw new Error("Provide pasted source content or a public source URL.");
  }
  return analyzeUrlSource(
    {
      url: input.sourceUrl,
      title: input.title,
      publisher: input.publisher,
      ...(input.publishedAt ? { publishedAt: input.publishedAt } : {}),
    },
    { analysis: { context } },
  );
}

export async function refreshPublicSources(
  repository: RelayRepository,
): Promise<SourceRefreshResult> {
  let imported = 0;
  let analyzed = 0;
  let processed = 0;
  const errors: string[] = [];
  const items: SourceRefreshItem[] = [];
  const configuredSources = repository
    .listSources()
    .filter((source) => source.enabled);
  const activeSources = configuredSources
    .map((source) => configuredAutomatedSource(source))
    .filter((source): source is PublicSourceDefinition => source !== null);
  const maxItems = Math.max(refreshLimit(), activeSources.length);
  const outcomes = await Promise.all(
    activeSources.map(async (source) => {
      repository.recordSourceSync(source.id, "syncing");
      try {
        const entries = deduplicateRssEntries(
          await fetchRssSource(source),
        ).toSorted(
          (left, right) =>
            Date.parse(right.publishedAt) - Date.parse(left.publishedAt),
        );
        repository.recordSourceSync(source.id, "ready");
        return { batch: { source, entries } satisfies SourceEntryBatch };
      } catch (error) {
        repository.recordSourceSync(source.id, "error");
        const message = safeMessage(error);
        return {
          error: `${source.name}: ${message}`,
          item: {
            sourceId: source.id,
            sourceName: source.name,
            title: `${source.name} feed`,
            sourceUrl: source.url,
            isNew: false,
            status: "error",
            updateId: null,
            error: message,
          } satisfies SourceRefreshItem,
        };
      }
    }),
  );
  const batches: SourceEntryBatch[] = [];
  outcomes.forEach((outcome) => {
    if ("batch" in outcome) {
      batches.push(outcome.batch);
    } else {
      errors.push(outcome.error);
      items.push(outcome.item);
    }
  });

  const schedule = selectRefreshCandidates(batches, {
    limit: activeSources.reduce(
      (total, source) => total + source.perRefreshQuota,
      0,
    ),
  });
  for (const { entry, source } of schedule) {
    if (processed >= maxItems) {
      break;
    }
    const document = repository.persistSourceDocument({
      title: entry.title,
      publisher: entry.publisher,
      sourceUrl: entry.sourceUrl,
      publishedAt: entry.publishedAt,
      content: entry.content,
      researchSourceId: source.id,
    });
    if (document.duplicate && document.status === "analyzed") {
      items.push({
        sourceId: source.id,
        sourceName: source.name,
        title: entry.title,
        sourceUrl: entry.sourceUrl,
        isNew: false,
        status: "duplicate",
        updateId: document.updateId,
        error: null,
      });
      continue;
    }

    processed += 1;
    imported += document.duplicate ? 0 : 1;
    try {
      const normalized = normalizeRssEntry(entry, {
        sourceType: source.type,
      });
      const update = await analyzeDocument(normalized, {
        context: buildAnalysisContext(repository, source),
      });
      const persisted = repository.persistAnalyzedUpdate(update);
      repository.markSourceDocumentAnalyzed(document.id, persisted.id);
      analyzed += 1;
      items.push({
        sourceId: source.id,
        sourceName: source.name,
        title: entry.title,
        sourceUrl: entry.sourceUrl,
        isNew: !document.duplicate,
        status: "analyzed",
        updateId: persisted.id,
        error: null,
      });
    } catch (error) {
      const message = safeMessage(error);
      repository.markSourceDocumentError(document.id, message);
      errors.push(`${source.name}: ${message}`);
      items.push({
        sourceId: source.id,
        sourceName: source.name,
        title: entry.title,
        sourceUrl: entry.sourceUrl,
        isNew: !document.duplicate,
        status: "error",
        updateId: null,
        error: message,
      });
    }
  }
  return { imported, analyzed, errors, items };
}

export async function generateDailyBrief(
  repository: RelayRepository,
): Promise<DailyBrief> {
  const latestBrief = repository.getDashboard().brief;
  const newUpdates = latestBrief
    ? repository.listUpdatesIngestedAfter(latestBrief.generatedAt)
    : repository.listAllUpdates();
  const today = new Date().toISOString().slice(0, 10);
  if (
    latestBrief?.date === today &&
    selectBriefEligibleUpdates(newUpdates).length === 0
  ) {
    return latestBrief;
  }
  const previousBriefUpdates =
    latestBrief?.date === today
      ? latestBrief.updateIds
          .map((updateId) => repository.getUpdate(updateId))
          .filter((update): update is IntelligenceUpdate => update !== null)
      : [];
  const updates = [
    ...new Map(
      [...previousBriefUpdates, ...newUpdates].map((update) => [
        update.id,
        update,
      ]),
    ).values(),
  ];
  const sourceProfilesByUpdateId: Record<
    string,
    Pick<
      AnalysisSourceProfile,
      "id" | "name" | "role" | "authorityTier" | "priority"
    >
  > = {};
  updates.forEach((update) => {
    const sourceId = repository.getResearchSourceIdForUpdate(update.id);
    const source = sourceId
      ? findSourceById(sourceId) ??
        configuredAutomatedSource(repository.getSource(sourceId))
      : undefined;
    if (source) {
      sourceProfilesByUpdateId[update.id] = {
        id: source.id,
        name: source.name,
        role: source.role,
        authorityTier: source.authorityTier,
        priority: source.priority,
      };
    }
  });
  return synthesizeDailyBrief(updates, {
    sourceProfilesByUpdateId,
  });
}

function configuredAutomatedSource(
  source: ResearchSource | null,
): PublicSourceDefinition | null {
  if (!source?.url || !["rss", "paper", "release"].includes(source.type)) {
    return null;
  }
  const builtIn = ACTIVE_AUTOMATED_SOURCES.find(
    (definition) => definition.id === source.id,
  );
  if (builtIn) {
    return builtIn;
  }
  if (!source.userAdded) {
    return null;
  }
  return {
    id: source.id,
    name: source.name,
    type: source.type as PublicSourceDefinition["type"],
    role: "primary",
    authorityTier: "unknown",
    layerIds: source.layerIds,
    companyTickers: source.companyTickers,
    intakeMode: "feed",
    fetchStrategy: source.type === "release" ? "atom" : "rss",
    url: source.url,
    allowedDomains: [new URL(source.url).hostname],
    enabledByDefault: true,
    priority: 75,
    perRefreshQuota: 1,
    topicRules: {
      maxAgeDays: source.type === "paper" ? 21 : 45,
    },
  };
}

function buildAnalysisContext(
  repository: RelayRepository,
  source: TrustedSourceDefinition | undefined,
): AnalysisContext {
  return {
    watchlistCompanies: repository.listCompanies().map((company) => ({
      ticker: company.ticker,
      thesis: company.thesis,
      provesRight: company.provesRight,
      breaksThesis: company.breaksThesis,
      watchMetrics: company.watchMetrics,
    })),
    recentSignals: repository.listUpdates(20).map((update) => ({
      id: update.id,
      title: update.title,
      publishedAt: update.publishedAt,
      companyTickers: update.companyTickers,
      materiality: update.materiality,
      whatHappened: update.whatHappened,
      thesisImpacts: update.thesisImpacts.map((impact) => ({
        companyTicker: impact.companyTicker,
        direction: impact.direction,
        thesisDelta: impact.thesisDelta,
      })),
    })),
    sourceProfile: source
      ? {
          id: source.id,
          name: source.name,
          role: source.role,
          authorityTier: source.authorityTier,
          priority: source.priority,
          layerIds: source.layerIds,
          companyTickers: source.companyTickers,
        }
      : null,
  };
}

export function resolveResearchSourceId(input: ImportSourceInput): string {
  if (input.sourceUrl) {
    const source = findSourceForUrl(input.sourceUrl);
    if (source) {
      return source.id;
    }
  }
  return "manual-imports";
}

function refreshLimit(): number {
  const parsed = Number.parseInt(
    process.env.RELAY_REFRESH_MAX_ITEMS ?? `${DEFAULT_REFRESH_MAX_ITEMS}`,
    10,
  );
  if (!Number.isSafeInteger(parsed)) {
    return DEFAULT_REFRESH_MAX_ITEMS;
  }
  return Math.max(1, Math.min(parsed, MAX_REFRESH_ITEMS));
}

function safeMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return "Unknown source processing error.";
  }
  return error.message.slice(0, 240);
}
