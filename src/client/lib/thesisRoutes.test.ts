import { describe, expect, it } from "vitest";

import {
  companyThesisPath,
  normalizeSearchResultHref,
} from "./thesisRoutes";

describe("companyThesisPath", () => {
  it("builds the canonical company thesis path from a ticker", () => {
    expect(companyThesisPath(" NVDA ")).toBe("/theses/company-nvda");
  });
});

describe("normalizeSearchResultHref", () => {
  it("routes legacy company search results to the canonical thesis", () => {
    expect(
      normalizeSearchResultHref({
        type: "company",
        id: "TSM",
        href: "/theses/TSM",
      }),
    ).toBe("/theses/company-tsm");
  });

  it("retains canonical thesis links and normalizes legacy update links", () => {
    expect(
      normalizeSearchResultHref({
        type: "thesis",
        id: "company-nvda",
        href: "/theses/company-nvda",
      }),
    ).toBe("/theses/company-nvda");
    expect(
      normalizeSearchResultHref({
        type: "update",
        id: "signal-1",
        href: "/updates?update=signal-1",
      }),
    ).toBe("/signals?update=signal-1");
  });
});
