import { describe, expect, it } from "vitest";

import type {
  DailyBrief,
  IntelligenceUpdate,
} from "../../shared/contracts";
import { getSecondarySignalUpdate } from "./briefs";

const brief: DailyBrief = {
  id: "brief-1",
  date: "2026-06-29",
  title: "Serving software changes",
  summary: "Summary",
  signal: "Lead signal",
  secondarySignals: [
    "NVIDIA serving improves.",
    "AMD software friction is falling in production deployments.",
  ],
  updateIds: ["lead", "nvidia"],
  citationClaimIds: [],
  generatedAt: "2026-06-29T12:00:00.000Z",
  model: "test",
};

describe("getSecondarySignalUpdate", () => {
  it("uses the positional update for a mapped secondary signal", () => {
    expect(
      getSecondarySignalUpdate(
        brief,
        [update("lead", "AMD", "Lead"), update("nvidia", "NVDA", "Serving")],
        brief.secondarySignals[0]!,
        0,
      )?.id,
    ).toBe("nvidia");
  });

  it("finds the most relevant brief update when legacy data has no positional mapping", () => {
    expect(
      getSecondarySignalUpdate(
        brief,
        [
          update("lead", "NVDA", "Accelerator performance improved."),
          update(
            "nvidia",
            "AMD",
            "Software friction fell for production deployments.",
          ),
        ],
        brief.secondarySignals[1]!,
        1,
      )?.id,
    ).toBe("nvidia");
  });
});

function update(
  id: string,
  ticker: string,
  whyItMatters: string,
): IntelligenceUpdate {
  return {
    id,
    title: id,
    publisher: "Test",
    sourceUrl: null,
    publishedAt: "2026-06-29T10:00:00.000Z",
    ingestedAt: "2026-06-29T10:01:00.000Z",
    layerIds: ["serving"],
    companyTickers: [ticker],
    materiality: "high",
    materialityReason: "Changes a thesis.",
    novelty: "new",
    sentiment: "bullish",
    whatHappened: whyItMatters,
    whyItMatters,
    beneficiaries: [],
    threatened: [],
    watchNext: [],
    claims: [],
    thesisImpacts: [],
    macroThesisImpacts: [],
    model: "test",
  };
}
