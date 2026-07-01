import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import type { Company, StackLayer } from "../../../shared/contracts";
import { StackInspector } from "./StackInspector";

const company: Company = {
  ticker: "NVDA",
  name: "NVIDIA",
  layerIds: ["accelerators"],
  description: "Accelerated computing supplier.",
  thesis: "Full-stack acceleration can preserve premium economics.",
  whyItMatters: "The platform spans compute, networking, and software.",
  provesRight: ["Platform attach rates rise."],
  breaksThesis: ["The software moat weakens."],
  watchMetrics: ["Data-center revenue"],
  confidence: "high",
  updatedAt: "2026-07-01T08:00:00.000Z",
};

const layer: StackLayer = {
  id: "accelerators",
  name: "Accelerators",
  description: "Compute engines for training and inference.",
  companyTickers: ["NVDA"],
  dependsOn: [],
};

describe("StackInspector", () => {
  it("links a selected company to its canonical persisted thesis", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <StackInspector company={company} layer={layer} updates={[]} />
      </MemoryRouter>,
    );

    expect(markup).toContain('href="/theses/company-nvda"');
    expect(markup).not.toContain('href="/theses/NVDA"');
  });
});
