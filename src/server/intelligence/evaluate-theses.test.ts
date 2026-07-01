import OpenAI from "openai";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildThesisEvaluationBatch,
  evaluateTheses,
  type ThesisEvaluationInput,
} from "./evaluate-theses.js";
import {
  EvidenceValidationError,
  IntelligenceConfigurationError,
  IntelligenceRefusalError,
} from "./errors.js";
import type { ThesisEvaluationOutput } from "./schemas.js";

const NOW = new Date("2026-06-30T08:00:00.000Z");

function makeInput(): ThesisEvaluationInput {
  return {
    theses: [
      {
        id: "thesis_networking",
        type: "macro",
        title: "Networking is becoming the bottleneck",
        currentVersion: {
          id: "thesis-version_networking_1",
          belief:
            "Network bandwidth is increasingly constraining large AI clusters.",
          confidenceScore: 70,
          unknowns: ["How quickly 1.6T deployments relieve congestion"],
          strengthenConditions: ["Sustained high-speed optics lead times"],
          weakenConditions: ["Falling network utilization"],
        },
        companyTickers: ["ANET", "AVGO", "COHR"],
        layerIds: ["networking", "optics"],
      },
    ],
    signals: [
      {
        id: "signal_arista",
        title: "Arista reports accelerated AI networking demand",
        publishedAt: "2026-06-29T00:00:00.000Z",
        sourceProvenance: {
          id: "arista",
          publisher: "Arista Networks",
          authorityTier: "first-party",
        },
        companyTickers: ["ANET"],
        layerIds: ["networking"],
        whatHappened: "AI networking demand accelerated.",
        whyItMatters: "Cluster scale is increasing network requirements.",
        macroThesisImpacts: [
          {
            thesisId: "thesis_networking",
            relevance: "primary",
            stance: "supports",
            rationale:
              "Direct first-party evidence of rising AI network demand.",
            claimIds: ["claim_arista_demand"],
          },
        ],
        claims: [
          {
            id: "claim_arista_demand",
            quote:
              "AI networking revenue grew faster than our prior expectations.",
            locator: "P3",
          },
        ],
      },
      {
        id: "signal_lightcounting",
        title: "800G and 1.6T demand remains supply constrained",
        publishedAt: "2026-06-30T00:00:00.000Z",
        sourceProvenance: {
          id: "lightcounting",
          publisher: "LightCounting",
          authorityTier: "specialist",
        },
        companyTickers: ["COHR"],
        layerIds: ["optics"],
        whatHappened: "High-speed optical demand remains supply constrained.",
        whyItMatters: "Optical availability can limit network deployment.",
        macroThesisImpacts: [
          {
            thesisId: "thesis_networking",
            relevance: "context",
            stance: "context",
            rationale:
              "Optical supply is useful context for network deployment.",
            claimIds: ["claim_optics_supply"],
          },
        ],
        claims: [
          {
            id: "claim_optics_supply",
            quote:
              "Supply of leading-edge optical components remains constrained.",
            locator: "P7",
          },
        ],
      },
    ],
  };
}

function makeEvaluation(
  overrides: Partial<ThesisEvaluationOutput["evaluations"][number]> = {},
): ThesisEvaluationOutput["evaluations"][number] {
  return {
    thesisId: "thesis_networking",
    previousVersionId: "thesis-version_networking_1",
    outcome: "unchanged",
    proposedBelief: null,
    proposedConfidenceScore: 70,
    confidenceDelta: 0,
    rationale:
      "The evidence is consistent with the belief but does not change its scope or confidence.",
    supportingEvidence: [
      {
        signalId: "signal_arista",
        claimIds: ["claim_arista_demand"],
        reason: "Arista reports stronger AI networking demand.",
      },
    ],
    opposingEvidence: [],
    contextEvidence: [],
    unknowns: ["How quickly 1.6T deployments relieve congestion"],
    strengthenConditions: ["Sustained high-speed optics lead times"],
    weakenConditions: ["Falling network utilization"],
    ...overrides,
  };
}

function mockClient(
  output: ThesisEvaluationOutput | null,
  refusal?: string,
): OpenAI {
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

describe("evaluateTheses", () => {
  it("returns validated evaluations with flattened evidence provenance", async () => {
    const evaluation = makeEvaluation({
      outcome: "reinforced",
      proposedConfidenceScore: 75,
      confidenceDelta: 5,
    });
    const client = mockClient({ evaluations: [evaluation] });

    const result = await evaluateTheses(makeInput(), {
      client,
      now: () => NOW,
      idFactory: () => "evaluation_1",
    });

    expect(result).toEqual({
      evaluatedAt: NOW.toISOString(),
      model: "gpt-5.5",
      evaluations: [
        expect.objectContaining({
          id: "evaluation_1",
          outcome: "reinforced",
          proposedBelief: null,
          proposedConfidenceScore: 75,
          signalIds: ["signal_arista"],
          claimIds: ["claim_arista_demand"],
          independentSourceCount: 1,
          evaluatedAt: NOW.toISOString(),
          model: "gpt-5.5",
        }),
      ],
    });
    expect(client.responses.parse).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-5.5",
        store: true,
        metadata: expect.objectContaining({
          relay_operation: "thesis_evaluation",
          relay_thesis_count: "1",
          relay_macro_thesis_count: "1",
          relay_company_thesis_count: "0",
          relay_evidence_signal_count: "2",
          relay_evidence_claim_count: "2",
        }),
        input: expect.stringContaining('"sourceProvenance"'),
        max_output_tokens: 12_000,
      }),
    );
  });

  it("returns an empty batch without calling OpenAI when there is no evidence", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const input = makeInput();
    input.signals = [];

    await expect(
      evaluateTheses(input, { now: () => NOW }),
    ).resolves.toEqual({
      evaluatedAt: NOW.toISOString(),
      model: "gpt-5.5",
      evaluations: [],
    });
  });

  it("supports disabling Platform response storage", async () => {
    vi.stubEnv("OPENAI_STORE_RESPONSES", "off");
    const client = mockClient({ evaluations: [makeEvaluation()] });

    await evaluateTheses(makeInput(), { client });

    expect(client.responses.parse).toHaveBeenCalledWith(
      expect.objectContaining({
        store: false,
        metadata: expect.objectContaining({
          relay_operation: "thesis_evaluation",
        }),
      }),
    );
  });

  it("surfaces model refusals safely", async () => {
    await expect(
      evaluateTheses(makeInput(), {
        client: mockClient(null, "I cannot evaluate this evidence."),
      }),
    ).rejects.toBeInstanceOf(IntelligenceRefusalError);
  });

  it("requires a configured or injected OpenAI client when evidence exists", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");

    await expect(evaluateTheses(makeInput())).rejects.toBeInstanceOf(
      IntelligenceConfigurationError,
    );
  });
});

describe("buildThesisEvaluationBatch", () => {
  function build(
    evaluation: ThesisEvaluationOutput["evaluations"][number],
    input = makeInput(),
  ) {
    return buildThesisEvaluationBatch(
      input,
      { evaluations: [evaluation] },
      NOW.toISOString(),
      "test-model",
    );
  }

  it("accepts a revised belief only with independent corroboration", () => {
    const input = makeInput();
    input.signals[1]!.macroThesisImpacts[0] = {
      thesisId: "thesis_networking",
      relevance: "secondary",
      stance: "supports",
      rationale:
        "Independent optical supply evidence supports the data-movement thesis.",
      claimIds: ["claim_optics_supply"],
    };
    const result = build(
      makeEvaluation({
        outcome: "revised",
        proposedBelief:
          "Data movement, including network and optical capacity, is becoming the binding constraint for large AI clusters.",
        proposedConfidenceScore: 76,
        confidenceDelta: 6,
        supportingEvidence: [
          {
            signalId: "signal_arista",
            claimIds: ["claim_arista_demand"],
            reason: "First-party networking demand evidence.",
          },
          {
            signalId: "signal_lightcounting",
            claimIds: ["claim_optics_supply"],
            reason: "Independent optical supply evidence.",
          },
        ],
        unknowns: ["When deployments materially relieve data movement limits"],
        strengthenConditions: ["Persistent network and optical constraints"],
      }),
      input,
    );

    expect(result.evaluations[0]).toEqual(
      expect.objectContaining({
        outcome: "revised",
        independentSourceCount: 2,
        signalIds: ["signal_arista", "signal_lightcounting"],
        claimIds: ["claim_arista_demand", "claim_optics_supply"],
      }),
    );
  });

  it("changes the deterministic evaluation ID when proposal reasoning changes", () => {
    const baseline = build(makeEvaluation()).evaluations[0];
    const revisedRationale = build(
      makeEvaluation({
        rationale:
          "The same claim remains below the threshold, but the unresolved deployment timing is now the controlling uncertainty.",
      }),
    ).evaluations[0];

    expect(baseline?.id).not.toBe(revisedRationale?.id);
  });

  it("rejects a revised belief supported by only one provenance", () => {
    expect(() =>
      build(
        makeEvaluation({
          outcome: "revised",
          proposedBelief:
            "Data movement is now the binding constraint for large AI clusters.",
          proposedConfidenceScore: 75,
          confidenceDelta: 5,
        }),
      ),
    ).toThrow("requires at least two independent sources");
  });

  it("rejects unknown signals and claims outside their referenced signal", () => {
    expect(() =>
      build(
        makeEvaluation({
          supportingEvidence: [
            {
              signalId: "signal_unknown",
              claimIds: ["claim_arista_demand"],
              reason: "Unknown evidence.",
            },
          ],
        }),
      ),
    ).toThrow("unknown signal");

    expect(() =>
      build(
        makeEvaluation({
          supportingEvidence: [
            {
              signalId: "signal_arista",
              claimIds: ["claim_optics_supply"],
              reason: "Misattributed evidence.",
            },
          ],
        }),
      ),
    ).toThrow("outside its referenced signal");
  });

  it("rejects duplicate citations across supporting and opposing evidence", () => {
    expect(() =>
      build(
        makeEvaluation({
          opposingEvidence: [
            {
              signalId: "signal_arista",
              claimIds: ["claim_arista_demand"],
              reason: "The same evidence cannot have both stances.",
            },
          ],
        }),
      ),
    ).toThrow("same claim more than once");
  });

  it("rejects stale versions and confidence-delta mismatches", () => {
    expect(() =>
      build(
        makeEvaluation({
          previousVersionId: "thesis-version_stale",
        }),
      ),
    ).toThrow("stale or unknown thesis version");

    expect(() =>
      build(
        makeEvaluation({
          outcome: "reinforced",
          proposedConfidenceScore: 75,
          confidenceDelta: 3,
        }),
      ),
    ).toThrow("delta does not match");
  });

  it("enforces exact no-change semantics", () => {
    expect(() =>
      build(
        makeEvaluation({
          proposedBelief:
            "Network bandwidth has become the only constraint on AI clusters.",
        }),
      ),
    ).toThrow("Only a revised thesis");

    expect(() =>
      build(
        makeEvaluation({
          proposedConfidenceScore: 71,
          confidenceDelta: 1,
        }),
      ),
    ).toThrow("unchanged thesis cannot change confidence");
  });

  it("requires directional evidence for confidence movement", () => {
    const opposingInput = makeInput();
    opposingInput.signals[0]!.macroThesisImpacts[0] = {
      ...opposingInput.signals[0]!.macroThesisImpacts[0]!,
      stance: "opposes",
    };
    expect(() =>
      build(
        makeEvaluation({
          outcome: "reinforced",
          proposedConfidenceScore: 75,
          confidenceDelta: 5,
          supportingEvidence: [],
          opposingEvidence: [
            {
              signalId: "signal_arista",
              claimIds: ["claim_arista_demand"],
              reason: "Wrong evidence direction.",
            },
          ],
        }),
        opposingInput,
      ),
    ).toThrow("requires supporting evidence");

    expect(() =>
      build(
        makeEvaluation({
          outcome: "weakened",
          proposedConfidenceScore: 65,
          confidenceDelta: -5,
        }),
      ),
    ).toThrow("requires opposing evidence");
  });

  it("rejects duplicate immutable input identifiers", () => {
    const input = makeInput();
    input.signals[1]!.claims[0]!.id = "claim_arista_demand";

    expect(() => build(makeEvaluation(), input)).toThrow(
      "Evidence claim IDs must be globally unique",
    );
  });

  it("rejects malformed model output with a safe validation error", () => {
    const malformed = {
      ...makeEvaluation(),
      proposedConfidenceScore: 101,
    } as ThesisEvaluationOutput["evaluations"][number];

    expect(() => build(malformed)).toThrow(EvidenceValidationError);
    expect(() => build(malformed)).toThrow(
      "invalid structured result",
    );
  });
});
