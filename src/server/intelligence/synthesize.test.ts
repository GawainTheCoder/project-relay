import OpenAI from "openai";
import { describe, expect, it, vi } from "vitest";

import type { IntelligenceUpdate } from "../../shared/contracts.js";
import { EvidenceValidationError } from "./errors.js";
import {
  buildDailyBrief,
  selectBriefEligibleUpdates,
  synthesizeDailyBrief,
} from "./synthesize.js";
import type { DailyBriefOutput } from "./schemas.js";

const NOW = new Date("2026-06-27T18:00:00.000Z");

function makeUpdate(): IntelligenceUpdate {
  return {
    id: "update_1",
    title: "Optics demand rises",
    publisher: "Example Research",
    sourceUrl: "https://example.com/optics",
    publishedAt: "2026-06-27T00:00:00.000Z",
    ingestedAt: NOW.toISOString(),
    layerIds: ["optics"],
    companyTickers: ["COHR"],
    materiality: "high",
    materialityReason:
      "New order evidence raises confidence in an optical bottleneck.",
    novelty: "new",
    sentiment: "bullish",
    whatHappened: "Orders doubled.",
    whyItMatters: "Optics may constrain cluster deployment.",
    beneficiaries: ["COHR"],
    threatened: ["Deployment schedules"],
    watchNext: ["Lead times"],
    claims: [
      {
        id: "claim_1",
        quote: "Orders doubled.",
        sourceId: "source_1",
        locator: "P1",
      },
    ],
    thesisImpacts: [
      {
        id: "impact_1",
        companyTicker: "COHR",
        direction: "bullish",
        summary: "Order acceleration supports pricing power.",
        thesisDelta:
          "The thesis moves from expected demand to realized order acceleration.",
        confidence: "medium",
        horizon: "6-12 months",
        decision: "proposed",
      },
    ],
    model: "gpt-5.4-mini",
  };
}

function mockClient(output: DailyBriefOutput): OpenAI {
  return {
    responses: {
      parse: vi.fn().mockResolvedValue({
        output_parsed: output,
        output: [],
      }),
    },
  } as unknown as OpenAI;
}

describe("synthesizeDailyBrief", () => {
  it("returns a deterministic no-change brief without calling OpenAI", async () => {
    const brief = await synthesizeDailyBrief([], {
      now: () => NOW,
    });

    expect(brief.title).toBe("No meaningful change");
    expect(brief.updateIds).toEqual([]);
    expect(brief.citationClaimIds).toEqual([]);
  });

  it("returns deterministic no-change when all updates fail the thesis gate", async () => {
    const update = makeUpdate();
    update.materiality = "not-material";
    update.sentiment = "not-material";
    update.thesisImpacts = [];
    const client = mockClient({
      title: "Should not run",
      summary: "Should not run",
      signal: "Should not run",
      secondarySignals: [],
      updateIds: [],
      citationClaimIds: [],
    });

    const brief = await synthesizeDailyBrief([update], {
      client,
      now: () => NOW,
    });

    expect(brief.title).toBe("No meaningful change");
    expect(client.responses.parse).not.toHaveBeenCalled();
  });

  it("builds an evidence-linked daily synthesis", async () => {
    const output: DailyBriefOutput = {
      title: "Optics moved to the foreground",
      summary: "Supply evidence made optical components today's key signal.",
      signal: "Faster optics may be the next deployment bottleneck.",
      secondarySignals: [],
      updateIds: ["update_1"],
      citationClaimIds: ["claim_1"],
    };
    const client = mockClient(output);

    const brief = await synthesizeDailyBrief([makeUpdate()], {
      client,
      now: () => NOW,
      sourceProfilesByUpdateId: {
        update_1: {
          id: "example-research",
          name: "Example Research",
          role: "primary",
          authorityTier: "specialist",
          priority: 90,
        },
      },
    });

    expect(brief).toEqual(
      expect.objectContaining({
        date: "2026-06-27",
        model: "gpt-5.5",
        updateIds: ["update_1"],
        citationClaimIds: ["claim_1"],
      }),
    );
    expect(client.responses.parse).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-5.5",
        store: true,
        metadata: expect.objectContaining({
          relay_app: "project-relay",
          relay_brief_date: "2026-06-27",
          relay_eligible_update_count: "1",
          relay_input_update_ids: "update_1",
          relay_operation: "daily_brief",
        }),
        input: expect.stringContaining('"authorityTier":"specialist"'),
      }),
    );
  });

  it("rejects citations that do not exist in the supplied evidence", async () => {
    const output: DailyBriefOutput = {
      title: "Unsupported signal",
      summary: "Unsupported",
      signal: "Unsupported",
      secondarySignals: [],
      updateIds: ["update_1"],
      citationClaimIds: ["claim_unknown"],
    };

    await expect(
      synthesizeDailyBrief([makeUpdate()], {
        client: mockClient(output),
        now: () => NOW,
      }),
    ).rejects.toBeInstanceOf(EvidenceValidationError);
  });

  it("rejects citations from updates that were not selected", async () => {
    const secondUpdate = {
      ...makeUpdate(),
      id: "update_2",
      claims: [
        {
          id: "claim_2",
          quote: "Lead times increased.",
          sourceId: "source_2",
          locator: "P2",
        },
      ],
    };
    const output: DailyBriefOutput = {
      title: "Mismatched evidence",
      summary: "The selected update is supported by another update's claim.",
      signal: "A signal",
      secondarySignals: [],
      updateIds: ["update_1"],
      citationClaimIds: ["claim_2"],
    };

    await expect(
      synthesizeDailyBrief([makeUpdate(), secondUpdate], {
        client: mockClient(output),
        now: () => NOW,
      }),
    ).rejects.toBeInstanceOf(EvidenceValidationError);
  });
});

describe("selectBriefEligibleUpdates", () => {
  it("requires material evidence and a non-rejected concrete thesis delta", () => {
    const eligible = makeUpdate();
    const noClaims = {
      ...makeUpdate(),
      id: "update_no_claims",
      claims: [],
    };
    const noDelta = {
      ...makeUpdate(),
      id: "update_no_delta",
      thesisImpacts: makeUpdate().thesisImpacts.map((impact) => ({
        ...impact,
        thesisDelta: "",
      })),
    };
    const rejected = {
      ...makeUpdate(),
      id: "update_rejected",
      thesisImpacts: makeUpdate().thesisImpacts.map((impact) => ({
        ...impact,
        decision: "rejected" as const,
      })),
    };
    const repeated = {
      ...makeUpdate(),
      id: "update_repeated",
      novelty: "repetition" as const,
    };

    expect(
      selectBriefEligibleUpdates([
        eligible,
        noClaims,
        noDelta,
        rejected,
        repeated,
      ]),
    ).toEqual([eligible]);
  });

  it("removes rejected impacts and their company tags before synthesis", () => {
    const update = makeUpdate();
    update.companyTickers = ["COHR", "VRT"];
    update.thesisImpacts.push({
      ...update.thesisImpacts[0]!,
      id: "impact_rejected",
      companyTicker: "VRT",
      decision: "rejected",
    });

    const [eligible] = selectBriefEligibleUpdates([update]);

    expect(eligible?.companyTickers).toEqual(["COHR"]);
    expect(
      eligible?.thesisImpacts.map((impact) => impact.companyTicker),
    ).toEqual(["COHR"]);
  });
});

describe("buildDailyBrief", () => {
  it("deduplicates model-selected references", () => {
    const result = buildDailyBrief(
      {
        title: "Signal",
        summary: "Summary",
        signal: "Signal",
        secondarySignals: ["One", "One"],
        updateIds: ["u1", "u1"],
        citationClaimIds: ["c1", "c1"],
      },
      "2026-06-27",
      NOW.toISOString(),
      "test-model",
    );
    expect(result.secondarySignals).toEqual(["One"]);
    expect(result.updateIds).toEqual(["u1"]);
  });
});
