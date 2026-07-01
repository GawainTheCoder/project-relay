import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { BeliefEvaluation } from "../../lib/api";
import { PendingEvaluations } from "./PendingEvaluations";

function makeEvaluation(
  overrides: Partial<BeliefEvaluation> = {},
): BeliefEvaluation {
  return {
    id: "evaluation-1",
    outcome: "reinforced",
    reviewStatus: "pending",
    proposedStatement: null,
    confidenceDelta: 2,
    rationale: "Independent evidence modestly reinforces the thesis.",
    reviewRecommendation: "accept",
    reviewRecommendationReason:
      "Two independent sources support the proposed confidence increase.",
    evidenceIds: ["claim-1", "claim-2"],
    createdAt: "2026-07-01T08:00:00.000Z",
    ...overrides,
  };
}

describe("PendingEvaluations", () => {
  it("renders the LLM recommendation and concise reason", () => {
    const markup = renderToStaticMarkup(
      <PendingEvaluations
        evaluations={[makeEvaluation()]}
        onReview={async () => undefined}
      />,
    );

    expect(markup).toContain("LLM suggestion:");
    expect(markup).toContain("Accept");
    expect(markup).toContain(
      "Two independent sources support the proposed confidence increase.",
    );
  });

  it("renders a reject recommendation and its reason", () => {
    const markup = renderToStaticMarkup(
      <PendingEvaluations
        evaluations={[
          makeEvaluation({
            reviewRecommendation: "reject",
            reviewRecommendationReason:
              "The proposal overstates what the cited evidence supports.",
          }),
        ]}
        onReview={async () => undefined}
      />,
    );

    expect(markup).toContain("LLM suggestion:");
    expect(markup).toContain("Reject");
    expect(markup).toContain(
      "The proposal overstates what the cited evidence supports.",
    );
  });

  it("labels legacy evaluations without a stored recommendation", () => {
    const markup = renderToStaticMarkup(
      <PendingEvaluations
        evaluations={[
          makeEvaluation({
            reviewRecommendation: null,
            reviewRecommendationReason: null,
          }),
        ]}
        onReview={async () => undefined}
      />,
    );

    expect(markup).toContain(
      "LLM suggestion unavailable for this earlier evaluation.",
    );
  });
});
