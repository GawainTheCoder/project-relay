import OpenAI from "openai";
import { afterEach, describe, expect, it, vi } from "vitest";

import { normalizeManualDocument } from "../ingestion/normalize.js";
import {
  analyzeDocument,
  buildIntelligenceUpdate,
  type AnalysisContext,
} from "./analyze.js";
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
    materialityReason:
      "New order evidence increases confidence that optics supply is a near-term bottleneck.",
    novelty: "new",
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
        thesisDelta:
          "The COHR thesis moves from expected demand growth to evidence of realized order acceleration and tighter supply.",
        confidence: "medium",
        horizon: "6-12 months",
      },
    ],
  };
}

function makeContext(): AnalysisContext {
  return {
    watchlistCompanies: [
      {
        ticker: "COHR",
        thesis: "AI clusters require sustained growth in optical connectivity.",
        provesRight: ["1.6T order growth", "Longer optical lead times"],
        breaksThesis: ["Falling high-speed optics demand"],
        watchMetrics: ["1.6T orders", "Lead times"],
      },
      {
        ticker: "LITE",
        thesis: "High-speed optical demand expands the addressable market.",
        provesRight: ["Datacenter order growth"],
        breaksThesis: ["Share loss"],
        watchMetrics: ["Cloud revenue"],
      },
    ],
    recentSignals: [
      {
        id: "update_previous",
        title: "Optics lead times stabilize",
        publishedAt: "2026-06-20T00:00:00.000Z",
        companyTickers: ["COHR"],
        materiality: "not-material",
        whatHappened: "Lead times were unchanged.",
        thesisImpacts: [],
      },
    ],
    sourceProfile: {
      id: "example-research",
      name: "Example Research",
      role: "primary",
      authorityTier: "specialist",
      priority: 90,
      layerIds: ["optics"],
      companyTickers: ["COHR", "LITE"],
    },
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
      context: makeContext(),
    });

    expect(result.id).toBe("update_1");
    expect(result.companyTickers).toEqual(["COHR", "LITE"]);
    expect(result.novelty).toBe("new");
    expect(result.materialityReason).toContain("near-term bottleneck");
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
        thesisDelta: expect.stringContaining("realized order acceleration"),
        decision: "proposed",
      }),
    );
    expect(result.model).toBe("gpt-5.4-mini");
    expect(client.responses.parse).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-5.4-mini",
        store: false,
        input: expect.stringContaining('"watchlistCompanies"'),
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
        context: makeContext(),
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
        makeContext(),
      ),
    ).toThrow("at least 20 characters");
  });

  it("rejects material output when watchlist thesis context is absent", () => {
    expect(() =>
      buildIntelligenceUpdate(
        makeDocument(),
        makeOutput(),
        "update_1",
        NOW.toISOString(),
        "gpt-5.4-mini",
      ),
    ).toThrow("requires watchlist thesis context");
  });

  it("rejects thesis impacts for companies outside the watchlist", () => {
    const output = makeOutput();
    output.thesisImpacts = [
      {
        ...output.thesisImpacts[0]!,
        companyTicker: "NVDA",
      },
    ];
    output.companyTickers.push("NVDA");

    expect(() =>
      buildIntelligenceUpdate(
        makeDocument(),
        output,
        "update_1",
        NOW.toISOString(),
        "gpt-5.4-mini",
        makeContext(),
      ),
    ).toThrow("outside the watchlist context");
  });

  it("rejects actionable impacts on a not-material update", () => {
    const output = makeOutput();
    output.materiality = "not-material";
    output.sentiment = "not-material";

    expect(() =>
      buildIntelligenceUpdate(
        makeDocument(),
        output,
        "update_1",
        NOW.toISOString(),
        "gpt-5.4-mini",
        makeContext(),
      ),
    ).toThrow("cannot contain actionable thesis impacts");
  });

  it("accepts not-material evidence with no actionable impacts", () => {
    const output = makeOutput();
    output.materiality = "not-material";
    output.sentiment = "not-material";
    output.novelty = "repetition";
    output.thesisImpacts = [];

    const result = buildIntelligenceUpdate(
      makeDocument(),
      output,
      "update_1",
      NOW.toISOString(),
      "gpt-5.4-mini",
    );

    expect(result.materiality).toBe("not-material");
    expect(result.thesisImpacts).toEqual([]);
  });

  it("rejects repeated evidence classified as material", () => {
    const output = makeOutput();
    output.novelty = "repetition";

    expect(() =>
      buildIntelligenceUpdate(
        makeDocument(),
        output,
        "update_1",
        NOW.toISOString(),
        "gpt-5.4-mini",
        makeContext(),
      ),
    ).toThrow("Repeated evidence cannot be classified as a material update");
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
