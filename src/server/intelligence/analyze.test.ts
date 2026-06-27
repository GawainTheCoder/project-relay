import OpenAI from "openai";
import { afterEach, describe, expect, it, vi } from "vitest";

import { normalizeManualDocument } from "../ingestion/normalize.js";
import { analyzeDocument, buildIntelligenceUpdate } from "./analyze.js";
import {
  EvidenceValidationError,
  IntelligenceConfigurationError,
  IntelligenceRefusalError,
} from "./errors.js";
import {
  analysisOutputSchema,
  type AnalysisOutput,
} from "./schemas.js";

const NOW = new Date("2026-06-27T08:00:00.000Z");

function makeDocument() {
  return normalizeManualDocument(
    {
      title: "Optical component demand rises",
      publisher: "Example Research",
      sourceUrl: "https://example.com/report?utm_source=newsletter",
      publishedAt: "2026-06-27",
      content:
        "Orders for 1.6T optical components doubled year over year.\n\nManagement expects supply to remain constrained through December.",
    },
    { now: () => NOW, sourceId: "source_1" },
  );
}

function makeOutput(): AnalysisOutput {
  return {
    layerIds: ["optics"],
    companyTickers: [" cohr ", "LITE"],
    materiality: "high",
    sentiment: "bullish",
    groundedSummary: "Demand for faster optical components increased.",
    inference: {
      whyItMatters: "Optics may become a binding data-center bottleneck.",
      beneficiaries: ["Coherent"],
      threatened: ["Data-center deployment schedules"],
      watchNext: ["1.6T shipment lead times"],
    },
    claims: [
      {
        quote: "Orders for 1.6T optical components doubled year over year.",
        locator: "P99",
      },
    ],
    thesisImpacts: [
      {
        companyTicker: "cohr",
        direction: "bullish",
        summary: "Tighter optical supply supports pricing power.",
        confidence: "medium",
        horizon: "6-12 months",
      },
    ],
  };
}

function mockClient(output: AnalysisOutput | null, refusal?: string): OpenAI {
  return {
    responses: {
      parse: vi.fn().mockResolvedValue({
        output_parsed: output,
        output: refusal
          ? [{ type: "message", content: [{ type: "refusal", refusal }] }]
          : [],
      }),
    },
  } as unknown as OpenAI;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("analyzeDocument", () => {
  it("returns a contract-compatible update with source-verified evidence", async () => {
    const client = mockClient(makeOutput());
    const result = await analyzeDocument(makeDocument(), {
      client,
      now: () => NOW,
      idFactory: () => "update_1",
    });

    expect(result.id).toBe("update_1");
    expect(result.companyTickers).toEqual(["COHR", "LITE"]);
    expect(result.claims).toEqual([
      expect.objectContaining({
        quote: "Orders for 1.6T optical components doubled year over year.",
        locator: "P1",
        sourceId: "source_1",
      }),
    ]);
    expect(result.thesisImpacts[0]).toEqual(
      expect.objectContaining({
        companyTicker: "COHR",
        decision: "proposed",
      }),
    );
    expect(result.model).toBe("gpt-5.4-mini");
    expect(client.responses.parse).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-5.4-mini",
        store: false,
      }),
    );
  });

  it("rejects generated quotes that are not verbatim in the source", async () => {
    const output = makeOutput();
    output.claims[0] = {
      quote: "Optics revenue tripled.",
      locator: "P1",
    };

    await expect(
      analyzeDocument(makeDocument(), {
        client: mockClient(output),
        now: () => NOW,
      }),
    ).rejects.toBeInstanceOf(EvidenceValidationError);
  });

  it("rejects trivial evidence quotes in structured output", () => {
    const output = makeOutput();
    output.claims[0] = { quote: "O", locator: "P1" };

    expect(analysisOutputSchema.safeParse(output).success).toBe(false);
  });

  it("rejects trivial evidence quotes when the builder is called directly", () => {
    const output = makeOutput();
    output.claims[0] = { quote: "O", locator: "P1" };

    expect(() =>
      buildIntelligenceUpdate(
        makeDocument(),
        output,
        "update_1",
        NOW.toISOString(),
        "gpt-5.4-mini",
      ),
    ).toThrow("at least 20 characters");
  });

  it("surfaces model refusals without logging source or secrets", async () => {
    await expect(
      analyzeDocument(makeDocument(), {
        client: mockClient(null, "I cannot analyze this document."),
      }),
    ).rejects.toBeInstanceOf(IntelligenceRefusalError);
  });

  it("fails clearly when no API key or injected client exists", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");

    await expect(analyzeDocument(makeDocument())).rejects.toBeInstanceOf(
      IntelligenceConfigurationError,
    );
  });
});
