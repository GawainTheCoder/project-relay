import type {
  DailyBrief,
  ImportSourceInput,
  IntelligenceUpdate,
} from "../shared/contracts.js";

import type { AppServices } from "./app.js";
import type { RelayRepository } from "./db/repository.js";
import {
  analyzeDocument,
  analyzeImportedSource as analyzePastedSource,
  analyzeUrlSource,
  synthesizeDailyBrief,
} from "./intelligence/index.js";
import {
  deduplicateRssEntries,
  fetchRssSource,
  normalizeRssEntry,
  PUBLIC_SOURCE_REGISTRY,
} from "./ingestion/index.js";

const DEFAULT_REFRESH_MAX_ITEMS = 4;
const MAX_REFRESH_ITEMS = 12;

export function createAppServices(repository: RelayRepository): AppServices {
  return {
    analyzeImportedSource: (input) => analyzeImportedSource(input),
    refreshSources: () => refreshPublicSources(repository),
    generateBrief: () => generateDailyBrief(repository),
  };
}

export async function analyzeImportedSource(
  input: ImportSourceInput,
): Promise<IntelligenceUpdate> {
  if (input.content?.trim()) {
    return analyzePastedSource(input);
  }
  if (!input.sourceUrl) {
    throw new Error("Provide pasted source content or a public source URL.");
  }
  return analyzeUrlSource({
    url: input.sourceUrl,
    title: input.title,
    publisher: input.publisher,
    ...(input.publishedAt ? { publishedAt: input.publishedAt } : {}),
  });
}

export async function refreshPublicSources(
  repository: RelayRepository,
): Promise<{ imported: number; analyzed: number; errors: string[] }> {
  const maxItems = refreshLimit();
  let imported = 0;
  let analyzed = 0;
  let processed = 0;
  const errors: string[] = [];

  for (const source of PUBLIC_SOURCE_REGISTRY.filter(
    (item) => item.enabledByDefault,
  )) {
    if (processed >= maxItems) {
      break;
    }

    repository.recordSourceSync(source.id, "syncing");
    try {
      const entries = deduplicateRssEntries(
        await fetchRssSource(source),
      ).toSorted(
        (left, right) =>
          Date.parse(right.publishedAt) - Date.parse(left.publishedAt),
      );

      for (const entry of entries) {
        if (processed >= maxItems) {
          break;
        }

        const input = {
          title: entry.title,
          publisher: entry.publisher,
          sourceUrl: entry.sourceUrl,
          publishedAt: entry.publishedAt,
          content: entry.content,
          researchSourceId: source.id,
        };
        const document = repository.persistSourceDocument(input);
        if (document.duplicate && document.status === "analyzed") {
          continue;
        }

        processed += 1;
        imported += document.duplicate ? 0 : 1;
        try {
          const normalized = normalizeRssEntry(entry, {
            sourceType: source.type,
          });
          const update = await analyzeDocument(normalized);
          const persisted = repository.persistAnalyzedUpdate(update);
          repository.markSourceDocumentAnalyzed(document.id, persisted.id);
          analyzed += 1;
        } catch (error) {
          repository.markSourceDocumentError(document.id, safeMessage(error));
          errors.push(`${source.name}: ${safeMessage(error)}`);
        }
      }

      repository.recordSourceSync(source.id, "ready");
    } catch (error) {
      repository.recordSourceSync(source.id, "error");
      errors.push(`${source.name}: ${safeMessage(error)}`);
    }
  }

  return { imported, analyzed, errors };
}

export async function generateDailyBrief(
  repository: RelayRepository,
): Promise<DailyBrief> {
  const updates = repository.listUpdates(30);
  if (!updates.length) {
    throw new Error(
      "Import and analyze at least one source before generating a brief.",
    );
  }
  return synthesizeDailyBrief(updates);
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
