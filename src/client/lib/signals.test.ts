import { describe, expect, it } from "vitest";

import type { IntelligenceUpdate } from "../../shared/contracts";
import {
  isThesisChangingImpact,
  isThesisChangingSignal,
} from "./signals";

function makeSignal(): IntelligenceUpdate {
  return {
    id: "signal-1",
    title: "HBM supply expands",
    publisher: "Example",
    sourceUrl: "https://example.com/signal",
    publishedAt: "2026-06-29T00:00:00.000Z",
    ingestedAt: "2026-06-29T00:01:00.000Z",
    layerIds: ["memory"],
    companyTickers: ["MU"],
    materiality: "high",
    materialityReason: "The evidence changes the memory supply thesis.",
    novelty: "new",
    sentiment: "bullish",
    whatHappened: "Capacity increased.",
    whyItMatters: "Supply constraints may ease.",
    beneficiaries: ["MU"],
    threatened: [],
    watchNext: ["Shipments"],
    claims: [
      {
        id: "claim-1",
        quote: "Capacity increased.",
        sourceId: "source-1",
        locator: "P1",
      },
    ],
    thesisImpacts: [
      {
        id: "impact-1",
        companyTicker: "MU",
        direction: "bullish",
        summary: "Capacity supports the thesis.",
        thesisDelta: "Moves the thesis from planned to observed capacity.",
        confidence: "medium",
        horizon: "6-12 months",
        decision: "proposed",
      },
    ],
    macroThesisImpacts: [],
    model: "test",
  };
}

describe("thesis-changing signal filters", () => {
  it("excludes rejected impacts", () => {
    const signal = makeSignal();
    signal.thesisImpacts[0] = {
      ...signal.thesisImpacts[0]!,
      review: {
        impactId: "impact-1",
        updateId: "signal-1",
        companyTicker: "MU",
        decision: "rejected",
        reasonTags: [],
        note: null,
        createdAt: "2026-06-29T01:00:00.000Z",
        updatedAt: "2026-06-29T01:00:00.000Z",
      },
    };

    expect(isThesisChangingImpact(signal.thesisImpacts[0])).toBe(false);
    expect(isThesisChangingSignal(signal)).toBe(false);
  });

  it("excludes repetition and not-material signals", () => {
    expect(
      isThesisChangingSignal({
        ...makeSignal(),
        novelty: "repetition",
      }),
    ).toBe(false);
    expect(
      isThesisChangingSignal({
        ...makeSignal(),
        materiality: "not-material",
        sentiment: "not-material",
        thesisImpacts: [],
      }),
    ).toBe(false);
  });

  it("includes direct macro routes without requiring a company impact", () => {
    const signal = makeSignal();
    signal.thesisImpacts = [];
    signal.macroThesisImpacts = [
      {
        id: "macro-impact-1",
        thesisId: "macro-memory-bottleneck",
        relevance: "primary",
        stance: "supports",
        rationale:
          "The exact claim directly bears on the memory bottleneck thesis.",
        claimIds: ["claim-1"],
      },
    ];

    expect(isThesisChangingSignal(signal)).toBe(true);

    signal.macroThesisImpacts[0] = {
      ...signal.macroThesisImpacts[0]!,
      relevance: "context",
      stance: "context",
    };
    expect(isThesisChangingSignal(signal)).toBe(false);
  });
});
