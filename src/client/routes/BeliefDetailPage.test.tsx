import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import type { BeliefRoutedSignal } from "../lib/api";
import { RoutedSignalsSection } from "./BeliefDetailPage";

function makeSignal(
  overrides: Partial<BeliefRoutedSignal> = {},
): BeliefRoutedSignal {
  return {
    updateId: "signal-1",
    title: "Advanced optics supplier reaches volume production",
    publisher: "Primary source",
    publishedAt: "2026-07-01T08:00:00.000Z",
    relevance: "primary",
    materiality: null,
    rationale: "Volume production directly bears on optics supply.",
    evaluationState: "awaiting-evaluation",
    ...overrides,
  };
}

describe("RoutedSignalsSection", () => {
  it("renders awaiting and evaluated routed signals with signal deep links", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <RoutedSignalsSection
          onEvaluate={async () => undefined}
          routedSignals={[
            makeSignal(),
            makeSignal({
              updateId: "signal-2",
              title: "Prior signal already evaluated",
              relevance: "secondary",
              rationale: "The prior source already fed a proposal.",
              evaluationState: "evaluated",
            }),
          ]}
        />
      </MemoryRouter>,
    );

    expect(markup).toContain("Awaiting evaluation");
    expect(markup).toContain("Evaluate theses");
    expect(markup).toContain('href="/signals?update=signal-1"');
    expect(markup).toContain("Volume production directly bears on optics supply.");
    expect(markup).toContain("Evaluated");
    expect(markup).toContain("Prior signal already evaluated");
  });

  it("uses materiality badges for company routed signals", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <RoutedSignalsSection
          onEvaluate={async () => undefined}
          routedSignals={[
            makeSignal({
              relevance: null,
              materiality: "high",
              rationale: "The company impact strengthens the thesis.",
            }),
          ]}
        />
      </MemoryRouter>,
    );

    expect(markup).toContain("high");
    expect(markup).toContain(
      "The company impact strengthens the thesis.",
    );
  });
});
