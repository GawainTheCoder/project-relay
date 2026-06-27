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
  synthesizeDailyBrief: vi.fn(),
}));

const ingestionMocks = vi.hoisted(() => ({
  deduplicateRssEntries: vi.fn(),
  fetchRssSource: vi.fn(),
  normalizeRssEntry: vi.fn(),
  PUBLIC_SOURCE_REGISTRY: [
    {
      id: "arxiv-distributed-systems",
      name: "Mock arXiv",
      type: "paper",
      url: "https://example.com/feed.xml",
      enabledByDefault: true,
    },
  ],
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

    await expect(analyzeImportedSource(input)).resolves.toEqual(update);
    expect(intelligenceMocks.analyzeImportedSource).toHaveBeenCalledWith(input);
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

    await expect(analyzeImportedSource(input)).resolves.toEqual(update);
    expect(intelligenceMocks.analyzeUrlSource).toHaveBeenCalledWith({
      url: input.sourceUrl,
      title: input.title,
      publisher: input.publisher,
      publishedAt: input.publishedAt,
    });
    expect(intelligenceMocks.analyzeImportedSource).not.toHaveBeenCalled();
  });

  it("rejects an import that reaches the service without content or a URL", async () => {
    await expect(
      analyzeImportedSource({
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
    });
    expect(ingestionMocks.fetchRssSource).toHaveBeenCalledWith(
      ingestionMocks.PUBLIC_SOURCE_REGISTRY[0],
    );
    expect(ingestionMocks.normalizeRssEntry).toHaveBeenCalledWith(entry, {
      sourceType: "paper",
    });
    expect(intelligenceMocks.analyzeDocument).toHaveBeenCalledWith(document);
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
    expect(updates).toHaveLength(7);
    expect(updates?.map((update) => update.id)).toContain("vrt-fy25-q4");

    await expect(generateDailyBrief(repository)).resolves.toEqual(
      generatedBrief,
    );
    expect(intelligenceMocks.synthesizeDailyBrief).toHaveBeenCalledTimes(2);
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
