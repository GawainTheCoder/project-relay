import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  DailyBrief,
  ImportSourceInput,
  IntelligenceUpdate,
} from "../../shared/contracts.js";
import type {
  NormalizedDocument,
  RssEntry,
} from "../ingestion/types.js";
import {
  createRelayRepository,
  type RelayRepository,
} from "../db/repository.js";
import { createImpactReviewRepository } from "../evaluation/index.js";

const intelligenceMocks = vi.hoisted(() => ({
  analyzeDocument: vi.fn(),
  analyzeImportedSource: vi.fn(),
  analyzeUrlSource: vi.fn(),
  evaluateTheses: vi.fn(),
  routeSignalToMacroTheses: vi.fn(),
  selectBriefEligibleUpdates: vi.fn((updates: IntelligenceUpdate[]) =>
    updates.flatMap((update) => {
      const thesisImpacts = update.thesisImpacts.filter(
        (impact) =>
          impact.direction !== "not-material" &&
          impact.decision !== "rejected" &&
          impact.review?.decision !== "rejected" &&
          impact.thesisDelta.trim().length > 0,
      );
      return update.materiality !== "not-material" &&
        update.novelty !== "repetition" &&
        update.claims.length > 0 &&
        thesisImpacts.length > 0
        ? [{
            ...update,
            companyTickers: [
              ...new Set(
                thesisImpacts.map((impact) => impact.companyTicker),
              ),
            ],
            thesisImpacts,
          }]
        : [];
    }),
  ),
  synthesizeBeliefBrief: vi.fn(),
  synthesizeDailyBrief: vi.fn(),
}));

const ingestionMocks = vi.hoisted(() => ({
  ACTIVE_AUTOMATED_SOURCES: [
    {
      id: "arxiv-distributed-systems",
      name: "Mock arXiv",
      type: "paper",
      role: "primary",
      authorityTier: "specialist",
      layerIds: ["serving"],
      companyTickers: [],
      intakeMode: "feed",
      fetchStrategy: "rss",
      url: "https://example.com/feed.xml",
      allowedDomains: ["example.com"],
      enabledByDefault: true,
      priority: 72,
      perRefreshQuota: 1,
    },
  ],
  deduplicateRssEntries: vi.fn(),
  fetchRssSource: vi.fn(),
  findSourceById: vi.fn(),
  findSourceForUrl: vi.fn(),
  normalizeRssEntry: vi.fn(),
  selectRefreshCandidates: vi.fn(),
}));

vi.mock("../intelligence/index.js", () => intelligenceMocks);
vi.mock("../ingestion/index.js", () => ingestionMocks);

import {
  analyzeImportedSource,
  createAppServices,
  evaluatePendingTheses,
  generateDailyBrief,
  requeueSignalThesisEvaluation,
  refreshPublicSources,
  selectThesisEvaluationEligibleUpdates,
} from "../services.js";

describe("Relay service integration with mocked external boundaries", () => {
  let repository: RelayRepository;

  beforeEach(() => {
    repository = createRelayRepository(":memory:");
    vi.clearAllMocks();
    intelligenceMocks.routeSignalToMacroTheses.mockImplementation(
      async (
        signal: IntelligenceUpdate,
        macroTheses: Array<{ id: string }>,
      ) => {
        const thesis = macroTheses[0];
        const claim = signal.claims[0];
        return thesis && claim
          ? [{
              id: `macro-impact-${signal.id}-${thesis.id}`,
              thesisId: thesis.id,
              relevance: "primary" as const,
              stance: "supports" as const,
              rationale:
                "The stored exact claim is directly relevant to this macro thesis.",
              claimIds: [claim.id],
            }]
          : [];
      },
    );
    ingestionMocks.findSourceById.mockImplementation((id: string) =>
      id === "manual-imports"
        ? {
            id: "manual-imports",
            name: "Other manual excerpts",
            type: "manual",
            role: "context",
            authorityTier: "unknown",
            layerIds: [],
            companyTickers: [],
            intakeMode: "manual-excerpt",
            fetchStrategy: "manual",
            url: null,
            allowedDomains: [],
            enabledByDefault: false,
            priority: 50,
            perRefreshQuota: 0,
          }
        : undefined
    );
    ingestionMocks.findSourceForUrl.mockReturnValue(undefined);
    ingestionMocks.selectRefreshCandidates.mockImplementation(
      (batches: Array<{ source: unknown; entries: RssEntry[] }>) =>
        batches.flatMap((batch) =>
          batch.entries.map((entry) => ({
            source: batch.source,
            entry,
            score: 1,
          })),
        ),
    );
  });

  afterEach(() => {
    repository.close();
  });

  it("keeps only non-rejected company impacts eligible for thesis evaluation", () => {
    const update = makeUpdate(repository, "reviewed-materiality");
    update.companyTickers = ["COHR", "VRT"];
    update.thesisImpacts = [
      {
        ...update.thesisImpacts[0]!,
        companyTicker: "COHR",
        review: {
          impactId: update.thesisImpacts[0]!.id,
          updateId: update.id,
          companyTicker: "COHR",
          decision: "accepted",
          reasonTags: ["useful-analysis"],
          note: null,
          createdAt: update.ingestedAt,
          updatedAt: update.ingestedAt,
        },
      },
      {
        ...update.thesisImpacts[0]!,
        id: `${update.id}-rejected-impact`,
        companyTicker: "VRT",
        review: {
          impactId: `${update.id}-rejected-impact`,
          updateId: update.id,
          companyTicker: "VRT",
          decision: "rejected",
          reasonTags: ["overstated-materiality"],
          note: null,
          createdAt: update.ingestedAt,
          updatedAt: update.ingestedAt,
        },
      },
    ];

    const [eligible] = selectThesisEvaluationEligibleUpdates([update]);
    expect(eligible?.companyTickers).toEqual(["COHR"]);
    expect(eligible?.thesisImpacts).toHaveLength(1);

    expect(
      selectThesisEvaluationEligibleUpdates([
        {
          ...update,
          thesisImpacts: update.thesisImpacts.map((impact) => ({
            ...impact,
            review: {
              ...impact.review!,
              decision: "rejected",
              reasonTags: ["overstated-materiality"],
            },
          })),
        },
      ]),
    ).toEqual([]);
  });

  it("routes pasted content to manual analysis without invoking URL ingestion", async () => {
    const input: ImportSourceInput = {
      title: "Manual source",
      publisher: "Personal research",
      content:
        "A sufficiently complete pasted source for the mocked analysis boundary.",
    };
    const update = makeUpdate(repository, "manual-service-analysis");
    intelligenceMocks.analyzeImportedSource.mockResolvedValue(update);

    await expect(analyzeImportedSource(repository, input)).resolves.toEqual(
      update,
    );
    expect(intelligenceMocks.analyzeImportedSource).toHaveBeenCalledWith(
      input,
      expect.objectContaining({
        analysis: {
          context: expect.objectContaining({
            watchlistCompanies: expect.arrayContaining([
              expect.objectContaining({ ticker: "NVDA" }),
            ]),
          }),
        },
      }),
    );
    expect(intelligenceMocks.analyzeUrlSource).not.toHaveBeenCalled();
  });

  it("routes URL-only input to secure URL analysis with source metadata", async () => {
    const profile = repository.addSourceProfile({
      name: "Example infrastructure research",
      domain: "example.com",
      publicUrl: "https://example.com/research",
      role: "primary",
      authorityTier: "specialist",
      layerIds: ["networking"],
      thesisIds: ["macro-networking-bottleneck"],
    });
    const input: ImportSourceInput = {
      title: "Public source",
      publisher: "Example Research",
      sourceUrl: "https://example.com/report",
      publishedAt: "2026-06-27T10:00:00.000Z",
    };
    const update = makeUpdate(repository, "url-service-analysis");
    intelligenceMocks.analyzeUrlSource.mockResolvedValue(update);

    await expect(analyzeImportedSource(repository, input)).resolves.toEqual(
      update,
    );
    expect(intelligenceMocks.analyzeUrlSource).toHaveBeenCalledWith(
      {
        url: input.sourceUrl,
        title: input.title,
        publisher: input.publisher,
        publishedAt: input.publishedAt,
      },
      expect.objectContaining({
        analysis: {
          context: expect.objectContaining({
            sourceProfile: expect.objectContaining({
              id: profile.id,
              role: "primary",
              authorityTier: "specialist",
              layerIds: ["networking"],
            }),
          }),
        },
      }),
    );
    expect(intelligenceMocks.analyzeImportedSource).not.toHaveBeenCalled();
  });

  it("rejects an import that reaches the service without content or a URL", async () => {
    await expect(
      analyzeImportedSource(repository, {
        title: "Incomplete source",
        publisher: "Personal research",
      }),
    ).rejects.toThrow(
      "Provide pasted source content or a public source URL.",
    );
    expect(intelligenceMocks.analyzeImportedSource).not.toHaveBeenCalled();
    expect(intelligenceMocks.analyzeUrlSource).not.toHaveBeenCalled();
  });

  it("refreshes a public source through mocked fetch and intelligence boundaries", async () => {
    const entry: RssEntry = {
      externalId: "entry-1",
      title: "Cluster networking update",
      publisher: "Mock arXiv",
      sourceUrl: "https://example.com/paper/1",
      publishedAt: "2026-06-27T09:00:00.000Z",
      content:
        "The paper reports a measurable improvement in cluster networking throughput.",
    };
    const document: NormalizedDocument = {
      id: "source-entry-1",
      sourceType: "paper",
      title: entry.title,
      publisher: entry.publisher,
      sourceUrl: entry.sourceUrl,
      publishedAt: entry.publishedAt,
      ingestedAt: "2026-06-27T10:00:00.000Z",
      content: entry.content,
      paragraphs: [{ locator: "P1", text: entry.content }],
    };
    const update = makeUpdate(repository, "refreshed-service-update");
    ingestionMocks.fetchRssSource.mockResolvedValue([entry]);
    ingestionMocks.deduplicateRssEntries.mockImplementation(
      (entries: RssEntry[]) => entries,
    );
    ingestionMocks.normalizeRssEntry.mockReturnValue(document);
    intelligenceMocks.analyzeDocument.mockResolvedValue(update);

    await expect(refreshPublicSources(repository)).resolves.toEqual({
      imported: 1,
      analyzed: 1,
      errors: [],
      items: [
        {
          sourceId: "arxiv-distributed-systems",
          sourceName: "Mock arXiv",
          title: entry.title,
          sourceUrl: entry.sourceUrl,
          isNew: true,
          status: "analyzed",
          updateId: update.id,
          error: null,
        },
      ],
    });
    expect(ingestionMocks.fetchRssSource).toHaveBeenCalledWith(
      expect.objectContaining(
        ingestionMocks.ACTIVE_AUTOMATED_SOURCES[0],
      ),
    );
    expect(ingestionMocks.normalizeRssEntry).toHaveBeenCalledWith(entry, {
      sourceType: "paper",
    });
    expect(intelligenceMocks.analyzeDocument).toHaveBeenCalledWith(
      document,
      expect.objectContaining({
        context: expect.objectContaining({
          sourceProfile: expect.objectContaining({
            id: "arxiv-distributed-systems",
          }),
        }),
      }),
    );
    expect(repository.getUpdate(update.id)).toEqual(update);
    expect(
      repository
        .listSources()
        .find((source) => source.id === "arxiv-distributed-systems"),
    ).toMatchObject({
      status: "ready",
      documentCount: 1,
    });

    expect(repository.deleteUpdate(update.id)).toBe(true);
    await expect(refreshPublicSources(repository)).resolves.toEqual({
      imported: 0,
      analyzed: 0,
      errors: [],
      items: [
        {
          sourceId: "arxiv-distributed-systems",
          sourceName: "Mock arXiv",
          title: entry.title,
          sourceUrl: entry.sourceUrl,
          isNew: false,
          status: "duplicate",
          updateId: null,
          error: null,
        },
      ],
    });
    expect(intelligenceMocks.analyzeDocument).toHaveBeenCalledTimes(1);
    expect(repository.getUpdate(update.id)).toBeNull();
  });

  it("refreshes a user-added feed with its saved analysis context", async () => {
    repository.listSources().forEach((source) => {
      if (!source.userAdded) {
        repository.archiveSource(source.id);
      }
    });
    const customSource = repository.addSource({
      name: "Personal inference systems feed",
      type: "rss",
      url: "https://example.com/personal-feed.xml",
      layerIds: ["serving"],
      companyTickers: ["NVDA"],
    });
    const entry: RssEntry = {
      externalId: "personal-entry-1",
      title: "Serving throughput improves",
      publisher: "Personal inference systems feed",
      sourceUrl: "https://example.com/posts/serving-throughput",
      publishedAt: "2026-06-29T09:00:00.000Z",
      content:
        "The release reports a measurable improvement in inference serving throughput.",
    };
    const document: NormalizedDocument = {
      id: "personal-source-entry-1",
      sourceType: "rss",
      title: entry.title,
      publisher: entry.publisher,
      sourceUrl: entry.sourceUrl,
      publishedAt: entry.publishedAt,
      ingestedAt: "2026-06-29T10:00:00.000Z",
      content: entry.content,
      paragraphs: [{ locator: "P1", text: entry.content }],
    };
    const update = makeUpdate(repository, "personal-feed-update");
    ingestionMocks.fetchRssSource.mockResolvedValue([entry]);
    ingestionMocks.deduplicateRssEntries.mockImplementation(
      (entries: RssEntry[]) => entries,
    );
    ingestionMocks.normalizeRssEntry.mockReturnValue(document);
    intelligenceMocks.analyzeDocument.mockResolvedValue(update);

    const result = await refreshPublicSources(repository);

    expect(result.items).toEqual([
      expect.objectContaining({
        sourceId: customSource.id,
        title: entry.title,
        status: "analyzed",
        updateId: update.id,
      }),
    ]);
    expect(ingestionMocks.fetchRssSource).toHaveBeenCalledWith(
      expect.objectContaining({
        id: customSource.id,
        url: customSource.url,
        layerIds: ["serving"],
        companyTickers: ["NVDA"],
      }),
    );
    expect(intelligenceMocks.analyzeDocument).toHaveBeenCalledWith(
      document,
      expect.objectContaining({
        context: expect.objectContaining({
          sourceProfile: expect.objectContaining({
            id: customSource.id,
          }),
        }),
      }),
    );
  });

  it("builds app services around the repository and supplies updates to synthesis", async () => {
    const generatedBrief: DailyBrief = {
      id: "service-generated-brief",
      date: "2026-06-28",
      title: "Networking becomes the signal",
      summary: "The mocked synthesis selected a networking constraint.",
      signal: "Cluster scale increases the value of network throughput.",
      secondarySignals: [],
      updateIds: ["vrt-fy25-q4"],
      citationClaimIds: ["claim-vrt-backlog"],
      generatedAt: "2026-06-28T06:00:00.000Z",
      model: "mock-synthesis-model",
    };
    intelligenceMocks.synthesizeDailyBrief.mockResolvedValue(generatedBrief);
    repository.persistAnalyzedUpdate(
      makeUpdate(repository, "fresh-service-update"),
    );
    const services = createAppServices(repository);
    if (!services.generateBrief) {
      throw new Error("Expected createAppServices to configure synthesis.");
    }

    await expect(services.generateBrief()).resolves.toEqual(generatedBrief);
    expect(intelligenceMocks.synthesizeDailyBrief).toHaveBeenCalledOnce();
    const updates =
      intelligenceMocks.synthesizeDailyBrief.mock.calls[0]?.[0] as
        | IntelligenceUpdate[]
        | undefined;
    expect(updates).toHaveLength(1);
    expect(updates?.map((update) => update.id)).toContain(
      "fresh-service-update",
    );

    await expect(generateDailyBrief(repository)).resolves.toEqual(
      generatedBrief,
    );
    expect(intelligenceMocks.synthesizeDailyBrief).toHaveBeenCalledTimes(2);
  });

  it("builds source-aware thesis evaluation input and persists proposals", async () => {
    ingestionMocks.findSourceById.mockImplementation((id: string) =>
      id === "vertiv-ir"
        ? {
            id,
            name: "Vertiv investor relations",
            type: "investor-relations",
            role: "primary",
            authorityTier: "first-party",
            layerIds: ["power-cooling"],
            companyTickers: ["VRT"],
            intakeMode: "public-url",
            fetchStrategy: "html",
            url: "https://investors.vertiv.com/",
            allowedDomains: ["investors.vertiv.com"],
            enabledByDefault: true,
            priority: 95,
            perRefreshQuota: 0,
          }
        : undefined,
    );
    intelligenceMocks.evaluateTheses.mockImplementation(
      async (input: {
        theses: Array<{
          id: string;
          currentVersion: {
            id: string;
            belief: string;
            confidenceScore: number;
            unknowns: string[];
            strengthenConditions: string[];
            weakenConditions: string[];
          };
        }>;
        signals: Array<{
          id: string;
          claims: Array<{ id: string }>;
        }>;
      }) => {
        const thesis = input.theses[0];
        const signal = input.signals.find(
          (candidate) => candidate.id === "vrt-fy25-q4",
        );
        if (!thesis || !signal?.claims[0]) {
          throw new Error("Expected evaluation fixtures.");
        }
        return {
          evaluatedAt: "2026-06-30T08:00:00.000Z",
          model: "mock-evaluation-model",
          evaluations: [
            {
              id: "service-thesis-evaluation",
              thesisId: thesis.id,
              previousVersionId: thesis.currentVersion.id,
              outcome: "unchanged" as const,
              proposedBelief: null,
              proposedConfidenceScore:
                thesis.currentVersion.confidenceScore,
              confidenceDelta: 0,
              rationale:
                "The new operating evidence is consistent with the belief but does not clear the change threshold.",
              supportingEvidence: [
                {
                  signalId: signal.id,
                  claimIds: [signal.claims[0].id],
                  reason: "The exact claim supports the existing belief.",
                },
              ],
              opposingEvidence: [],
              signalIds: [signal.id],
              claimIds: [signal.claims[0].id],
              independentSourceCount: 1,
              unknowns: thesis.currentVersion.unknowns,
              strengthenConditions:
                thesis.currentVersion.strengthenConditions,
              weakenConditions:
                thesis.currentVersion.weakenConditions,
              evaluatedAt: "2026-06-30T08:00:00.000Z",
              model: "mock-evaluation-model",
            },
          ],
        };
      },
    );

    const result = await evaluatePendingTheses(repository);

    expect(result).toMatchObject({
      evaluatedAt: "2026-06-30T08:00:00.000Z",
      model: "mock-evaluation-model",
      evaluations: [
        {
          id: "service-thesis-evaluation",
          reviewStatus: "pending",
          outcome: "unchanged",
          signalIds: ["vrt-fy25-q4"],
          claimIds: ["claim-vrt-backlog"],
        },
      ],
    });
    expect(intelligenceMocks.evaluateTheses).toHaveBeenCalledWith(
      expect.objectContaining({
        theses: expect.arrayContaining([
          expect.objectContaining({
            type: expect.stringMatching(/company|macro/),
            currentVersion: expect.objectContaining({
              confidenceScore: expect.any(Number),
            }),
          }),
        ]),
        signals: expect.arrayContaining([
          expect.objectContaining({
            id: "vrt-fy25-q4",
            sourceProvenance: {
              id: "vertiv-ir",
              publisher: "Vertiv investor relations",
              authorityTier: "first-party",
            },
            claims: [
              expect.objectContaining({ id: "claim-vrt-backlog" }),
            ],
          }),
        ]),
      }),
    );
    expect(
      repository.getThesisEvaluation("service-thesis-evaluation"),
    ).toEqual(result.evaluations[0]);
  });

  it("does not repeatedly evaluate a signal batch that produced no proposals", async () => {
    const expectedCursor = repository
      .listAllUpdates()
      .reduce(
        (latest, update) =>
          update.ingestedAt > latest ? update.ingestedAt : latest,
        "",
      );
    intelligenceMocks.evaluateTheses.mockResolvedValue({
      evaluatedAt: "2026-06-30T08:00:00.000Z",
      model: "mock-evaluation-model",
      evaluations: [],
    });

    await expect(evaluatePendingTheses(repository)).resolves.toMatchObject({
      evaluations: [],
    });
    expect(repository.getLatestThesisEvaluationRunCursor()).toBe(
      expectedCursor,
    );

    await expect(evaluatePendingTheses(repository)).resolves.toMatchObject({
      evaluations: [],
    });
    expect(intelligenceMocks.evaluateTheses).toHaveBeenLastCalledWith(
      expect.objectContaining({ signals: [] }),
    );
  });

  it("explicitly requeues an already processed signal without changing a thesis", async () => {
    const thesisBefore = repository.getThesis("company-vrt")?.currentVersion;

    const result = await requeueSignalThesisEvaluation(
      repository,
      "vrt-fy25-q4",
    );

    expect(result).toMatchObject({
      updateId: "vrt-fy25-q4",
      alreadyQueued: false,
      macroRouteCount: 1,
      routesClassified: true,
    });
    expect(
      repository.listRequeuedThesisEvaluationUpdates().map(
        (update) => update.id,
      ),
    ).toContain("vrt-fy25-q4");
    expect(repository.getThesis("company-vrt")?.currentVersion).toEqual(
      thesisBefore,
    );
    expect(intelligenceMocks.evaluateTheses).not.toHaveBeenCalled();
    expect(
      intelligenceMocks.routeSignalToMacroTheses,
    ).toHaveBeenCalledOnce();
  });

  it("does not queue a signal with no material thesis impact", async () => {
    const update = makeUpdate(repository, "not-eligible-for-requeue");
    repository.persistAnalyzedUpdate({
      ...update,
      materiality: "not-material",
      materialityReason: "The source repeats already captured evidence.",
      novelty: "repetition",
      sentiment: "not-material",
      thesisImpacts: [],
      macroThesisImpacts: [],
    });

    await expect(
      requeueSignalThesisEvaluation(repository, update.id),
    ).rejects.toThrow("not eligible for thesis evaluation");
    expect(repository.listRequeuedThesisEvaluationUpdates()).toEqual([]);
  });

  it("does not repeatedly classify a queued signal when no macro route is relevant", async () => {
    const update = {
      ...makeUpdate(repository, "company-only-requeue"),
      macroThesisImpacts: [],
    };
    repository.persistAnalyzedUpdate(update);
    intelligenceMocks.routeSignalToMacroTheses.mockResolvedValueOnce([]);

    await expect(
      requeueSignalThesisEvaluation(repository, update.id),
    ).resolves.toMatchObject({
      alreadyQueued: false,
      macroRouteCount: 0,
      routesClassified: true,
    });
    await expect(
      requeueSignalThesisEvaluation(repository, update.id),
    ).resolves.toMatchObject({
      alreadyQueued: true,
      macroRouteCount: 0,
      routesClassified: false,
    });
    expect(
      intelligenceMocks.routeSignalToMacroTheses,
    ).toHaveBeenCalledOnce();
  });

  it("persists a restored material re-evaluation when its deterministic ID was invalidated", async () => {
    const thesis = repository.getThesis("company-vrt");
    const update = repository.getUpdate("vrt-fy25-q4");
    const claim = update?.claims[0];
    const impact = update?.thesisImpacts[0];
    if (!thesis || !update || !claim || !impact) {
      throw new Error("Expected restored-material fixtures.");
    }
    const deterministicId = "restored-material-evaluation";
    const original = repository.persistThesisEvaluation({
      id: deterministicId,
      thesisId: thesis.id,
      outcome: "reinforced",
      summary: "The power backlog reinforces the thesis.",
      rationale: "The exact claim supports a modest confidence increase.",
      proposedBelief: thesis.currentVersion.belief,
      proposedConfidenceScore: thesis.currentVersion.confidenceScore + 2,
      proposedUnknowns: thesis.currentVersion.unknowns,
      proposedStrengtheningConditions:
        thesis.currentVersion.strengtheningConditions,
      proposedWeakeningConditions:
        thesis.currentVersion.weakeningConditions,
      signalIds: [update.id],
      evidence: [{
        claimId: claim.id,
        stance: "supports",
        rationale: "Direct backlog evidence.",
      }],
    });
    const reviews = createImpactReviewRepository(repository.database);
    const rejected = reviews.reviewImpact({
      impactId: impact.id,
      decision: "rejected",
      reasonTags: ["overstated-materiality"],
    });
    repository.reconcileImpactReview({
      updateId: rejected.updateId,
      impactId: rejected.impactId,
      companyTicker: rejected.companyTicker,
      decision: rejected.decision,
      previousDecision: null,
    });
    expect(
      repository.getThesisEvaluation(original.id)?.reviewStatus,
    ).toBe("rejected");

    const restored = reviews.reviewImpact({
      impactId: impact.id,
      decision: "accepted",
      reasonTags: ["useful-analysis"],
    });
    repository.reconcileImpactReview({
      updateId: restored.updateId,
      impactId: restored.impactId,
      companyTicker: restored.companyTicker,
      decision: restored.decision,
      previousDecision: "rejected",
    });
    intelligenceMocks.evaluateTheses.mockImplementation(
      async (input: {
        theses: Array<{
          id: string;
          currentVersion: {
            id: string;
            belief: string;
            confidenceScore: number;
            unknowns: string[];
            strengthenConditions: string[];
            weakenConditions: string[];
          };
        }>;
        signals: Array<{
          id: string;
          claims: Array<{ id: string }>;
        }>;
      }) => {
        const targetThesis = input.theses.find(
          (candidate) => candidate.id === thesis.id,
        );
        const signal = input.signals.find(
          (candidate) => candidate.id === update.id,
        );
        if (!targetThesis || !signal?.claims[0]) {
          throw new Error("Expected requeued evaluation input.");
        }
        return {
          evaluatedAt: "2026-07-01T00:00:00.000Z",
          model: "mock-evaluation-model",
          evaluations: [{
            id: deterministicId,
            thesisId: targetThesis.id,
            previousVersionId: targetThesis.currentVersion.id,
            outcome: "reinforced" as const,
            proposedBelief: null,
            proposedConfidenceScore:
              targetThesis.currentVersion.confidenceScore + 2,
            confidenceDelta: 2,
            rationale:
              "The restored material impact again clears the reinforcement threshold.",
            supportingEvidence: [{
              signalId: signal.id,
              claimIds: [signal.claims[0].id],
              reason: "The exact backlog claim supports the thesis.",
            }],
            opposingEvidence: [],
            signalIds: [signal.id],
            claimIds: [signal.claims[0].id],
            independentSourceCount: 1,
            unknowns: targetThesis.currentVersion.unknowns,
            strengthenConditions:
              targetThesis.currentVersion.strengthenConditions,
            weakenConditions:
              targetThesis.currentVersion.weakenConditions,
            evaluatedAt: "2026-07-01T00:00:00.000Z",
            model: "mock-evaluation-model",
          }],
        };
      },
    );

    const result = await evaluatePendingTheses(repository);

    expect(result.evaluations).toHaveLength(1);
    expect(result.evaluations[0]?.id).toMatch(
      /^restored-material-evaluation-retry-/,
    );
    expect(result.evaluations[0]?.reviewStatus).toBe("pending");
    expect(repository.listRequeuedThesisEvaluationUpdates()).toEqual([]);
  });

  it("generates the daily brief from belief evaluations when they exist", async () => {
    const thesis = repository.getThesis("company-vrt");
    const update = repository.getUpdate("vrt-fy25-q4");
    const claim = update?.claims[0];
    if (!thesis || !update || !claim) {
      throw new Error("Expected belief brief fixtures.");
    }
    const evaluation = repository.persistThesisEvaluation({
      id: "belief-brief-evaluation",
      thesisId: thesis.id,
      outcome: "reinforced",
      summary: "Power constraints became more durable.",
      rationale:
        "The exact backlog evidence raises confidence without changing the belief text.",
      proposedBelief: thesis.currentVersion.belief,
      proposedConfidenceScore: Math.min(
        100,
        thesis.currentVersion.confidenceScore + 5,
      ),
      proposedUnknowns: thesis.currentVersion.unknowns,
      proposedStrengtheningConditions:
        thesis.currentVersion.strengtheningConditions,
      proposedWeakeningConditions:
        thesis.currentVersion.weakeningConditions,
      signalIds: [update.id],
      evidence: [
        {
          claimId: claim.id,
          stance: "supports",
          rationale: "Backlog supports the duration of the constraint.",
        },
      ],
      model: "mock-evaluation-model",
    });
    const generated: DailyBrief = {
      id: "belief-centered-brief",
      date: "2026-06-30",
      title: "Power confidence moved",
      summary: "The mental model changed at the power layer.",
      signal: "Confidence in a durable constraint increased.",
      secondarySignals: [],
      updateIds: [update.id],
      citationClaimIds: [claim.id],
      thesisEvaluationIds: [evaluation.id],
      generatedAt: "2026-06-30T10:00:00.000Z",
      model: "mock-synthesis-model",
    };
    intelligenceMocks.synthesizeBeliefBrief.mockResolvedValue(generated);

    await expect(generateDailyBrief(repository)).resolves.toEqual(generated);
    expect(intelligenceMocks.synthesizeBeliefBrief).toHaveBeenCalledWith(
      [expect.objectContaining({ id: evaluation.id })],
      expect.arrayContaining([
        expect.objectContaining({ id: thesis.id }),
      ]),
      [expect.objectContaining({ id: update.id })],
    );
    expect(intelligenceMocks.synthesizeDailyBrief).not.toHaveBeenCalled();
  });

  it("returns an existing same-day brief when no newer signals exist", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const existing: DailyBrief = {
      id: "meaningful-today-brief",
      date: today,
      title: "Power remains constrained",
      summary: "A meaningful same-day synthesis.",
      signal: "Power delivery remains the binding bottleneck.",
      secondarySignals: [],
      updateIds: [],
      citationClaimIds: [],
      generatedAt: new Date().toISOString(),
      model: "mock-synthesis-model",
    };
    repository.persistDailyBrief(existing);

    await expect(generateDailyBrief(repository)).resolves.toEqual(existing);
    expect(intelligenceMocks.synthesizeDailyBrief).not.toHaveBeenCalled();
  });

  it("preserves a same-day meaningful brief when newer signals are only noise", async () => {
    const generatedAt = new Date();
    const existing: DailyBrief = {
      id: "meaningful-brief-before-noise",
      date: generatedAt.toISOString().slice(0, 10),
      title: "Power remains constrained",
      summary: "A meaningful same-day synthesis.",
      signal: "Power delivery remains the binding bottleneck.",
      secondarySignals: [],
      updateIds: [],
      citationClaimIds: [],
      generatedAt: generatedAt.toISOString(),
      model: "mock-synthesis-model",
    };
    repository.persistDailyBrief(existing);
    repository.persistAnalyzedUpdate({
      ...makeUpdate(repository, "new-repetition"),
      ingestedAt: new Date(generatedAt.getTime() + 1_000).toISOString(),
      materiality: "not-material",
      materialityReason: "The item repeats evidence already in the thesis.",
      novelty: "repetition",
      sentiment: "not-material",
      thesisImpacts: [],
    });

    await expect(generateDailyBrief(repository)).resolves.toEqual(existing);
    expect(intelligenceMocks.synthesizeDailyBrief).not.toHaveBeenCalled();
  });

  it("carries prior same-day brief signals into synthesis with a new material signal", async () => {
    const generatedAt = new Date();
    const priorUpdate = repository.getUpdate("vrt-fy25-q4");
    if (!priorUpdate) {
      throw new Error("Expected prior update fixture.");
    }
    repository.persistDailyBrief({
      id: "meaningful-brief-before-new-signal",
      date: generatedAt.toISOString().slice(0, 10),
      title: "Power remains constrained",
      summary: "The prior signal must remain in the daily window.",
      signal: "Power delivery remains the binding bottleneck.",
      secondarySignals: [],
      updateIds: [priorUpdate.id],
      citationClaimIds: [priorUpdate.claims[0]!.id],
      generatedAt: generatedAt.toISOString(),
      model: "mock-synthesis-model",
    });
    const newUpdate = {
      ...makeUpdate(repository, "new-material-signal"),
      ingestedAt: new Date(generatedAt.getTime() + 1_000).toISOString(),
    };
    repository.persistAnalyzedUpdate(newUpdate);
    const generated: DailyBrief = {
      id: "merged-same-day-brief",
      date: generatedAt.toISOString().slice(0, 10),
      title: "Power and networking moved",
      summary: "Both same-day signals were considered.",
      signal: "The new signal extends rather than erases the prior brief.",
      secondarySignals: [],
      updateIds: [priorUpdate.id, newUpdate.id],
      citationClaimIds: [
        priorUpdate.claims[0]!.id,
        newUpdate.claims[0]!.id,
      ],
      generatedAt: new Date(generatedAt.getTime() + 2_000).toISOString(),
      model: "mock-synthesis-model",
    };
    intelligenceMocks.synthesizeDailyBrief.mockResolvedValue(generated);

    await expect(generateDailyBrief(repository)).resolves.toEqual(generated);
    const updates =
      intelligenceMocks.synthesizeDailyBrief.mock.calls[0]?.[0] as
        | IntelligenceUpdate[]
        | undefined;
    expect(updates?.map((update) => update.id)).toEqual([
      priorUpdate.id,
      newUpdate.id,
    ]);
  });

  it("does not cap the first brief generation at 100 signals", async () => {
    repository.database.prepare("DELETE FROM daily_briefs").run();
    for (let index = 0; index < 101; index += 1) {
      repository.persistAnalyzedUpdate(
        makeUpdate(repository, `initial-signal-${index}`),
      );
    }
    const generated: DailyBrief = {
      id: "uncapped-initial-brief",
      date: "2026-06-29",
      title: "All initial signals considered",
      summary: "The first synthesis received the complete corpus.",
      signal: "No first-run signal was dropped by a fixed limit.",
      secondarySignals: [],
      updateIds: [],
      citationClaimIds: [],
      generatedAt: "2026-06-29T12:00:00.000Z",
      model: "mock-synthesis-model",
    };
    intelligenceMocks.synthesizeDailyBrief.mockResolvedValue(generated);

    await expect(generateDailyBrief(repository)).resolves.toEqual(generated);
    const updates =
      intelligenceMocks.synthesizeDailyBrief.mock.calls[0]?.[0] as
        | IntelligenceUpdate[]
        | undefined;
    expect(updates?.length).toBeGreaterThan(100);
    expect(
      updates?.filter((update) => update.id.startsWith("initial-signal-")),
    ).toHaveLength(101);
  });

  it("includes every signal ingested after the brief cursor regardless of publication date", async () => {
    const cursor = new Date("2026-06-27T23:00:00.000Z");
    repository.persistDailyBrief({
      id: "cursor-brief",
      date: "2026-06-27",
      title: "Cursor brief",
      summary: " establishes the synthesis cursor.",
      signal: "The next run must include every newly ingested signal.",
      secondarySignals: [],
      updateIds: [],
      citationClaimIds: [],
      generatedAt: cursor.toISOString(),
      model: "mock-synthesis-model",
    });
    for (let index = 0; index < 35; index += 1) {
      repository.persistAnalyzedUpdate({
        ...makeUpdate(repository, `cursor-signal-${index}`),
        publishedAt: `2025-01-${String((index % 28) + 1).padStart(2, "0")}T00:00:00.000Z`,
        ingestedAt: new Date(cursor.getTime() + (index + 1) * 1_000).toISOString(),
      });
    }
    const generated: DailyBrief = {
      id: "all-cursor-signals-brief",
      date: "2026-06-29",
      title: "All signals considered",
      summary: "The complete post-cursor set reached synthesis.",
      signal: "No backdated signal was skipped.",
      secondarySignals: [],
      updateIds: [],
      citationClaimIds: [],
      generatedAt: "2026-06-29T12:00:00.000Z",
      model: "mock-synthesis-model",
    };
    intelligenceMocks.synthesizeDailyBrief.mockResolvedValue(generated);

    await expect(generateDailyBrief(repository)).resolves.toEqual(generated);
    const updates =
      intelligenceMocks.synthesizeDailyBrief.mock.calls[0]?.[0] as
        | IntelligenceUpdate[]
        | undefined;
    expect(updates).toHaveLength(35);
    expect(updates?.[0]?.id).toBe("cursor-signal-0");
    expect(updates?.[34]?.id).toBe("cursor-signal-34");
  });
});

function makeUpdate(
  repository: RelayRepository,
  id: string,
): IntelligenceUpdate {
  const seed = repository.getUpdate("vrt-fy25-q4");
  if (!seed) {
    throw new Error("Expected the seeded update fixture.");
  }
  return {
    ...seed,
    id,
    title: `Service update ${id}`,
    ingestedAt: "2026-06-28T05:00:00.000Z",
    claims: seed.claims.slice(0, 1).map((claim) => ({
      ...claim,
      id: `claim-${id}`,
      sourceId: `source-${id}`,
    })),
    thesisImpacts: seed.thesisImpacts.slice(0, 1).map((impact) => ({
      ...impact,
      id: `impact-${id}`,
      decision: "proposed",
    })),
    model: "mock-analysis-model",
  };
}
