import { describe, expect, it } from "vitest";

import type { DashboardPayload } from "../../../shared/contracts";
import { deriveBeliefDetail } from "./model";

const dashboardWithProposedImpact: DashboardPayload = {
  brief: null,
  companies: [
    {
      ticker: "NVDA",
      name: "NVIDIA",
      layerIds: ["accelerators"],
      description: "Accelerated computing supplier.",
      thesis: "Full-stack acceleration can preserve premium economics.",
      whyItMatters: "The platform spans compute, networking, and software.",
      provesRight: ["Platform attach rates rise."],
      breaksThesis: ["The software moat weakens."],
      watchMetrics: ["Data-center revenue"],
      confidence: "high",
      updatedAt: "2026-07-01T08:00:00.000Z",
    },
  ],
  demoData: false,
  layers: [],
  sourceCoverage: [],
  sources: [],
  updates: [
    {
      id: "signal-1",
      title: "New accelerator evidence",
      publisher: "Primary source",
      sourceUrl: "https://example.com/evidence",
      publishedAt: "2026-07-01T07:00:00.000Z",
      ingestedAt: "2026-07-01T08:00:00.000Z",
      layerIds: ["accelerators"],
      companyTickers: ["NVDA"],
      materiality: "high",
      materialityReason: "The evidence bears directly on the company thesis.",
      novelty: "new",
      sentiment: "bullish",
      whatHappened: "The supplier reported stronger platform adoption.",
      whyItMatters: "Platform adoption affects durable economics.",
      beneficiaries: ["NVDA"],
      threatened: [],
      watchNext: ["Attach rates"],
      claims: [
        {
          id: "claim-1",
          quote: "Platform attach rates increased during the quarter.",
          sourceId: "source-1",
          locator: "paragraph 4",
        },
      ],
      thesisImpacts: [
        {
          id: "impact-1",
          companyTicker: "NVDA",
          direction: "bullish",
          summary: "The source proposes a positive company-thesis impact.",
          confidence: "high",
          horizon: "12 months",
          thesisDelta: "Platform adoption is broadening.",
          decision: "proposed",
        },
      ],
      macroThesisImpacts: [],
      model: "test-model",
    },
  ],
};

describe("dashboard-derived company thesis compatibility model", () => {
  it("keeps source impacts as read-only evidence instead of reviewable evaluations", () => {
    const belief = deriveBeliefDetail(
      dashboardWithProposedImpact,
      "NVDA",
    );

    expect(belief).toMatchObject({
      id: "NVDA",
      pendingEvaluationCount: 0,
      pendingEvaluations: [],
      supportingEvidenceCount: 1,
    });
    expect(belief?.supportingEvidence).toEqual([
      expect.objectContaining({
        claimId: "claim-1",
        updateId: "signal-1",
        stance: "supports",
      }),
    ]);
    expect(
      belief?.pendingEvaluations.some(
        (evaluation) => evaluation.id === "impact-1",
      ),
    ).toBe(false);
  });
});
