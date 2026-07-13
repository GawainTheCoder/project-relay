import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { DashboardPayload } from "../../../shared/contracts";
import { useBeliefs } from "./useBeliefs";

const dashboard: DashboardPayload = {
  brief: null,
  companies: [
    {
      breaksThesis: ["Demand weakens"],
      confidence: "medium",
      description: "Test company",
      layerIds: ["materials-builders"],
      name: "GE Vernova",
      provesRight: ["Demand strengthens"],
      thesis: "Grid investment remains durable.",
      ticker: "GEV",
      updatedAt: "2026-07-14T00:00:00.000Z",
      watchMetrics: ["Backlog"],
      whyItMatters: "Power is on the data-center critical path.",
    },
  ],
  demoData: false,
  layers: [],
  sourceCoverage: [],
  sources: [],
  updates: [],
};

function BeliefStateProbe() {
  const state = useBeliefs(dashboard);
  return (
    <output data-loading={String(state.isLoading)}>
      {state.beliefs.length}
    </output>
  );
}

describe("useBeliefs", () => {
  it("marks the company-only compatibility model as loading until canonical theses resolve", () => {
    const markup = renderToStaticMarkup(<BeliefStateProbe />);

    expect(markup).toContain('data-loading="true"');
    expect(markup).toContain(">1</output>");
  });
});
