import OpenAI from "openai";
import { describe, expect, it, vi } from "vitest";

import type { IntelligenceUpdate } from "../../shared/contracts.js";
import { EvidenceValidationError } from "./errors.js";
import {
  buildDailyBrief,
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
    thesisImpacts: [],
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
        store: false,
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
