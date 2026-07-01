import { describe, expect, it } from "vitest";

import {
  ACTIVE_AUTOMATED_SOURCES,
  findSourceById,
  findSourceForUrl,
  findSourcesForUrl,
  selectRefreshCandidates,
  SOURCE_CATALOG_ROWS,
  sourceEntryMatchesRules,
  TRUSTED_SOURCE_REGISTRY,
} from "./source-registry.js";
import type {
  PublicSourceDefinition,
  RssEntry,
} from "./types.js";

const now = new Date("2026-06-29T12:00:00.000Z");

describe("trusted source registry", () => {
  it("derives catalog rows and automated feeds from one authoritative registry", () => {
    expect(SOURCE_CATALOG_ROWS).toHaveLength(TRUSTED_SOURCE_REGISTRY.length);
    expect(SOURCE_CATALOG_ROWS.map((source) => source.id)).toEqual(
      TRUSTED_SOURCE_REGISTRY.map((source) => source.id),
    );
    expect(ACTIVE_AUTOMATED_SOURCES.map((source) => source.id)).toEqual([
      "the-next-platform",
      "vllm-releases",
      "sglang-releases",
      "tensorrt-llm-releases",
      "nvidia-dynamo-releases",
      "arxiv-distributed-systems",
      "trendforce-semiconductors-feed",
      "delloro-feed",
      "data-center-dynamics-feed",
      "utility-dive-feed",
      "serve-the-home-feed",
      "chips-and-cheese-feed",
    ]);
    expect(SOURCE_CATALOG_ROWS.find((source) => source.id === "manual-imports"))
      .toMatchObject({
        enabled: false,
        type: "manual",
      });
    expect(SOURCE_CATALOG_ROWS.some((source) => source.id === "sec-edgar"))
      .toBe(false);
  });

  it("covers the requested primary and context source roster", () => {
    const sourceIds = new Set(
      TRUSTED_SOURCE_REGISTRY.map((source) => source.id),
    );
    expect([...sourceIds]).toEqual(
      expect.arrayContaining([
        "semianalysis-public",
        "semianalysis-manual",
        "the-next-platform",
        "nvidia-ir",
        "amd-ir",
        "broadcom-ir",
        "marvell-ir",
        "arista-ir",
        "coherent-ir",
        "lumentum-ir",
        "corning-ir",
        "micron-ir",
        "samsung-memory",
        "sk-hynix-newsroom",
        "vertiv-ir",
        "eaton-newsroom",
        "ge-vernova-newsroom",
        "tsmc-ir",
        "tsmc-advanced-packaging",
        "vllm-releases",
        "sglang-releases",
        "tensorrt-llm-releases",
        "nvidia-dynamo-releases",
        "arxiv-distributed-systems",
        "lightcounting",
        "trendforce-memory",
        "dramexchange",
        "delloro",
        "data-center-dynamics",
        "utility-dive",
        "the-information-manual",
        "stratechery-manual",
        "latent-space-manual",
        "dylan-patel-interviews-manual",
        "fabricated-knowledge-manual",
        "chips-and-cheese-manual",
        "serve-the-home-manual",
      ]),
    );
  });

  it("automates only scoped infrastructure feeds with explicit refresh buckets", () => {
    expect(ACTIVE_AUTOMATED_SOURCES).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "trendforce-semiconductors-feed",
          url: "https://www.trendforce.com/feed/Semiconductors.html",
          authorityTier: "specialist",
          refreshBucket: "infrastructure-primary",
          layerIds: ["memory", "manufacturing"],
        }),
        expect.objectContaining({
          id: "delloro-feed",
          url: "https://www.delloro.com/feed/",
          authorityTier: "specialist",
          refreshBucket: "infrastructure-primary",
          layerIds: ["networking", "optics"],
        }),
        expect.objectContaining({
          id: "data-center-dynamics-feed",
          refreshBucket: "infrastructure-primary",
          layerIds: ["power-cooling", "cloud", "networking", "optics"],
        }),
        expect.objectContaining({
          id: "utility-dive-feed",
          refreshBucket: "infrastructure-primary",
          layerIds: ["power-cooling", "materials-builders"],
        }),
      ]),
    );

    const disallowed = ["twitter", "x.com", "stock", "price-target", "generic"];
    expect(
      ACTIVE_AUTOMATED_SOURCES.filter((source) =>
        disallowed.some((term) =>
          `${source.id} ${source.name} ${source.url}`.toLowerCase()
            .includes(term)
        ),
      ),
    ).toEqual([]);
    expect(
      ACTIVE_AUTOMATED_SOURCES
        .filter((source) => source.topicRules?.includeAny)
        .every((source) =>
          source.topicRules?.excludeAny?.includes("price target") ?? false
        ),
    ).toBe(true);
  });

  it("keeps architecture publications in the context lane", () => {
    expect(findSourceById("serve-the-home-feed")).toMatchObject({
      role: "context",
      authorityTier: "context",
      refreshBucket: "context",
      perRefreshQuota: 1,
    });
    expect(findSourceById("chips-and-cheese-feed")).toMatchObject({
      role: "context",
      authorityTier: "context",
      refreshBucket: "context",
      perRefreshQuota: 1,
    });
  });

  it("keeps paid and unsupported sources manual", () => {
    expect(findSourceById("the-information-manual")).toMatchObject({
      role: "context",
      intakeMode: "manual-excerpt",
      fetchStrategy: "manual",
      enabledByDefault: false,
      perRefreshQuota: 0,
    });
    expect(findSourceById("semianalysis-public")).toMatchObject({
      role: "primary",
      intakeMode: "public-url",
      fetchStrategy: "on-demand-url",
      enabledByDefault: false,
    });
  });

  it("looks up trusted definitions by id and allowed domain", () => {
    expect(findSourceById("nvidia-ir")?.name).toContain("NVIDIA");
    expect(findSourceById("nvidia-ir")).toMatchObject({
      authorityTier: "first-party",
      companyTickers: ["NVDA"],
    });
    expect(
      findSourcesForUrl(
        "https://nvidianews.nvidia.com/news/latest-ai-factory-release",
      ).map((source) => source.id),
    ).toContain("nvidia-ir");
    expect(
      findSourcesForUrl("https://subdomain.semianalysis.com/p/research")
        .map((source) => source.id),
    ).toEqual(["semianalysis-public", "semianalysis-manual"]);
    expect(
      findSourceForUrl("https://semianalysis.com/p/research")?.intakeMode,
    ).toBe("public-url");
    expect(findSourcesForUrl("not a url")).toEqual([]);
    expect(findSourcesForUrl("https://notsemianalysis.com/post")).toEqual([]);
  });
});

describe("high-signal candidate filtering and selection", () => {
  it("filters broad arXiv entries by topic and age", () => {
    const arxiv = automatedSource("arxiv-distributed-systems");
    expect(
      sourceEntryMatchesRules(
        arxiv,
        entry("relevant", "Distributed inference serving over GPU clusters"),
        now,
      ),
    ).toBe(true);
    expect(
      sourceEntryMatchesRules(
        arxiv,
        entry("generic", "A survey of graph coloring approximations"),
        now,
      ),
    ).toBe(false);
    expect(
      sourceEntryMatchesRules(
        arxiv,
        entry(
          "stale",
          "Distributed inference serving over GPU clusters",
          "2026-05-01T12:00:00.000Z",
        ),
        now,
      ),
    ).toBe(false);
  });

  it("requires both data-center and facility-constraint relevance for power feeds", () => {
    const dcd = automatedSource("data-center-dynamics-feed");
    expect(
      sourceEntryMatchesRules(
        dcd,
        entry("power", "AI data center liquid cooling reduces power demand"),
        now,
      ),
    ).toBe(true);
    expect(
      sourceEntryMatchesRules(
        dcd,
        entry("property", "Developer buys land for a new data center"),
        now,
      ),
    ).toBe(false);
    expect(
      sourceEntryMatchesRules(
        dcd,
        entry("utility", "Utility replaces aging grid transformers"),
        now,
      ),
    ).toBe(false);
  });

  it("does not admit telecom coverage from incidental body references", () => {
    const dellOro = automatedSource("delloro-feed");
    expect(
      sourceEntryMatchesRules(
        dellOro,
        {
          ...entry("ran", "Ericsson leadership transition"),
          content: "The company missed the data center wave.",
        },
        now,
      ),
    ).toBe(false);
    expect(
      sourceEntryMatchesRules(
        dellOro,
        entry("fabric", "AI data center network fabric demand accelerates"),
        now,
      ),
    ).toBe(true);
  });

  it("takes one ranked candidate per source before a second from any source", () => {
    const nextPlatform = automatedSource("the-next-platform");
    const vllm = automatedSource("vllm-releases");
    const sglang = automatedSource("sglang-releases");
    const selected = selectRefreshCandidates(
      [
        {
          source: nextPlatform,
          entries: [
            entry("tnp-new", "New AI cluster interconnect", "2026-06-29T11:00:00.000Z"),
            entry("tnp-old", "GPU data center build", "2026-06-28T11:00:00.000Z"),
            entry("tnp-over-quota", "Inference serving demand", "2026-06-27T11:00:00.000Z"),
          ],
        },
        {
          source: vllm,
          entries: [
            entry("vllm", "vLLM release", "2026-06-29T10:00:00.000Z"),
          ],
        },
        {
          source: sglang,
          entries: [
            entry("sglang", "SGLang release", "2026-06-29T09:00:00.000Z"),
          ],
        },
      ],
      { limit: 4, now },
    );

    expect(selected.slice(0, 3).map((candidate) => candidate.source.id))
      .toEqual(["the-next-platform", "vllm-releases", "sglang-releases"]);
    expect(selected[3]?.source.id).toBe("the-next-platform");
    expect(selected.map((candidate) => candidate.entry.externalId))
      .not.toContain("tnp-over-quota");
  });

  it("deduplicates canonical URLs across source queues", () => {
    const nextPlatform = automatedSource("the-next-platform");
    const vllm = automatedSource("vllm-releases");
    const duplicateUrl = "https://example.com/signal";
    const selected = selectRefreshCandidates(
      [
        {
          source: nextPlatform,
          entries: [
            {
              ...entry("one", "AI cluster signal"),
              sourceUrl: `${duplicateUrl}?utm_source=feed`,
            },
          ],
        },
        {
          source: vllm,
          entries: [
            {
              ...entry("two", "vLLM release"),
              sourceUrl: duplicateUrl,
            },
          ],
        },
      ],
      { limit: 2, now },
    );

    expect(selected).toHaveLength(1);
    expect(selected[0]?.source.id).toBe("the-next-platform");
  });

  it("caps serving-software releases and rotates the slots by recency", () => {
    const releases = [
      automatedSource("vllm-releases"),
      automatedSource("sglang-releases"),
      automatedSource("tensorrt-llm-releases"),
      automatedSource("nvidia-dynamo-releases"),
    ];
    const selected = selectRefreshCandidates(
      releases.map((source, index) => ({
        source,
        entries: [
          entry(
            source.id,
            `${source.name} release`,
            new Date(now.getTime() - index * 3_600_000).toISOString(),
          ),
        ],
      })),
      { limit: 10, now },
    );

    expect(selected).toHaveLength(2);
    expect(selected.map((candidate) => candidate.source.id)).toEqual([
      "vllm-releases",
      "sglang-releases",
    ]);

    const rotated = selectRefreshCandidates(
      releases.map((source, index) => ({
        source,
        entries: [
          entry(
            source.id,
            `${source.name} release`,
            new Date(now.getTime() - (3 - index) * 3_600_000).toISOString(),
          ),
        ],
      })),
      { limit: 10, now },
    );
    expect(rotated.map((candidate) => candidate.source.id)).toEqual([
      "nvidia-dynamo-releases",
      "tensorrt-llm-releases",
    ]);
  });

  it("limits context-feed intake independently from primary infrastructure", () => {
    const dcd = automatedSource("data-center-dynamics-feed");
    const utilityDive = automatedSource("utility-dive-feed");
    const serveTheHome = automatedSource("serve-the-home-feed");
    const chipsAndCheese = automatedSource("chips-and-cheese-feed");
    const selected = selectRefreshCandidates(
      [
        {
          source: dcd,
          entries: [entry("dcd", "Liquid cooling for an AI data center")],
        },
        {
          source: utilityDive,
          entries: [entry("utility", "Data center power demand strains grid")],
        },
        {
          source: serveTheHome,
          entries: [entry("sth", "New AI server GPU interconnect")],
        },
        {
          source: chipsAndCheese,
          entries: [entry("cac", "GPU memory bandwidth architecture")],
        },
      ],
      { limit: 10, now },
    );

    expect(
      selected.filter((candidate) =>
        candidate.source.refreshBucket === "infrastructure-primary"
      ),
    ).toHaveLength(2);
    expect(
      selected.filter((candidate) =>
        candidate.source.refreshBucket === "context"
      ),
    ).toHaveLength(1);
  });
});

function automatedSource(id: string): PublicSourceDefinition {
  const source = ACTIVE_AUTOMATED_SOURCES.find((candidate) => candidate.id === id);
  if (!source) {
    throw new Error(`Expected automated source ${id}.`);
  }
  return source;
}

function entry(
  id: string,
  content: string,
  publishedAt = "2026-06-29T08:00:00.000Z",
): RssEntry {
  return {
    externalId: id,
    title: content,
    publisher: "Test publisher",
    sourceUrl: `https://example.com/${id}`,
    publishedAt,
    content,
  };
}
