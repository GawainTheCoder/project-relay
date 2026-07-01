import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import type { IntelligenceUpdate } from "../../../shared/contracts";
import { ThesisDecisionPanel } from "./ThesisDecisionPanel";

const update: IntelligenceUpdate = {
  id: "signal-1",
  title: "New accelerator evidence",
  publisher: "Primary source",
  sourceUrl: "https://example.com/evidence",
  publishedAt: "2026-07-01T07:00:00.000Z",
  ingestedAt: "2026-07-01T08:00:00.000Z",
  layerIds: ["accelerators"],
  companyTickers: ["NVDA"],
  materiality: "high",
  materialityReason: "The evidence bears directly on the company thesis.",
  novelty: "new",
  sentiment: "bullish",
  whatHappened: "The supplier reported stronger platform adoption.",
  whyItMatters: "Platform adoption affects durable economics.",
  beneficiaries: ["NVDA"],
  threatened: [],
  watchNext: ["Attach rates"],
  claims: [
    {
      id: "claim-1",
      quote: "Platform attach rates increased during the quarter.",
      sourceId: "source-1",
      locator: "paragraph 4",
    },
  ],
  thesisImpacts: [
    {
      id: "impact-1",
      companyTicker: "NVDA",
      direction: "bullish",
      summary: "The source proposes a positive company-thesis impact.",
      confidence: "high",
      horizon: "12 months",
      thesisDelta: "Platform adoption is broadening.",
      decision: "proposed",
    },
  ],
  macroThesisImpacts: [],
  model: "test-model",
};

describe("ThesisDecisionPanel", () => {
  it("links a routed company impact to its canonical persisted thesis", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <ThesisDecisionPanel
          macroThesisTitles={{}}
          onReview={async () => undefined}
          selectedClaimId={null}
          update={update}
        />
      </MemoryRouter>,
    );

    expect(markup).toContain('href="/theses/company-nvda"');
    expect(markup).not.toContain('href="/theses/NVDA"');
  });
});
