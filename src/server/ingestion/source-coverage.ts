import type {
  LayerId,
  ResearchSource,
  Thesis,
  ThesisSourceCoverage,
} from "../../shared/contracts.js";

import { TRUSTED_SOURCE_REGISTRY } from "./source-registry.js";
import type { TrustedSourceDefinition } from "./types.js";

interface MacroCoverageMapping {
  thesisId: string;
  thesisTitle: string;
  layerIds: readonly LayerId[];
  sourceIds: readonly string[];
}

export interface SourceCoverageAuditInput {
  theses?: readonly Pick<Thesis, "id" | "title" | "layerIds">[];
  sourceDefinitions?: readonly TrustedSourceDefinition[];
  catalogSources?: readonly (
    Pick<ResearchSource, "id" | "enabled"> &
    Partial<
      Pick<
        ResearchSource,
        | "name"
        | "userAdded"
        | "type"
        | "role"
        | "authorityTier"
        | "thesisIds"
      >
    >
  )[];
}

export const MACRO_THESIS_SOURCE_COVERAGE = [
  {
    thesisId: "macro-memory-bottleneck",
    thesisTitle: "Memory is a primary AI-system bottleneck",
    layerIds: ["memory", "accelerators", "manufacturing"],
    sourceIds: [
      "trendforce-semiconductors-feed",
      "trendforce-memory",
      "dramexchange",
      "micron-ir",
      "samsung-memory",
      "sk-hynix-newsroom",
      "semianalysis-public",
      "semianalysis-manual",
      "fabricated-knowledge-manual",
      "chips-and-cheese-feed",
      "chips-and-cheese-manual",
      "serve-the-home-feed",
      "serve-the-home-manual",
    ],
  },
  {
    thesisId: "macro-networking-bottleneck",
    thesisTitle: "Networking is becoming the scaling bottleneck",
    layerIds: ["networking", "optics", "accelerators"],
    sourceIds: [
      "delloro-feed",
      "delloro",
      "arista-ir",
      "broadcom-ir",
      "marvell-ir",
      "the-next-platform",
      "semianalysis-public",
      "semianalysis-manual",
      "dylan-patel-interviews-manual",
      "fabricated-knowledge-manual",
      "chips-and-cheese-feed",
      "chips-and-cheese-manual",
      "serve-the-home-feed",
      "serve-the-home-manual",
    ],
  },
  {
    thesisId: "macro-optics-supply",
    thesisTitle: "Advanced optics supply remains constrained",
    layerIds: ["optics", "networking", "materials-builders"],
    sourceIds: [
      "lightcounting",
      "coherent-ir",
      "lumentum-ir",
      "corning-ir",
      "delloro-feed",
      "delloro",
      "semianalysis-public",
      "semianalysis-manual",
      "fabricated-knowledge-manual",
    ],
  },
  {
    thesisId: "macro-power-cooling",
    thesisTitle: "Power and cooling are limiting AI deployment",
    layerIds: ["power-cooling", "materials-builders", "cloud"],
    sourceIds: [
      "data-center-dynamics-feed",
      "data-center-dynamics",
      "utility-dive-feed",
      "utility-dive",
      "vertiv-ir",
      "eaton-newsroom",
      "ge-vernova-newsroom",
      "semianalysis-public",
      "semianalysis-manual",
      "the-information-manual",
    ],
  },
  {
    thesisId: "macro-custom-silicon",
    thesisTitle: "Custom silicon adoption is accelerating",
    layerIds: ["accelerators", "manufacturing", "serving"],
    sourceIds: [
      "broadcom-ir",
      "marvell-ir",
      "nvidia-ir",
      "amd-ir",
      "tsmc-ir",
      "tsmc-advanced-packaging",
      "trendforce-semiconductors-feed",
      "the-next-platform",
      "semianalysis-public",
      "semianalysis-manual",
      "stratechery-manual",
      "the-information-manual",
      "dylan-patel-interviews-manual",
      "fabricated-knowledge-manual",
      "chips-and-cheese-feed",
      "chips-and-cheese-manual",
      "serve-the-home-feed",
      "serve-the-home-manual",
    ],
  },
  {
    thesisId: "macro-inference-portability",
    thesisTitle: "Inference software is reducing vendor lock-in",
    layerIds: ["serving", "accelerators", "cloud"],
    sourceIds: [
      "vllm-releases",
      "sglang-releases",
      "tensorrt-llm-releases",
      "nvidia-dynamo-releases",
      "nvidia-ir",
      "amd-ir",
      "semianalysis-public",
      "semianalysis-manual",
      "stratechery-manual",
      "the-information-manual",
      "latent-space-manual",
      "dylan-patel-interviews-manual",
      "chips-and-cheese-feed",
      "chips-and-cheese-manual",
      "serve-the-home-feed",
      "serve-the-home-manual",
    ],
  },
] as const satisfies readonly MacroCoverageMapping[];

export function auditMacroThesisSourceCoverage(
  input: SourceCoverageAuditInput = {},
): ThesisSourceCoverage[] {
  const definitions = input.sourceDefinitions ?? TRUSTED_SOURCE_REGISTRY;
  const definitionsById = new Map(
    definitions.map((definition) => [definition.id, definition]),
  );
  const catalogEnabledById = input.catalogSources
    ? new Map(input.catalogSources.map((source) => [source.id, source.enabled]))
    : null;
  const thesesById = new Map(
    input.theses?.map((thesis) => [thesis.id, thesis]) ?? [],
  );

  return MACRO_THESIS_SOURCE_COVERAGE.map((mapping) => {
    const thesis = thesesById.get(mapping.thesisId);
    const mappedSources = mapping.sourceIds.flatMap((sourceId) => {
      const definition = definitionsById.get(sourceId);
      if (!definition) {
        return [];
      }
      const activeAutomated = isActiveAutomatedSource(
        definition,
        catalogEnabledById,
      );
      return [{
        id: definition.id,
        name: definition.name,
        authorityTier: definition.authorityTier,
        role: definition.role,
        automated: activeAutomated,
      }];
    });
    const profileSources = (input.catalogSources ?? []).flatMap((source) => {
      if (
        !source.userAdded ||
        !source.thesisIds?.includes(mapping.thesisId)
      ) {
        return [];
      }
      return [{
        id: source.id,
        name: source.name ?? source.id,
        authorityTier: source.authorityTier ?? "unknown",
        role: source.role ?? "context",
        automated:
          source.enabled &&
          Boolean(
            source.type &&
            ["rss", "paper", "release"].includes(source.type),
          ),
      }];
    });
    const sources = [
      ...new Map(
        [...mappedSources, ...profileSources].map((source) => [
          source.id,
          source,
        ]),
      ).values(),
    ];
    const strongSources = sources.filter(isStrongPrimarySource);
    const status = strongSources.some((source) => source.automated)
      ? "automated"
      : strongSources.length > 0
        ? "manual-only"
        : "missing";

    return {
      thesisId: mapping.thesisId,
      thesisTitle: thesis?.title ?? mapping.thesisTitle,
      layerIds: thesis ? [...thesis.layerIds] : [...mapping.layerIds],
      status,
      sources,
      strongSourceCount: strongSources.length,
    };
  });
}

function isActiveAutomatedSource(
  definition: TrustedSourceDefinition,
  catalogEnabledById: ReadonlyMap<string, boolean> | null,
): boolean {
  const catalogEnabled = catalogEnabledById
    ? catalogEnabledById.get(definition.id) === true
    : definition.enabledByDefault;
  return catalogEnabled &&
    definition.intakeMode === "feed" &&
    (definition.fetchStrategy === "rss" ||
      definition.fetchStrategy === "atom");
}

function isStrongPrimarySource(source: {
  authorityTier: ThesisSourceCoverage["sources"][number]["authorityTier"];
  role: ThesisSourceCoverage["sources"][number]["role"];
}): boolean {
  return source.role === "primary" &&
    (source.authorityTier === "first-party" ||
      source.authorityTier === "specialist");
}
