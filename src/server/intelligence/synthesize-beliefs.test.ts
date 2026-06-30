import OpenAI from "openai";
import { describe, expect, it, vi } from "vitest";

import type {
  IntelligenceUpdate,
  Thesis,
  ThesisEvaluation,
} from "../../shared/contracts.js";
import { EvidenceValidationError } from "./errors.js";
import type { DailyBriefOutput } from "./schemas.js";
import { synthesizeBeliefBrief } from "./synthesize-beliefs.js";

const NOW = new Date("2026-06-30T10:00:00.000Z");

function makeUpdate(): IntelligenceUpdate {
  return {
    id: "signal-networking",
    title: "Network lead times extend",
    publisher: "Example Research",
    sourceUrl: "https://example.com/networking",
    publishedAt: "2026-06-30T08:00:00.000Z",
    ingestedAt: "2026-06-30T09:00:00.000Z",
    layerIds: ["networking"],
    companyTickers: ["ANET"],
    materiality: "high",
    materialityReason: "Lead times changed the bottleneck view.",
    novelty: "new",
    sentiment: "bullish",
    whatHappened: "Network lead times increased.",
    whyItMatters: "Data movement may constrain deployments.",
    beneficiaries: ["ANET"],
    threatened: ["Deployment timing"],
    watchNext: ["800G lead times"],
    claims: [
      {
        id: "claim-networking",
        quote: "Network lead times increased through the quarter.",
        sourceId: "source-networking",
        locator: "P1",
      },
    ],
    thesisImpacts: [],
    model: "analysis-model",
  };
}

function makeEvaluation(
  outcome: ThesisEvaluation["outcome"] = "revised",
): ThesisEvaluation {
  return {
    id: `evaluation-${outcome}`,
    thesisId: "macro-networking",
    previousVersionId: "macro-networking-v1",
    acceptedVersionId: null,
    outcome,
    summary:
      outcome === "unchanged"
        ? "The evidence did not clear the change threshold."
        : "Data movement became a more important deployment constraint.",
    rationale: "The cited lead-time evidence changes the bottleneck view.",
    proposedBelief:
      outcome === "unchanged"
        ? "Networking may become a bottleneck."
        : "Data movement is becoming the bottleneck.",
    previousConfidenceScore: 60,
    proposedConfidenceScore: outcome === "unchanged" ? 60 : 66,
    confidenceDelta: outcome === "unchanged" ? 0 : 6,
    proposedUnknowns: ["Duration of the constraint"],
    proposedStrengtheningConditions: ["Lead times remain elevated"],
    proposedWeakeningConditions: ["Capacity catches demand"],
    signalIds: ["signal-networking"],
    claimIds: ["claim-networking"],
    evidence: [
      {
        claimId: "claim-networking",
        stance: "supports",
        rationale: "Lead times indicate constrained capacity.",
      },
    ],
    reviewStatus: "pending",
    reviewNote: null,
    model: "evaluation-model",
    createdAt: NOW.toISOString(),
    reviewedAt: null,
  };
}

function makeThesis(): Thesis {
  const currentVersion = {
    id: "macro-networking-v1",
    thesisId: "macro-networking",
    version: 1,
    belief: "Networking may become a bottleneck.",
    confidenceScore: 60,
    unknowns: ["Duration of the constraint"],
    strengtheningConditions: ["Lead times remain elevated"],
    weakeningConditions: ["Capacity catches demand"],
    createdAt: "2026-06-01T00:00:00.000Z",
    createdByEvaluationId: null,
  };
  return {
    id: "macro-networking",
    kind: "macro",
    title: "Data movement bottleneck",
    status: "active",
    currentVersion,
    versions: [currentVersion],
    companyTickers: ["ANET"],
    layerIds: ["networking"],
    evidence: [],
    evaluations: [],
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
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

describe("synthesizeBeliefBrief", () => {
  it("records evaluated evidence while deterministically saying nothing changed", async () => {
    const client = mockClient({
      title: "Should not run",
      summary: "Should not run",
      signal: "Should not run",
      secondarySignals: [],
      updateIds: [],
      citationClaimIds: [],
    });

    const brief = await synthesizeBeliefBrief(
      [makeEvaluation("unchanged")],
      [makeThesis()],
      [makeUpdate()],
      { client, now: () => NOW },
    );

    expect(brief).toMatchObject({
      title: "No meaningful change",
      updateIds: ["signal-networking"],
      citationClaimIds: ["claim-networking"],
      thesisEvaluationIds: ["evaluation-unchanged"],
    });
    expect(client.responses.parse).not.toHaveBeenCalled();
  });

  it("synthesizes belief deltas and preserves their evaluation links", async () => {
    const output: DailyBriefOutput = {
      title: "Data movement moved closer to the bottleneck",
      summary:
        "The evidence raises the importance of networking constraints.",
      signal:
        "A pending evaluation proposes revising the networking bottleneck belief.",
      secondarySignals: [],
      updateIds: ["signal-networking"],
      citationClaimIds: ["claim-networking"],
    };

    const brief = await synthesizeBeliefBrief(
      [makeEvaluation()],
      [makeThesis()],
      [makeUpdate()],
      { client: mockClient(output), now: () => NOW },
    );

    expect(brief).toMatchObject({
      title: output.title,
      thesisEvaluationIds: ["evaluation-revised"],
      updateIds: ["signal-networking"],
      citationClaimIds: ["claim-networking"],
    });
  });

  it("rejects citations outside the evaluated evidence chain", async () => {
    const output: DailyBriefOutput = {
      title: "Unsupported change",
      summary: "Unsupported",
      signal: "Unsupported",
      secondarySignals: [],
      updateIds: ["signal-networking"],
      citationClaimIds: ["claim-unknown"],
    };

    await expect(
      synthesizeBeliefBrief(
        [makeEvaluation()],
        [makeThesis()],
        [makeUpdate()],
        { client: mockClient(output), now: () => NOW },
      ),
    ).rejects.toBeInstanceOf(EvidenceValidationError);
  });
});
