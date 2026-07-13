import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { IntelligenceUpdate } from "../../../shared/contracts";
import { UpdateAnalysis } from "./UpdateAnalysis";

const update: IntelligenceUpdate = {
  id: "meta-capex-report",
  title: "Meta raises capital spending for AI infrastructure",
  publisher: "Bloomberg",
  sourceUrl: "https://example.com/meta-capex",
  publishedAt: "2026-07-01T10:00:00.000Z",
  ingestedAt: "2026-07-01T10:05:00.000Z",
  layerIds: ["power-cooling"],
  companyTickers: [],
  materiality: "high",
  materialityReason: "The spending increase affects AI infrastructure demand.",
  novelty: "confirmation",
  sentiment: "bullish",
  whatHappened: "Meta raised its AI infrastructure capital-spending outlook.",
  whyItMatters: "The update supports continued data-center demand.",
  beneficiaries: ["Data-center suppliers"],
  threatened: [],
  watchNext: ["Quarterly capital expenditures"],
  claims: [],
  thesisImpacts: [],
  macroThesisImpacts: [],
  model: "test-model",
  sourceLineage: {
    evidenceChainId: "story-meta-capex",
    reportCount: 2,
    publishers: ["Reuters", "Bloomberg"],
    updateIds: ["reuters-meta-capex", "meta-capex-report"],
    matchScore: 91,
    matchReason: "Shared company context and title overlap.",
  },
};

describe("UpdateAnalysis source lineage", () => {
  it("explains that syndicated reports count as one evidence chain", () => {
    const markup = renderToStaticMarkup(
      <UpdateAnalysis
        onCitationSelect={() => undefined}
        onDeleteRequest={() => undefined}
        onOpenInspector={() => undefined}
        onReevaluationRequest={() => undefined}
        reevaluationMessage={null}
        reevaluationState="idle"
        update={update}
      />,
    );

    expect(markup).toContain("Shared story");
    expect(markup).toContain("2 publisher reports");
    expect(markup).toContain("1 evidence chain");
    expect(markup).toContain("Reuters, Bloomberg");
    expect(markup).toContain("counts them once");
  });

  it("renders source quotes before generated model prose", () => {
    const markup = renderToStaticMarkup(
      <UpdateAnalysis
        onCitationSelect={() => undefined}
        onDeleteRequest={() => undefined}
        onOpenInspector={() => undefined}
        onReevaluationRequest={() => undefined}
        reevaluationMessage={null}
        reevaluationState="idle"
        update={{
          ...update,
          claims: [
            {
              id: "claim-capex",
              quote: "Meta said capital expenditures would rise in 2026.",
              sourceId: "source-1",
              locator: "P4",
            },
          ],
        }}
      />,
    );

    expect(markup).toContain("Source evidence");
    expect(markup).toContain("Meta said capital expenditures would rise in 2026.");
    expect(markup.indexOf("Source evidence")).toBeLessThan(
      markup.indexOf("Model readout"),
    );
    expect(markup.indexOf("Meta said capital expenditures")).toBeLessThan(
      markup.indexOf("Meta raised its AI infrastructure"),
    );
  });
});
