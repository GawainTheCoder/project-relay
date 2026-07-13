import { describe, expect, it } from "vitest";

import type { BeliefSummary } from "../lib/api";
import { isRelatedCompanyThesis } from "../features/beliefs/macroAssociations";

function belief(
  overrides: Partial<BeliefSummary> & Pick<BeliefSummary, "id" | "kind">,
): BeliefSummary {
  return {
    awaitingEvaluationCount: 0,
    bottlenecks: [],
    captureMechanisms: [],
    companyTicker: null,
    companyTickers: [],
    confidence: 60,
    layerIds: [],
    momentum: "unchanged",
    nextReviewOn: null,
    opposingEvidenceCount: 0,
    pendingEvaluationCount: 0,
    portfolioExposures: [],
    statement: "Test thesis statement",
    supportingEvidenceCount: 0,
    title: "Test thesis",
    updatedAt: "2026-07-14T00:00:00.000Z",
    ...overrides,
  } as BeliefSummary;
}

describe("macro thesis company associations", () => {
  const gev = belief({
    companyTicker: "GEV",
    companyTickers: ["GEV"],
    id: "company-gev",
    kind: "company",
    layerIds: ["power-cooling", "materials-builders"],
  });

  it("does not infer a company from a shared layer when links are explicitly empty", () => {
    const space = belief({
      id: "macro-space-infrastructure",
      kind: "macro",
      layerIds: ["materials-builders"],
    });

    expect(isRelatedCompanyThesis(gev, space)).toBe(false);
  });

  it("uses explicit thesis and capture-mechanism links", () => {
    const power = belief({
      captureMechanisms: [
        {
          bottleneckKey: "grid-power",
          companyTicker: "GEV",
          key: "gev-grid",
          mechanism: "Grid equipment captures firm-power demand.",
          role: "beneficiary",
          sortOrder: 0,
        },
      ],
      id: "macro-power-cooling",
      kind: "macro",
    });

    expect(isRelatedCompanyThesis(gev, power)).toBe(true);
  });
});
