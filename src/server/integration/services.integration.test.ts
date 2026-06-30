import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  DailyBrief,
  ImportSourceInput,
  IntelligenceUpdate,
} from "../../shared/contracts.js";
import type {
  NormalizedDocument,
  RssEntry,
} from "../ingestion/types.js";
import {
  createRelayRepository,
  type RelayRepository,
} from "../db/repository.js";

const intelligenceMocks = vi.hoisted(() => ({
  analyzeDocument: vi.fn(),
  analyzeImportedSource: vi.fn(),
  analyzeUrlSource: vi.fn(),
  selectBriefEligibleUpdates: vi.fn((updates: IntelligenceUpdate[]) =>
    updates.filter(
      (update) =>
        update.materiality !== "not-material" &&
        update.novelty !== "repetition" &&
        update.thesisImpacts.some(
          (impact) =>
            impact.direction !== "not-material" &&
            impact.decision !== "rejected" &&
            impact.review?.decision !== "rejected" &&
            impact.thesisDelta.trim().length > 0,
        ),
    ),
  ),
  synthesizeDailyBrief: vi.fn(),
}));

const ingestionMocks = vi.hoisted(() => ({
  ACTIVE_AUTOMATED_SOURCES: [
    {
      id: "arxiv-distributed-systems",
      name: "Mock arXiv",
      type: "paper",
      role: "primary",
      authorityTier: "specialist",
      layerIds: ["serving"],
      companyTickers: [],
      intakeMode: "feed",
      fetchStrategy: "rss",
      url: "https://example.com/feed.xml",
      allowedDomains: ["example.com"],
      enabledByDefault: true,
      priority: 72,
      perRefreshQuota: 1,
    },
  ],
  deduplicateRssEntries: vi.fn(),
  fetchRssSource: vi.fn(),
  findSourceById: vi.fn(),
  findSourceForUrl: vi.fn(),
  normalizeRssEntry: vi.fn(),
  selectRefreshCandidates: vi.fn(),
}));

vi.mock("../intelligence/index.js", () => intelligenceMocks);
vi.mock("../ingestion/index.js", () => ingestionMocks);

import {
  analyzeImportedSource,
  createAppServices,
  generateDailyBrief,
  refreshPublicSources,
} from "../services.js";

describe("Relay service integration with mocked external boundaries", () => {
  let repository: RelayRepository;

  beforeEach(() => {
    repository = createRelayRepository(":memory:");
    vi.clearAllMocks();
    ingestionMocks.findSourceById.mockReturnValue({
      id: "manual-imports",
      name: "Other manual excerpts",
      type: "manual",
      role: "context",
      authorityTier: "unknown",
      layerIds: [],
      companyTickers: [],
      intakeMode: "manual-excerpt",
      fetchStrategy: "manual",
      url: null,
      allowedDomains: [],
      enabledByDefault: false,
      priority: 50,
      perRefreshQuota: 0,
    });
    ingestionMocks.findSourceForUrl.mockReturnValue(undefined);
    ingestionMocks.selectRefreshCandidates.mockImplementation(
      (batches: Array<{ source: unknown; entries: RssEntry[] }>) =>
        batches.flatMap((batch) =>
          batch.entries.map((entry) => ({
            source: batch.source,
            entry,
            score: 1,
          })),
        ),
    );
  });

  afterEach(() => {
    repository.close();
  });

  it("routes pasted content to manual analysis without invoking URL ingestion", async () => {
    const input: ImportSourceInput = {
      title: "Manual source",
      publisher: "Personal research",
      content:
        "A sufficiently complete pasted source for the mocked analysis boundary.",
    };
    const update = makeUpdate(repository, "manual-service-analysis");
    intelligenceMocks.analyzeImportedSource.mockResolvedValue(update);

    await expect(analyzeImportedSource(repository, input)).resolves.toEqual(
      update,
    );
    expect(intelligenceMocks.analyzeImportedSource).toHaveBeenCalledWith(
      input,
      expect.objectContaining({
        analysis: {
          context: expect.objectContaining({
            watchlistCompanies: expect.arrayContaining([
              expect.objectContaining({ ticker: "NVDA" }),
            ]),
          }),
        },
      }),
    );
    expect(intelligenceMocks.analyzeUrlSource).not.toHaveBeenCalled();
  });

  it("routes URL-only input to secure URL analysis with source metadata", async () => {
    const input: ImportSourceInput = {
      title: "Public source",
      publisher: "Example Research",
      sourceUrl: "https://example.com/report",
      publishedAt: "2026-06-27T10:00:00.000Z",
    };
    const update = makeUpdate(repository, "url-service-analysis");
    intelligenceMocks.analyzeUrlSource.mockResolvedValue(update);

    await expect(analyzeImportedSource(repository, input)).resolves.toEqual(
      update,
    );
    expect(intelligenceMocks.analyzeUrlSource).toHaveBeenCalledWith(
      {
        url: input.sourceUrl,
        title: input.title,
        publisher: input.publisher,
        publishedAt: input.publishedAt,
      },
      expect.objectContaining({
        analysis: { context: expect.any(Object) },
      }),
    );
    expect(intelligenceMocks.analyzeImportedSource).not.toHaveBeenCalled();
  });

  it("rejects an import that reaches the service without content or a URL", async () => {
    await expect(
      analyzeImportedSource(repository, {
        title: "Incomplete source",
        publisher: "Personal research",
      }),
    ).rejects.toThrow(
      "Provide pasted source content or a public source URL.",
    );
    expect(intelligenceMocks.analyzeImportedSource).not.toHaveBeenCalled();
    expect(intelligenceMocks.analyzeUrlSource).not.toHaveBeenCalled();
  });

  it("refreshes a public source through mocked fetch and intelligence boundaries", async () => {
    const entry: RssEntry = {
      externalId: "entry-1",
      title: "Cluster networking update",
      publisher: "Mock arXiv",
      sourceUrl: "https://example.com/paper/1",
      publishedAt: "2026-06-27T09:00:00.000Z",
      content:
        "The paper reports a measurable improvement in cluster networking throughput.",
    };
    const document: NormalizedDocument = {
      id: "source-entry-1",
      sourceType: "paper",
      title: entry.title,
      publisher: entry.publisher,
      sourceUrl: entry.sourceUrl,
      publishedAt: entry.publishedAt,
      ingestedAt: "2026-06-27T10:00:00.000Z",
      content: entry.content,
      paragraphs: [{ locator: "P1", text: entry.content }],
    };
    const update = makeUpdate(repository, "refreshed-service-update");
    ingestionMocks.fetchRssSource.mockResolvedValue([entry]);
    ingestionMocks.deduplicateRssEntries.mockImplementation(
      (entries: RssEntry[]) => entries,
    );
    ingestionMocks.normalizeRssEntry.mockReturnValue(document);
    intelligenceMocks.analyzeDocument.mockResolvedValue(update);

    await expect(refreshPublicSources(repository)).resolves.toEqual({
      imported: 1,
      analyzed: 1,
      errors: [],
      items: [
        {
          sourceId: "arxiv-distributed-systems",
          sourceName: "Mock arXiv",
          title: entry.title,
          sourceUrl: entry.sourceUrl,
          isNew: true,
          status: "analyzed",
          updateId: update.id,
          error: null,
        },
      ],
    });
    expect(ingestionMocks.fetchRssSource).toHaveBeenCalledWith(
      ingestionMocks.ACTIVE_AUTOMATED_SOURCES[0],
    );
    expect(ingestionMocks.normalizeRssEntry).toHaveBeenCalledWith(entry, {
      sourceType: "paper",
    });
    expect(intelligenceMocks.analyzeDocument).toHaveBeenCalledWith(
      document,
      expect.objectContaining({
        context: expect.objectContaining({
          sourceProfile: expect.objectContaining({
            id: "arxiv-distributed-systems",
          }),
        }),
      }),
    );
    expect(repository.getUpdate(update.id)).toEqual(update);
    expect(
      repository
        .listSources()
        .find((source) => source.id === "arxiv-distributed-systems"),
    ).toMatchObject({
      status: "ready",
      documentCount: 1,
    });
  });

  it("refreshes a user-added feed with its saved analysis context", async () => {
    repository.listSources().forEach((source) => {
      if (!source.userAdded) {
        repository.archiveSource(source.id);
      }
    });
    const customSource = repository.addSource({
      name: "Personal inference systems feed",
      type: "rss",
      url: "https://example.com/personal-feed.xml",
      layerIds: ["serving"],
      companyTickers: ["NVDA"],
    });
    const entry: RssEntry = {
      externalId: "personal-entry-1",
      title: "Serving throughput improves",
      publisher: "Personal inference systems feed",
      sourceUrl: "https://example.com/posts/serving-throughput",
      publishedAt: "2026-06-29T09:00:00.000Z",
      content:
        "The release reports a measurable improvement in inference serving throughput.",
    };
    const document: NormalizedDocument = {
      id: "personal-source-entry-1",
      sourceType: "rss",
      title: entry.title,
      publisher: entry.publisher,
      sourceUrl: entry.sourceUrl,
      publishedAt: entry.publishedAt,
      ingestedAt: "2026-06-29T10:00:00.000Z",
      content: entry.content,
      paragraphs: [{ locator: "P1", text: entry.content }],
    };
    const update = makeUpdate(repository, "personal-feed-update");
    ingestionMocks.fetchRssSource.mockResolvedValue([entry]);
    ingestionMocks.deduplicateRssEntries.mockImplementation(
      (entries: RssEntry[]) => entries,
    );
    ingestionMocks.normalizeRssEntry.mockReturnValue(document);
    intelligenceMocks.analyzeDocument.mockResolvedValue(update);

    const result = await refreshPublicSources(repository);

    expect(result.items).toEqual([
      expect.objectContaining({
        sourceId: customSource.id,
        title: entry.title,
        status: "analyzed",
        updateId: update.id,
      }),
    ]);
    expect(ingestionMocks.fetchRssSource).toHaveBeenCalledWith(
      expect.objectContaining({
        id: customSource.id,
        url: customSource.url,
        layerIds: ["serving"],
        companyTickers: ["NVDA"],
      }),
    );
    expect(intelligenceMocks.analyzeDocument).toHaveBeenCalledWith(
      document,
      expect.objectContaining({
        context: expect.objectContaining({
          sourceProfile: expect.objectContaining({
            id: customSource.id,
          }),
        }),
      }),
    );
  });

  it("builds app services around the repository and supplies updates to synthesis", async () => {
    const generatedBrief: DailyBrief = {
      id: "service-generated-brief",
      date: "2026-06-28",
      title: "Networking becomes the signal",
      summary: "The mocked synthesis selected a networking constraint.",
      signal: "Cluster scale increases the value of network throughput.",
      secondarySignals: [],
      updateIds: ["vrt-fy25-q4"],
      citationClaimIds: ["claim-vrt-backlog"],
      generatedAt: "2026-06-28T06:00:00.000Z",
      model: "mock-synthesis-model",
    };
    intelligenceMocks.synthesizeDailyBrief.mockResolvedValue(generatedBrief);
    repository.persistAnalyzedUpdate(
      makeUpdate(repository, "fresh-service-update"),
    );
    const services = createAppServices(repository);
    if (!services.generateBrief) {
      throw new Error("Expected createAppServices to configure synthesis.");
    }

    await expect(services.generateBrief()).resolves.toEqual(generatedBrief);
    expect(intelligenceMocks.synthesizeDailyBrief).toHaveBeenCalledOnce();
    const updates =
      intelligenceMocks.synthesizeDailyBrief.mock.calls[0]?.[0] as
        | IntelligenceUpdate[]
        | undefined;
    expect(updates).toHaveLength(1);
    expect(updates?.map((update) => update.id)).toContain(
      "fresh-service-update",
    );

    await expect(generateDailyBrief(repository)).resolves.toEqual(
      generatedBrief,
    );
    expect(intelligenceMocks.synthesizeDailyBrief).toHaveBeenCalledTimes(2);
  });

  it("returns an existing same-day brief when no newer signals exist", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const existing: DailyBrief = {
      id: "meaningful-today-brief",
      date: today,
      title: "Power remains constrained",
      summary: "A meaningful same-day synthesis.",
      signal: "Power delivery remains the binding bottleneck.",
      secondarySignals: [],
      updateIds: [],
      citationClaimIds: [],
      generatedAt: new Date().toISOString(),
      model: "mock-synthesis-model",
    };
    repository.persistDailyBrief(existing);

    await expect(generateDailyBrief(repository)).resolves.toEqual(existing);
    expect(intelligenceMocks.synthesizeDailyBrief).not.toHaveBeenCalled();
  });

  it("preserves a same-day meaningful brief when newer signals are only noise", async () => {
    const generatedAt = new Date();
    const existing: DailyBrief = {
      id: "meaningful-brief-before-noise",
      date: generatedAt.toISOString().slice(0, 10),
      title: "Power remains constrained",
      summary: "A meaningful same-day synthesis.",
      signal: "Power delivery remains the binding bottleneck.",
      secondarySignals: [],
      updateIds: [],
      citationClaimIds: [],
      generatedAt: generatedAt.toISOString(),
      model: "mock-synthesis-model",
    };
    repository.persistDailyBrief(existing);
    repository.persistAnalyzedUpdate({
      ...makeUpdate(repository, "new-repetition"),
      ingestedAt: new Date(generatedAt.getTime() + 1_000).toISOString(),
      materiality: "not-material",
      materialityReason: "The item repeats evidence already in the thesis.",
      novelty: "repetition",
      sentiment: "not-material",
      thesisImpacts: [],
    });

    await expect(generateDailyBrief(repository)).resolves.toEqual(existing);
    expect(intelligenceMocks.synthesizeDailyBrief).not.toHaveBeenCalled();
  });

  it("carries prior same-day brief signals into synthesis with a new material signal", async () => {
    const generatedAt = new Date();
    const priorUpdate = repository.getUpdate("vrt-fy25-q4");
    if (!priorUpdate) {
      throw new Error("Expected prior update fixture.");
    }
    repository.persistDailyBrief({
      id: "meaningful-brief-before-new-signal",
      date: generatedAt.toISOString().slice(0, 10),
      title: "Power remains constrained",
      summary: "The prior signal must remain in the daily window.",
      signal: "Power delivery remains the binding bottleneck.",
      secondarySignals: [],
      updateIds: [priorUpdate.id],
      citationClaimIds: [priorUpdate.claims[0]!.id],
      generatedAt: generatedAt.toISOString(),
      model: "mock-synthesis-model",
    });
    const newUpdate = {
      ...makeUpdate(repository, "new-material-signal"),
      ingestedAt: new Date(generatedAt.getTime() + 1_000).toISOString(),
    };
    repository.persistAnalyzedUpdate(newUpdate);
    const generated: DailyBrief = {
      id: "merged-same-day-brief",
      date: generatedAt.toISOString().slice(0, 10),
      title: "Power and networking moved",
      summary: "Both same-day signals were considered.",
      signal: "The new signal extends rather than erases the prior brief.",
      secondarySignals: [],
      updateIds: [priorUpdate.id, newUpdate.id],
      citationClaimIds: [
        priorUpdate.claims[0]!.id,
        newUpdate.claims[0]!.id,
      ],
      generatedAt: new Date(generatedAt.getTime() + 2_000).toISOString(),
      model: "mock-synthesis-model",
    };
    intelligenceMocks.synthesizeDailyBrief.mockResolvedValue(generated);

    await expect(generateDailyBrief(repository)).resolves.toEqual(generated);
    const updates =
      intelligenceMocks.synthesizeDailyBrief.mock.calls[0]?.[0] as
        | IntelligenceUpdate[]
        | undefined;
    expect(updates?.map((update) => update.id)).toEqual([
      priorUpdate.id,
      newUpdate.id,
    ]);
  });

  it("does not cap the first brief generation at 100 signals", async () => {
    repository.database.prepare("DELETE FROM daily_briefs").run();
    for (let index = 0; index < 101; index += 1) {
      repository.persistAnalyzedUpdate(
        makeUpdate(repository, `initial-signal-${index}`),
      );
    }
    const generated: DailyBrief = {
      id: "uncapped-initial-brief",
      date: "2026-06-29",
      title: "All initial signals considered",
      summary: "The first synthesis received the complete corpus.",
      signal: "No first-run signal was dropped by a fixed limit.",
      secondarySignals: [],
      updateIds: [],
      citationClaimIds: [],
      generatedAt: "2026-06-29T12:00:00.000Z",
      model: "mock-synthesis-model",
    };
    intelligenceMocks.synthesizeDailyBrief.mockResolvedValue(generated);

    await expect(generateDailyBrief(repository)).resolves.toEqual(generated);
    const updates =
      intelligenceMocks.synthesizeDailyBrief.mock.calls[0]?.[0] as
        | IntelligenceUpdate[]
        | undefined;
    expect(updates?.length).toBeGreaterThan(100);
    expect(
      updates?.filter((update) => update.id.startsWith("initial-signal-")),
    ).toHaveLength(101);
  });

  it("includes every signal ingested after the brief cursor regardless of publication date", async () => {
    const cursor = new Date("2026-06-27T23:00:00.000Z");
    repository.persistDailyBrief({
      id: "cursor-brief",
      date: "2026-06-27",
      title: "Cursor brief",
      summary: " establishes the synthesis cursor.",
      signal: "The next run must include every newly ingested signal.",
      secondarySignals: [],
      updateIds: [],
      citationClaimIds: [],
      generatedAt: cursor.toISOString(),
      model: "mock-synthesis-model",
    });
    for (let index = 0; index < 35; index += 1) {
      repository.persistAnalyzedUpdate({
        ...makeUpdate(repository, `cursor-signal-${index}`),
        publishedAt: `2025-01-${String((index % 28) + 1).padStart(2, "0")}T00:00:00.000Z`,
        ingestedAt: new Date(cursor.getTime() + (index + 1) * 1_000).toISOString(),
      });
    }
    const generated: DailyBrief = {
      id: "all-cursor-signals-brief",
      date: "2026-06-29",
      title: "All signals considered",
      summary: "The complete post-cursor set reached synthesis.",
      signal: "No backdated signal was skipped.",
      secondarySignals: [],
      updateIds: [],
      citationClaimIds: [],
      generatedAt: "2026-06-29T12:00:00.000Z",
      model: "mock-synthesis-model",
    };
    intelligenceMocks.synthesizeDailyBrief.mockResolvedValue(generated);

    await expect(generateDailyBrief(repository)).resolves.toEqual(generated);
    const updates =
      intelligenceMocks.synthesizeDailyBrief.mock.calls[0]?.[0] as
        | IntelligenceUpdate[]
        | undefined;
    expect(updates).toHaveLength(35);
    expect(updates?.[0]?.id).toBe("cursor-signal-0");
    expect(updates?.[34]?.id).toBe("cursor-signal-34");
  });
});

function makeUpdate(
  repository: RelayRepository,
  id: string,
): IntelligenceUpdate {
  const seed = repository.getUpdate("vrt-fy25-q4");
  if (!seed) {
    throw new Error("Expected the seeded update fixture.");
  }
  return {
    ...seed,
    id,
    title: `Service update ${id}`,
    ingestedAt: "2026-06-28T05:00:00.000Z",
    claims: seed.claims.slice(0, 1).map((claim) => ({
      ...claim,
      id: `claim-${id}`,
      sourceId: `source-${id}`,
    })),
    thesisImpacts: seed.thesisImpacts.slice(0, 1).map((impact) => ({
      ...impact,
      id: `impact-${id}`,
      decision: "proposed",
    })),
    model: "mock-analysis-model",
  };
}
