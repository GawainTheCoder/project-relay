import { describe, expect, it } from "vitest";

import type { NormalizedDocument } from "../ingestion/types.js";
import {
  buildIntelligenceUpdate,
  type AnalysisContext,
  type AnalysisMacroThesis,
} from "./analyze.js";
import {
  buildThesisEvaluationBatch,
  type ThesisEvaluationInput,
  type VersionedThesisInput,
} from "./evaluate-theses.js";
import type {
  AnalysisOutput,
  ThesisEvaluationOutput,
} from "./schemas.js";

const ANALYZED_AT = "2026-07-01T08:00:00.000Z";
const UPDATE_ID = "update-workload-accelerator";

const document: NormalizedDocument = {
  id: "source-workload-accelerator",
  sourceType: "manual",
  title: "Workload-specific accelerator enters customer validation",
  publisher: "Orion Systems",
  sourceUrl: "https://orion.example/accelerator",
  publishedAt: "2026-06-30T00:00:00.000Z",
  ingestedAt: ANALYZED_AT,
  content: [
    "The company is validating its workload-specific accelerator with three customers and has started production for contracted inference deployments.",
    "Each accelerator uses stacked high-bandwidth memory, and the company says memory bandwidth remains the main limit on delivered throughput.",
    "The rack links accelerators over a proprietary high-bandwidth fabric, and measured fabric utilization rises as clusters scale.",
    "The lower-voltage design reduced rack power in internal tests, but no customer energy measurements are available yet.",
  ].join("\n\n"),
  paragraphs: [
    {
      locator: "P1",
      text: "The company is validating its workload-specific accelerator with three customers and has started production for contracted inference deployments.",
    },
    {
      locator: "P2",
      text: "Each accelerator uses stacked high-bandwidth memory, and the company says memory bandwidth remains the main limit on delivered throughput.",
    },
    {
      locator: "P3",
      text: "The rack links accelerators over a proprietary high-bandwidth fabric, and measured fabric utilization rises as clusters scale.",
    },
    {
      locator: "P4",
      text: "The lower-voltage design reduced rack power in internal tests, but no customer energy measurements are available yet.",
    },
  ],
};

const macroTheses: AnalysisMacroThesis[] = [
  makeMacroThesis(
    "macro-memory",
    "Memory is a primary bottleneck",
    "Memory bandwidth and availability constrain useful accelerator throughput.",
    ["memory", "accelerators"],
  ),
  makeMacroThesis(
    "macro-networking",
    "Networking is becoming a bottleneck",
    "Data movement and fabric utilization increasingly determine cluster performance.",
    ["networking", "accelerators"],
  ),
  makeMacroThesis(
    "macro-optics",
    "Advanced optics remain constrained",
    "Qualified laser and transceiver capacity constrain higher-speed AI links.",
    ["optics", "networking"],
  ),
  makeMacroThesis(
    "macro-power",
    "Power and cooling limit deployment",
    "Available power and heat removal gate dense AI capacity deployments.",
    ["power-cooling"],
  ),
  makeMacroThesis(
    "macro-custom",
    "Custom silicon adoption is accelerating",
    "Suitable workloads are moving to workload-specific accelerators where control and scale justify design cost.",
    ["accelerators", "manufacturing"],
  ),
  makeMacroThesis(
    "macro-portability",
    "Inference software is reducing lock-in",
    "Compilers and runtimes increasingly make inference portable across accelerator vendors.",
    ["serving", "accelerators"],
  ),
];

const context: AnalysisContext = {
  watchlistCompanies: [],
  macroTheses,
  sourceProfile: {
    id: "orion-profile",
    name: "Orion Systems",
    role: "primary",
    authorityTier: "first-party",
    priority: 95,
    layerIds: [
      "accelerators",
      "memory",
      "networking",
      "power-cooling",
    ],
    companyTickers: [],
    // Profile mappings are hints, not permission to manufacture relevance.
    thesisIds: ["macro-optics", "macro-portability"],
  },
};

function makeAnalysisOutput(): AnalysisOutput {
  return {
    layerIds: [
      "accelerators",
      "memory",
      "networking",
      "power-cooling",
      "manufacturing",
    ],
    companyTickers: [],
    materiality: "medium",
    materialityReason:
      "Customer validation directly advances workload-specific accelerator adoption, while explicit memory and fabric claims provide narrower supporting evidence.",
    novelty: "new",
    sentiment: "neutral",
    groundedSummary:
      "A workload-specific accelerator entered customer validation and production for contracted inference deployments.",
    inference: {
      whyItMatters:
        "The evidence bears directly on custom accelerator adoption and more narrowly on memory and network constraints.",
      beneficiaries: [],
      threatened: [],
      watchNext: [
        "Independent production validation",
        "Customer measurements at cluster scale",
      ],
    },
    claims: document.paragraphs.map((paragraph) => ({
      quote: paragraph.text,
      locator: paragraph.locator,
    })),
    thesisImpacts: [],
    macroThesisDispositions: [
      {
        thesisId: "macro-memory",
        relevance: "secondary",
        stance: "supports",
        rationale:
          "The source explicitly identifies memory bandwidth as a throughput limit.",
        claimLocators: ["P2"],
      },
      {
        thesisId: "macro-networking",
        relevance: "secondary",
        stance: "supports",
        rationale:
          "The source reports rising fabric utilization as clusters scale.",
        claimLocators: ["P3"],
      },
      {
        thesisId: "macro-optics",
        relevance: "not-relevant",
        stance: "context",
        rationale:
          "A proprietary fabric does not establish optical component demand or supply.",
        claimLocators: [],
      },
      {
        thesisId: "macro-power",
        relevance: "context",
        stance: "context",
        rationale:
          "Internal voltage results are weak context without deployment-level power evidence.",
        claimLocators: ["P4"],
      },
      {
        thesisId: "macro-custom",
        relevance: "primary",
        stance: "supports",
        rationale:
          "Customer validation and contracted production directly address adoption of workload-specific accelerators.",
        claimLocators: ["P1"],
      },
      {
        thesisId: "macro-portability",
        relevance: "not-relevant",
        stance: "context",
        rationale:
          "The source provides no compiler, runtime, or workload-migration evidence.",
        claimLocators: [],
      },
    ],
  };
}

describe("generalized macro-thesis analysis routing", () => {
  it("persists grounded primary, secondary, and context routes without over-routing adjacent theses", () => {
    const update = buildIntelligenceUpdate(
      document,
      makeAnalysisOutput(),
      UPDATE_ID,
      ANALYZED_AT,
      "test-analysis-model",
      context,
    );

    expect(
      update.macroThesisImpacts.map((impact) => [
        impact.thesisId,
        impact.relevance,
        impact.stance,
      ]),
    ).toEqual([
      ["macro-memory", "secondary", "supports"],
      ["macro-networking", "secondary", "supports"],
      ["macro-power", "context", "context"],
      ["macro-custom", "primary", "supports"],
    ]);
    expect(
      update.macroThesisImpacts.flatMap((impact) => impact.claimIds),
    ).toHaveLength(4);
    expect(
      update.macroThesisImpacts.some(
        (impact) =>
          impact.thesisId === "macro-optics" ||
          impact.thesisId === "macro-portability",
      ),
    ).toBe(false);
  });

  it("rejects a silent macro-thesis omission even for a not-material result", () => {
    const output = makeAnalysisOutput();
    output.materiality = "not-material";
    output.sentiment = "not-material";
    output.novelty = "repetition";
    output.claims = [];
    output.macroThesisDispositions = output.macroThesisDispositions
      .slice(0, -1)
      .map((disposition) => ({
        ...disposition,
        relevance: "not-relevant" as const,
        stance: "context" as const,
        claimLocators: [],
      }));

    expect(() =>
      buildIntelligenceUpdate(
        document,
        output,
        UPDATE_ID,
        ANALYZED_AT,
        "test-analysis-model",
        context,
      ),
    ).toThrow("cover every active macro thesis exactly once");
  });

  it("does not treat not-relevant dispositions as evidence of materiality", () => {
    const output = makeAnalysisOutput();
    output.macroThesisDispositions =
      output.macroThesisDispositions.map((disposition) => ({
        ...disposition,
        relevance: "not-relevant" as const,
        stance: "context" as const,
        claimLocators: [],
      }));

    expect(() =>
      buildIntelligenceUpdate(
        document,
        output,
        UPDATE_ID,
        ANALYZED_AT,
        "test-analysis-model",
        context,
      ),
    ).toThrow("company thesis delta or a direct macro-thesis route");
  });
});

describe("generalized macro-thesis evaluation routing", () => {
  it("requires explicit outcomes for every primary and secondary route", () => {
    const { input, evaluations } = makeEvaluationScenario();

    expect(() =>
      buildThesisEvaluationBatch(
        input,
        {
          evaluations: evaluations.filter(
            (evaluation) => evaluation.thesisId !== "macro-memory",
          ),
        },
        ANALYZED_AT,
        "test-evaluation-model",
      ),
    ).toThrow("requires an explicit evaluation");
  });

  it("records weak context without allowing it to move confidence", () => {
    const { input, evaluations, claimsByThesis } =
      makeEvaluationScenario();

    const accepted = buildThesisEvaluationBatch(
      input,
      { evaluations },
      ANALYZED_AT,
      "test-evaluation-model",
    );
    expect(
      accepted.evaluations.find(
        (evaluation) => evaluation.thesisId === "macro-power",
      ),
    ).toBeUndefined();

    const powerThesis = input.theses.find(
      (thesis) => thesis.id === "macro-power",
    );
    if (!powerThesis) {
      throw new Error("Expected the context-only power thesis.");
    }
    const directionalPowerEvaluation = makeEvaluation(
      powerThesis,
      claimsByThesis["macro-power"]!,
      "reinforced",
      1,
    );
    directionalPowerEvaluation.contextEvidence =
      directionalPowerEvaluation.supportingEvidence;
    directionalPowerEvaluation.supportingEvidence = [];
    expect(() =>
      buildThesisEvaluationBatch(
        input,
        {
          evaluations: [
            ...evaluations,
            directionalPowerEvaluation,
          ],
        },
        ANALYZED_AT,
        "test-evaluation-model",
      ),
    ).toThrow("Context-only macro evidence cannot change");
  });

  it("rejects unrouted theses and claims outside a thesis-specific route", () => {
    const { input, evaluations, claimsByThesis } =
      makeEvaluationScenario();
    const opticsThesis = input.theses.find(
      (thesis) => thesis.id === "macro-optics",
    );
    if (!opticsThesis) {
      throw new Error("Expected the optics thesis fixture.");
    }
    const opticsEvaluation = makeEvaluation(
      opticsThesis,
      claimsByThesis["macro-custom"]!,
      "unchanged",
      0,
    );

    expect(() =>
      buildThesisEvaluationBatch(
        input,
        { evaluations: [...evaluations, opticsEvaluation] },
        ANALYZED_AT,
        "test-evaluation-model",
      ),
    ).toThrow("not routed to that thesis");

    expect(() =>
      buildThesisEvaluationBatch(
        input,
        {
          evaluations: evaluations.map((evaluation) =>
            evaluation.thesisId === "macro-custom"
              ? {
                  ...evaluation,
                  supportingEvidence: [
                    {
                      signalId: UPDATE_ID,
                      claimIds: [claimsByThesis["macro-memory"]!],
                      reason:
                        "This claim belongs to a different analyzed route.",
                    },
                  ],
                }
              : evaluation,
          ),
        },
        ANALYZED_AT,
        "test-evaluation-model",
      ),
    ).toThrow("outside its analyzed route");
  });
});

function makeMacroThesis(
  id: string,
  title: string,
  belief: string,
  layerIds: AnalysisMacroThesis["layerIds"],
): AnalysisMacroThesis {
  return {
    id,
    title,
    belief,
    confidenceScore: 60,
    unknowns: ["Whether the evidence generalizes beyond one deployment"],
    strengtheningConditions: ["Independent production evidence accumulates"],
    weakeningConditions: ["Production evidence fails to materialize"],
    layerIds,
  };
}

function makeEvaluationScenario(): {
  input: ThesisEvaluationInput;
  evaluations: ThesisEvaluationOutput["evaluations"];
  claimsByThesis: Record<string, string>;
} {
  const update = buildIntelligenceUpdate(
    document,
    makeAnalysisOutput(),
    UPDATE_ID,
    ANALYZED_AT,
    "test-analysis-model",
    context,
  );
  const theses = macroTheses.map(toVersionedThesis);
  const claimsByThesis = Object.fromEntries(
    update.macroThesisImpacts.map((impact) => [
      impact.thesisId,
      impact.claimIds[0]!,
    ]),
  );
  const input: ThesisEvaluationInput = {
    theses,
    signals: [
      {
        id: update.id,
        title: update.title,
        publishedAt: update.publishedAt,
        sourceProvenance: {
          id: "orion-profile",
          publisher: "Orion Systems",
          authorityTier: "first-party",
        },
        companyTickers: update.companyTickers,
        layerIds: update.layerIds,
        whatHappened: update.whatHappened,
        whyItMatters: update.whyItMatters,
        macroThesisImpacts: update.macroThesisImpacts.map((impact) => ({
          thesisId: impact.thesisId,
          relevance: impact.relevance,
          stance: impact.stance,
          rationale: impact.rationale,
          claimIds: impact.claimIds,
        })),
        claims: update.claims.map((claim) => ({
          id: claim.id,
          quote: claim.quote,
          locator: claim.locator,
        })),
      },
    ],
  };
  const thesisById = new Map(
    theses.map((thesis) => [thesis.id, thesis] as const),
  );
  const evaluations = [
    makeEvaluation(
      thesisById.get("macro-custom")!,
      claimsByThesis["macro-custom"]!,
      "reinforced",
      4,
    ),
    makeEvaluation(
      thesisById.get("macro-memory")!,
      claimsByThesis["macro-memory"]!,
      "reinforced",
      2,
    ),
    makeEvaluation(
      thesisById.get("macro-networking")!,
      claimsByThesis["macro-networking"]!,
      "reinforced",
      1,
    ),
  ];

  return { input, evaluations, claimsByThesis };
}

function toVersionedThesis(
  thesis: AnalysisMacroThesis,
): VersionedThesisInput {
  return {
    id: thesis.id,
    type: "macro",
    title: thesis.title,
    currentVersion: {
      id: `version-${thesis.id}`,
      belief: thesis.belief,
      confidenceScore: thesis.confidenceScore,
      unknowns: [...thesis.unknowns],
      strengthenConditions: [...thesis.strengtheningConditions],
      weakenConditions: [...thesis.weakeningConditions],
    },
    companyTickers: [],
    layerIds: [...thesis.layerIds],
  };
}

function makeEvaluation(
  thesis: VersionedThesisInput,
  claimId: string,
  outcome: ThesisEvaluationOutput["evaluations"][number]["outcome"],
  confidenceDelta: number,
): ThesisEvaluationOutput["evaluations"][number] {
  return {
    thesisId: thesis.id,
    previousVersionId: thesis.currentVersion.id,
    outcome,
    proposedBelief: null,
    proposedConfidenceScore:
      thesis.currentVersion.confidenceScore + confidenceDelta,
    confidenceDelta,
    rationale:
      outcome === "unchanged"
        ? "The evidence is useful context but does not clear the confidence-change threshold."
        : "The exact claim modestly reinforces the existing thesis without changing its scope.",
    reviewRecommendation: outcome === "unchanged" ? "reject" : "accept",
    reviewRecommendationReason:
      outcome === "unchanged"
        ? "The context does not justify a durable thesis update."
        : "The exact routed claim supports the proposed confidence change.",
    supportingEvidence: [
      {
        signalId: UPDATE_ID,
        claimIds: [claimId],
        reason: "The analyzed route links this exact claim to the thesis.",
      },
    ],
    opposingEvidence: [],
    contextEvidence: [],
    unknowns: [...thesis.currentVersion.unknowns],
    strengthenConditions: [
      ...thesis.currentVersion.strengthenConditions,
    ],
    weakenConditions: [...thesis.currentVersion.weakenConditions],
  };
}
