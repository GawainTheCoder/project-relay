import { describe, expect, it } from "vitest";

import {
  clusterStories,
  compareStories,
  normalizedTitleTokens,
  type StoryCandidate,
} from "./story-clustering.js";

const bloombergMeta: StoryCandidate = {
  id: "document-58abc050-4a5e-45f1-9b64-5c91f13d5944",
  title:
    "Meta is building a cloud business to sell excess AI computing capacity",
  publishedAt: "2026-07-01T15:33:59.703Z",
  companyTickers: ["META"],
};

const reutersMeta: StoryCandidate = {
  id: "document-85b4d5f6-afd0-4e6b-93f1-3775effbec18",
  title:
    "Meta plans cloud business to sell excess AI computing capacity, Bloomberg News reports",
  publishedAt: "2026-07-01T15:35:05.519Z",
  companyTickers: ["meta"],
};

describe("compareStories", () => {
  it("clusters Bloomberg and Reuters coverage of the same Meta event", () => {
    const comparison = compareStories(bloombergMeta, reutersMeta);
    const reversed = compareStories(reutersMeta, bloombergMeta);

    expect(comparison).toMatchObject({
      sameStory: true,
      clusterKey: expect.stringMatching(/^story-[a-f0-9]{20}$/),
      anchorId: bloombergMeta.id,
      overlappingCompanyTickers: ["META"],
      titleSimilarity: {
        sharedTokenCount: 8,
        containment: 0.889,
        jaccard: 0.727,
      },
    });
    expect(comparison.score).toBeGreaterThanOrEqual(80);
    expect(comparison.reasons).toEqual([
      expect.objectContaining({
        code: "company-overlap",
        passed: true,
      }),
      expect.objectContaining({
        code: "publication-window",
        passed: true,
      }),
      expect.objectContaining({
        code: "title-overlap",
        passed: true,
      }),
    ]);
    expect(reversed.clusterKey).toBe(comparison.clusterKey);
    expect(reversed.score).toBe(comparison.score);
  });

  it("rejects a related but distinct Meta infrastructure story", () => {
    const distinctStory: StoryCandidate = {
      id: "document-meta-data-center-expansion",
      title:
        "Meta expands AI data centers as cloud capacity demand accelerates",
      publishedAt: "2026-07-01T16:00:00.000Z",
      companyTickers: ["META"],
    };

    const comparison = compareStories(bloombergMeta, distinctStory);

    expect(comparison.sameStory).toBe(false);
    expect(comparison.clusterKey).toBeNull();
    expect(comparison.titleSimilarity).toMatchObject({
      sharedTokenCount: 4,
      containment: 0.444,
      jaccard: 0.286,
    });
    expect(
      comparison.reasons.find((reason) => reason.code === "title-overlap"),
    ).toMatchObject({ passed: false });
  });

  it("rejects matching headlines outside the publication window", () => {
    const laterRecap: StoryCandidate = {
      ...bloombergMeta,
      id: "document-later-meta-recap",
      publishedAt: "2026-07-06T15:33:59.703Z",
    };

    const comparison = compareStories(bloombergMeta, laterRecap);

    expect(comparison.sameStory).toBe(false);
    expect(
      comparison.reasons.find(
        (reason) => reason.code === "publication-window",
      ),
    ).toMatchObject({ passed: false });
  });

  it("requires explicit overlapping company context", () => {
    const unrelatedCompany: StoryCandidate = {
      ...reutersMeta,
      id: "document-other-company",
      companyTickers: ["ORCL"],
    };

    const comparison = compareStories(bloombergMeta, unrelatedCompany);

    expect(comparison.sameStory).toBe(false);
    expect(
      comparison.reasons.find((reason) => reason.code === "company-overlap"),
    ).toMatchObject({ passed: false });
  });
});

describe("clusterStories", () => {
  it("returns stable input-order-independent clusters with audit comparisons", () => {
    const distinctStory: StoryCandidate = {
      id: "document-meta-data-center-expansion",
      title:
        "Meta expands AI data centers as cloud capacity demand accelerates",
      publishedAt: "2026-07-01T16:00:00.000Z",
      companyTickers: ["META"],
    };

    const forward = clusterStories([
      bloombergMeta,
      reutersMeta,
      distinctStory,
    ]);
    const reversed = clusterStories([
      distinctStory,
      reutersMeta,
      bloombergMeta,
    ]);

    expect(reversed).toEqual(forward);
    expect(forward).toHaveLength(2);
    expect(forward[0]).toMatchObject({
      key: expect.stringMatching(/^story-[a-f0-9]{20}$/),
      anchorId: bloombergMeta.id,
      members: [
        {
          id: bloombergMeta.id,
          duplicateOfAnchor: false,
          comparisonToAnchor: null,
        },
        {
          id: reutersMeta.id,
          duplicateOfAnchor: true,
          comparisonToAnchor: {
            sameStory: true,
            clusterKey: expect.any(String),
          },
        },
      ],
    });
    expect(forward[1]).toMatchObject({
      anchorId: distinctStory.id,
      members: [{ id: distinctStory.id, duplicateOfAnchor: false }],
    });
  });

  it("normalizes invisible characters and publisher boilerplate", () => {
    expect(
      normalizedTitleTokens(
        "Meta is building a cloud business \u200bto sell excess AI capacity — Reuters reports",
      ),
    ).toEqual([
      "ai",
      "building",
      "business",
      "capacity",
      "cloud",
      "excess",
      "meta",
      "reuters",
      "sell",
    ]);
  });
});
