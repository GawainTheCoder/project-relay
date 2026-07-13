import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import type {
  ThesisEvaluation,
  ThesisReview,
} from "../../../shared/contracts";
import { ReviewDetailPanel } from "./ReviewDetailPanel";
import { evaluationMomentum } from "./reviewPresentation";

function evaluation(
  overrides: Partial<ThesisEvaluation> = {},
): ThesisEvaluation {
  return {
    id: "evaluation-memory",
    thesisId: "memory-thesis",
    previousVersionId: "version-1",
    acceptedVersionId: null,
    outcome: "reinforced",
    summary: "Memory constraints are becoming more material.",
    rationale: "Primary evidence points to a persistent supply constraint.",
    proposedBelief: "Memory remains a binding AI infrastructure bottleneck.",
    previousConfidenceScore: 70,
    proposedConfidenceScore: 78,
    confidenceDelta: 8,
    proposedUnknowns: [],
    proposedStrengtheningConditions: [],
    proposedWeakeningConditions: [],
    signalIds: ["signal-1"],
    claimIds: [],
    evidence: [],
    reviewRecommendation: "accept",
    reviewRecommendationReason: "The evidence is direct.",
    reviewStatus: "pending",
    reviewNote: null,
    nextReviewOn: null,
    portfolioDecisions: [],
    model: "test-model",
    createdAt: "2026-07-14T08:00:00.000Z",
    reviewedAt: null,
    ...overrides,
  };
}

const review: ThesisReview = {
  evaluation: evaluation(),
  thesisTitle: "AI memory bandwidth remains constrained",
  thesisKind: "macro",
  momentum: "strengthening",
  whatChanged: "New primary evidence strengthened the constraint thesis.",
  affectedPortfolioItems: [
    {
      id: "smh",
      symbol: "SMH",
      name: "VanEck Semiconductor ETF",
      status: "holding",
      allocationPercent: 20,
    },
    {
      id: "avgo",
      symbol: "AVGO",
      name: "Broadcom",
      status: "watchlist",
      allocationPercent: null,
    },
  ],
};

describe("ReviewDetailPanel", () => {
  it("separates required holding decisions from optional future candidates", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <ReviewDetailPanel
          onCompleted={async () => undefined}
          review={review}
          updates={[]}
        />
      </MemoryRouter>,
    );

    expect(markup).toContain("Current holdings");
    expect(markup).toContain("Decision and rationale required when accepting");
    expect(markup).toContain("Future candidates");
    expect(markup).toContain("Optional · rationale required only when choosing an action");
    expect(markup).toContain("No action");
  });
});

describe("evaluationMomentum", () => {
  it("derives strengthening, unchanged, and weakening without persisting a second score", () => {
    expect(evaluationMomentum(evaluation({ outcome: "reinforced" }))).toBe(
      "strengthening",
    );
    expect(evaluationMomentum(evaluation({ outcome: "unchanged" }))).toBe(
      "unchanged",
    );
    expect(evaluationMomentum(evaluation({ outcome: "contradicted" }))).toBe(
      "weakening",
    );
    expect(
      evaluationMomentum(
        evaluation({ outcome: "revised", confidenceDelta: -4 }),
      ),
    ).toBe("weakening");
  });
});
