import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import type { BeliefSummary } from "../../lib/api";
import { ThesisExposureList } from "./ThesisExposureList";

const macroThesis: BeliefSummary = {
  awaitingEvaluationCount: 0,
  bottlenecks: [],
  captureMechanisms: [],
  companyTicker: null,
  companyTickers: [],
  confidence: 65,
  id: "macro-space-infrastructure",
  kind: "macro",
  layerIds: ["materials-builders"],
  momentum: "unchanged",
  nextReviewOn: null,
  opposingEvidenceCount: 0,
  pendingEvaluationCount: 0,
  portfolioExposures: [],
  statement: "Reusable launch cadence can compound space economics.",
  supportingEvidenceCount: 0,
  title: "Reusable launch compounds space economics",
  updatedAt: "2026-07-14T00:00:00.000Z",
};

function renderState({
  error,
  isLoading,
}: {
  error: string | null;
  isLoading: boolean;
}) {
  return renderToStaticMarkup(
    <MemoryRouter>
      <ThesisExposureList
        beliefs={[macroThesis]}
        error={error}
        isLoading={isLoading}
        onRetry={() => undefined}
        portfolio={null}
      />
    </MemoryRouter>,
  );
}

describe("ThesisExposureList", () => {
  it("does not present missing portfolio data as a zero-allocation result", () => {
    const loadingMarkup = renderState({ error: null, isLoading: true });
    const errorMarkup = renderState({
      error: "Portfolio API unavailable",
      isLoading: false,
    });

    expect(loadingMarkup).toContain("Loading linked portfolio allocations");
    expect(loadingMarkup).not.toContain("No current holding");
    expect(errorMarkup).toContain("Portfolio exposure unavailable");
    expect(errorMarkup).toContain("Retry exposure");
    expect(errorMarkup).not.toContain("No current holding");
  });
});
