import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import type { PortfolioReadModel } from "../../../shared/contracts";
import { PortfolioAllocationPanel } from "./PortfolioAllocationPanel";

const thesisExposures = ["memory", "networking", "custom-silicon"].map(
  (name, sortOrder) => ({
    captureMechanism: `${name} exposure`,
    exposureType: "diversified" as const,
    portfolioItemId: "portfolio-smh",
    sortOrder,
    thesisId: `macro-${name}`,
    thesisTitle: `${name} thesis`,
  }),
);

const holding: PortfolioReadModel["holdings"][number] = {
  allocationBps: 2_000,
  allocationPercent: 20,
  assetType: "etf",
  companyTicker: null,
  createdAt: "2026-07-14T00:00:00.000Z",
  id: "portfolio-smh",
  latestDecision: null,
  name: "VanEck Semiconductor ETF",
  status: "holding",
  symbol: "SMH",
  thesisExposures,
  updatedAt: "2026-07-14T00:00:00.000Z",
};

const portfolio: PortfolioReadModel = {
  allocationBasis: "illustrative-seed",
  allocationNote: "Illustrative allocation",
  holdings: [holding],
  items: [holding],
  overlaps: [],
  watchlist: [],
};

describe("PortfolioAllocationPanel", () => {
  it("pluralizes multiple linked macro theses correctly", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <PortfolioAllocationPanel
          error={null}
          isLoading={false}
          onRetry={() => undefined}
          portfolio={portfolio}
        />
      </MemoryRouter>,
    );

    expect(markup).toContain("3 linked macro theses");
    expect(markup).not.toContain("thesises");
  });
});
