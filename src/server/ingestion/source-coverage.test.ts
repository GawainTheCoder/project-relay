import { describe, expect, it } from "vitest";

import type { ResearchSource } from "../../shared/contracts.js";

import {
  auditMacroThesisSourceCoverage,
  MACRO_THESIS_SOURCE_COVERAGE,
} from "./source-coverage.js";
import { seedTheses } from "../seeds/catalog.js";
import type { TrustedSourceDefinition } from "./types.js";

describe("macro thesis source coverage", () => {
  it("audits every active seeded macro thesis, including missing coverage", () => {
    const coverage = auditMacroThesisSourceCoverage();
    const activeMacroThesisIds = seedTheses
      .filter((thesis) => thesis.kind === "macro")
      .map((thesis) => thesis.id);

    expect(coverage).toHaveLength(7);
    expect(coverage.map((entry) => entry.thesisId).toSorted()).toEqual(
      activeMacroThesisIds.toSorted(),
    );
    expect(new Set(coverage.map((entry) => entry.thesisId)).size).toBe(7);
    expect(
      coverage
        .filter((entry) => entry.thesisId !== "macro-space-infrastructure")
        .every((entry) =>
          entry.strongSourceCount > 0 && entry.status !== "missing"
        ),
    ).toBe(true);
    expect(
      coverage.find(
        (entry) => entry.thesisId === "macro-space-infrastructure",
      ),
    ).toMatchObject({
      status: "missing",
      strongSourceCount: 0,
      sources: [],
    });
    expect(MACRO_THESIS_SOURCE_COVERAGE).toHaveLength(7);
  });

  it("classifies automated, manual-only, and missing coverage", () => {
    const sourceDefinitions = [
      definition({
        id: "trendforce-memory",
        name: "Automated memory specialist",
        authorityTier: "specialist",
        intakeMode: "feed",
        fetchStrategy: "rss",
        enabledByDefault: true,
      }),
      definition({
        id: "lightcounting",
        name: "Manual optics specialist",
        authorityTier: "specialist",
        intakeMode: "public-url",
        fetchStrategy: "on-demand-url",
        enabledByDefault: false,
      }),
      definition({
        id: "utility-dive",
        name: "Context-only power source",
        authorityTier: "context",
        role: "context",
        intakeMode: "feed",
        fetchStrategy: "rss",
        enabledByDefault: true,
      }),
    ];

    const coverage = auditMacroThesisSourceCoverage({
      sourceDefinitions,
    });

    expect(findCoverage(coverage, "macro-memory-bottleneck")).toMatchObject({
      status: "automated",
      strongSourceCount: 1,
    });
    expect(findCoverage(coverage, "macro-optics-supply")).toMatchObject({
      status: "manual-only",
      strongSourceCount: 1,
    });
    expect(findCoverage(coverage, "macro-power-cooling")).toMatchObject({
      status: "missing",
      strongSourceCount: 0,
      sources: [
        expect.objectContaining({
          id: "utility-dive",
          role: "context",
          automated: true,
        }),
      ],
    });
  });

  it("does not count a disabled catalog feed as automated", () => {
    const sourceDefinitions = [
      definition({
        id: "trendforce-memory",
        name: "Memory specialist feed",
        authorityTier: "specialist",
        intakeMode: "feed",
        fetchStrategy: "rss",
        enabledByDefault: true,
      }),
    ];
    const catalogSources = [
      catalogSource("trendforce-memory", false),
    ];

    const coverage = auditMacroThesisSourceCoverage({
      sourceDefinitions,
      catalogSources,
    });

    expect(findCoverage(coverage, "macro-memory-bottleneck")).toMatchObject({
      status: "manual-only",
      sources: [
        expect.objectContaining({
          id: "trendforce-memory",
          automated: false,
        }),
      ],
    });
  });

  it("treats a built-in feed missing from an authoritative catalog as inactive", () => {
    const coverage = auditMacroThesisSourceCoverage({
      sourceDefinitions: [
        definition({
          id: "trendforce-memory",
          name: "Archived memory specialist",
          authorityTier: "specialist",
          intakeMode: "feed",
          fetchStrategy: "rss",
          enabledByDefault: true,
        }),
      ],
      catalogSources: [],
    });

    expect(findCoverage(coverage, "macro-memory-bottleneck")).toMatchObject({
      status: "manual-only",
      sources: [
        expect.objectContaining({
          id: "trendforce-memory",
          automated: false,
        }),
      ],
    });
  });

  it("uses current thesis metadata without changing the explicit mapping", () => {
    const coverage = auditMacroThesisSourceCoverage({
      theses: [{
        id: "macro-memory-bottleneck",
        title: "Current memory thesis",
        layerIds: ["memory"],
      }],
      sourceDefinitions: [],
    });

    expect(findCoverage(coverage, "macro-memory-bottleneck")).toMatchObject({
      thesisTitle: "Current memory thesis",
      layerIds: ["memory"],
      status: "missing",
    });
  });

  it("includes user-added profiles without letting context profiles satisfy coverage", () => {
    const coverage = auditMacroThesisSourceCoverage({
      sourceDefinitions: [],
      catalogSources: [
        {
          id: "memory-profile",
          name: "Manual memory specialist",
          enabled: false,
          userAdded: true,
          type: "manual",
          role: "primary",
          authorityTier: "specialist",
          thesisIds: ["macro-memory-bottleneck"],
        },
        {
          id: "power-context",
          name: "Power context",
          enabled: false,
          userAdded: true,
          type: "manual",
          role: "context",
          authorityTier: "context",
          thesisIds: ["macro-power-cooling"],
        },
      ],
    });

    expect(findCoverage(coverage, "macro-memory-bottleneck")).toMatchObject({
      status: "manual-only",
      strongSourceCount: 1,
      sources: [expect.objectContaining({ id: "memory-profile" })],
    });
    expect(findCoverage(coverage, "macro-power-cooling")).toMatchObject({
      status: "missing",
      strongSourceCount: 0,
      sources: [expect.objectContaining({ id: "power-context" })],
    });
  });
});

function definition(
  overrides: Partial<TrustedSourceDefinition> &
    Pick<TrustedSourceDefinition, "id" | "name">,
): TrustedSourceDefinition {
  const { id, name, ...optionalOverrides } = overrides;
  return {
    id,
    name,
    type: "rss",
    role: "primary",
    authorityTier: "specialist",
    layerIds: ["memory"],
    companyTickers: [],
    intakeMode: "feed",
    fetchStrategy: "rss",
    url: "https://example.com/feed",
    allowedDomains: ["example.com"],
    enabledByDefault: true,
    priority: 100,
    perRefreshQuota: 1,
    ...optionalOverrides,
  };
}

function catalogSource(
  id: string,
  enabled: boolean,
): Pick<ResearchSource, "id" | "enabled"> {
  return { id, enabled };
}

function findCoverage(
  coverage: ReturnType<typeof auditMacroThesisSourceCoverage>,
  thesisId: string,
) {
  const entry = coverage.find((candidate) => candidate.thesisId === thesisId);
  if (!entry) {
    throw new Error(`Missing coverage result for ${thesisId}`);
  }
  return entry;
}
