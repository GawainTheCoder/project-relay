import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import type {
  DailyBrief,
  IntelligenceUpdate,
} from "../../shared/contracts";
import { BriefArchiveSection } from "./TodayPage";

const brief: DailyBrief = {
  id: "brief-1",
  date: "2026-07-08",
  title: "Generated archive title",
  summary: "Generated synthesis copy should stay behind the quotes.",
  signal: "Generated signal copy should not lead the archive detail.",
  secondarySignals: [],
  updateIds: ["signal-1", "signal-2"],
  citationClaimIds: ["claim-1", "claim-2"],
  generatedAt: "2026-07-08T08:00:00.000Z",
  model: "test-model",
};

function makeUpdate(
  id: string,
  publisher: string,
  claimId: string,
  quote: string,
): IntelligenceUpdate {
  return {
    id,
    title: `${publisher} signal`,
    publisher,
    sourceUrl: `https://example.com/${id}`,
    publishedAt: "2026-07-08T07:00:00.000Z",
    ingestedAt: "2026-07-08T07:05:00.000Z",
    layerIds: ["accelerators"],
    companyTickers: [],
    materiality: "high",
    materialityReason: "The exact quote affects thesis routing.",
    novelty: "new",
    sentiment: "bullish",
    whatHappened: "Generated summary.",
    whyItMatters: "Generated implication.",
    beneficiaries: [],
    threatened: [],
    watchNext: [],
    claims: [
      {
        id: claimId,
        quote,
        sourceId: `${id}-source`,
        locator: "paragraph 2",
      },
    ],
    thesisImpacts: [],
    macroThesisImpacts: [],
    model: "test-model",
  };
}

describe("BriefArchiveSection", () => {
  it("shows selected brief citations before generated readout copy", () => {
    const updates = [
      makeUpdate("signal-1", "Reuters", "claim-1", "First cited quote."),
      makeUpdate("signal-2", "NVIDIA", "claim-2", "Second cited quote."),
    ];
    const evidenceItems = updates.map((update) => ({
      claim: update.claims[0]!,
      update,
    }));

    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <BriefArchiveSection
          briefs={[brief]}
          error={null}
          evidenceItems={evidenceItems}
          onRetry={() => undefined}
          selectedBriefId="brief-1"
        />
      </MemoryRouter>,
    );

    expect(markup).toContain("Cited evidence");
    expect(markup).toContain("First cited quote.");
    expect(markup).toContain("Second cited quote.");
    expect(markup).toContain('href="/signals?update=signal-1"');
    expect(markup).toContain("[1] Reuters · paragraph 2");
    expect(markup.indexOf("Cited evidence")).toBeLessThan(
      markup.indexOf("Generated readout"),
    );
    expect(markup.indexOf("First cited quote.")).toBeLessThan(
      markup.indexOf("Generated signal copy"),
    );
  });
});
