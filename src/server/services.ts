import type {
  DailyBrief,
  ImportSourceInput,
  IntelligenceUpdate,
  ResearchSource,
  SourceRefreshItem,
  SourceRefreshResult,
  Thesis,
  ThesisEvaluation,
  ThesisEvaluationRequeueResult,
} from "../shared/contracts.js";

import type { AppServices } from "./app.js";
import type { RelayRepository } from "./db/repository.js";
import {
  analyzeDocument,
  analyzeImportedSource as analyzePastedSource,
  analyzeUrlSource,
  evaluateTheses as runThesisEvaluation,
  routeSignalToMacroTheses as runMacroThesisRouting,
  selectBriefEligibleUpdates,
  type AnalysisContext,
  type AnalysisSourceProfile,
  type ThesisEvidenceSignalInput,
  type VersionedThesisInput,
  synthesizeBeliefBrief,
  synthesizeDailyBrief,
} from "./intelligence/index.js";
import {
  ACTIVE_AUTOMATED_SOURCES,
  deduplicateRssEntries,
  fetchRssSource,
  findSourceById,
  findSourceForUrl,
  normalizeRssEntry,
  selectRefreshCandidates,
  type PublicSourceDefinition,
  type SourceEntryBatch,
  type TrustedSourceDefinition,
} from "./ingestion/index.js";

const DEFAULT_REFRESH_MAX_ITEMS = 6;
const MAX_REFRESH_ITEMS = 12;
const MAX_THESES_PER_EVALUATION = 50;
const MAX_SIGNALS_PER_EVALUATION = 100;
const MANUAL_REEVALUATION_REASON =
  "Signal was manually queued after macro route classification.";

export interface PersistedThesisEvaluationBatch {
  evaluatedAt: string;
  model: string;
  evaluations: ThesisEvaluation[];
}

export function createAppServices(repository: RelayRepository): AppServices {
  return {
    analyzeImportedSource: (input) =>
      analyzeImportedSource(repository, input),
    refreshSources: () => refreshPublicSources(repository),
    refreshSource: (sourceId) =>
      refreshPublicSource(repository, sourceId),
    requeueSignalThesisEvaluation: (updateId) =>
      requeueSignalThesisEvaluation(repository, updateId),
    evaluateTheses: () => evaluatePendingTheses(repository),
    generateBrief: () => generateDailyBrief(repository),
  };
}

export async function analyzeImportedSource(
  repository: RelayRepository,
  input: ImportSourceInput,
): Promise<IntelligenceUpdate> {
  const source =
    (input.sourceProfileId
      ? configuredTrustedSource(
          repository.getSourceProfile(
            input.sourceProfileId,
            input.sourceUrl,
          ),
        )
      : input.sourceUrl
      ? configuredTrustedSource(
          repository.findSourceProfileForUrl(input.sourceUrl),
        ) ?? findSourceForUrl(input.sourceUrl)
      : undefined) ??
    findSourceById("manual-imports");
  const context = buildAnalysisContext(repository, source);
  if (input.content?.trim()) {
    return analyzePastedSource(input, { analysis: { context } });
  }
  if (!input.sourceUrl) {
    throw new Error("Provide pasted source content or a public source URL.");
  }
  return analyzeUrlSource(
    {
      url: input.sourceUrl,
      title: input.title,
      publisher: input.publisher,
      ...(input.publishedAt ? { publishedAt: input.publishedAt } : {}),
    },
    { analysis: { context } },
  );
}

export async function refreshPublicSources(
  repository: RelayRepository,
): Promise<SourceRefreshResult> {
  const activeSources = repository
    .listSources()
    .filter((source) => source.enabled)
    .map((source) => configuredAutomatedSource(source))
    .filter((source): source is PublicSourceDefinition => source !== null);
  return refreshConfiguredSources(repository, activeSources);
}

export async function refreshPublicSource(
  repository: RelayRepository,
  sourceId: string,
): Promise<SourceRefreshResult> {
  const source = configuredAutomatedSource(repository.getSource(sourceId));
  if (!source) {
    throw new RangeError(`Source is not refreshable: ${sourceId}`);
  }
  return refreshConfiguredSources(repository, [source]);
}

async function refreshConfiguredSources(
  repository: RelayRepository,
  activeSources: PublicSourceDefinition[],
): Promise<SourceRefreshResult> {
  let imported = 0;
  let analyzed = 0;
  let processed = 0;
  const errors: string[] = [];
  const items: SourceRefreshItem[] = [];
  const maxItems = Math.max(refreshLimit(), activeSources.length);
  const outcomes = await Promise.all(
    activeSources.map(async (source) => {
      repository.recordSourceSync(source.id, "syncing");
      try {
        const entries = deduplicateRssEntries(
          await fetchRssSource(source),
        ).toSorted(
          (left, right) =>
            Date.parse(right.publishedAt) - Date.parse(left.publishedAt),
        );
        repository.recordSourceSync(source.id, "ready");
        return { batch: { source, entries } satisfies SourceEntryBatch };
      } catch (error) {
        repository.recordSourceSync(source.id, "error");
        const message = safeMessage(error);
        return {
          error: `${source.name}: ${message}`,
          item: {
            sourceId: source.id,
            sourceName: source.name,
            title: `${source.name} feed`,
            sourceUrl: source.url,
            isNew: false,
            status: "error",
            updateId: null,
            error: message,
          } satisfies SourceRefreshItem,
        };
      }
    }),
  );
  const batches: SourceEntryBatch[] = [];
  outcomes.forEach((outcome) => {
    if ("batch" in outcome) {
      batches.push(outcome.batch);
    } else {
      errors.push(outcome.error);
      items.push(outcome.item);
    }
  });

  const schedule = selectRefreshCandidates(batches, {
    limit: activeSources.reduce(
      (total, source) => total + source.perRefreshQuota,
      0,
    ),
  });
  for (const { entry, source } of schedule) {
    if (processed >= maxItems) {
      break;
    }
    const document = repository.persistSourceDocument({
      title: entry.title,
      publisher: entry.publisher,
      sourceUrl: entry.sourceUrl,
      publishedAt: entry.publishedAt,
      content: entry.content,
      researchSourceId: source.id,
    });
    if (document.status === "suppressed") {
      items.push({
        sourceId: source.id,
        sourceName: source.name,
        title: entry.title,
        sourceUrl: entry.sourceUrl,
        isNew: false,
        status: "duplicate",
        updateId: null,
        error: null,
      });
      continue;
    }
    if (document.duplicate && document.status === "analyzed") {
      items.push({
        sourceId: source.id,
        sourceName: source.name,
        title: entry.title,
        sourceUrl: entry.sourceUrl,
        isNew: false,
        status: "duplicate",
        updateId: document.updateId,
        error: null,
      });
      continue;
    }

    processed += 1;
    imported += document.duplicate ? 0 : 1;
    try {
      const normalized = normalizeRssEntry(entry, {
        sourceType: source.type,
      });
      const update = await analyzeDocument(normalized, {
        context: buildAnalysisContext(repository, source),
      });
      const persisted = repository.persistAnalyzedUpdate(update);
      repository.markSourceDocumentAnalyzed(document.id, persisted.id);
      analyzed += 1;
      items.push({
        sourceId: source.id,
        sourceName: source.name,
        title: entry.title,
        sourceUrl: entry.sourceUrl,
        isNew: !document.duplicate,
        status: "analyzed",
        updateId: persisted.id,
        error: null,
      });
    } catch (error) {
      const message = safeMessage(error);
      repository.markSourceDocumentError(document.id, message);
      errors.push(`${source.name}: ${message}`);
      items.push({
        sourceId: source.id,
        sourceName: source.name,
        title: entry.title,
        sourceUrl: entry.sourceUrl,
        isNew: !document.duplicate,
        status: "error",
        updateId: null,
        error: message,
      });
    }
  }
  return { imported, analyzed, errors, items };
}

export async function generateDailyBrief(
  repository: RelayRepository,
): Promise<DailyBrief> {
  const latestBrief = repository.getDashboard().brief;
  const newUpdates = latestBrief
    ? repository.listUpdatesIngestedAfter(latestBrief.generatedAt)
    : repository.listAllUpdates();
  const today = new Date().toISOString().slice(0, 10);
  const newEvaluations = latestBrief
    ? repository.listThesisEvaluationsSince(latestBrief.generatedAt)
    : repository.listRecentThesisEvaluations(100);
  const previousBriefEvaluations =
    latestBrief?.date === today
      ? (latestBrief.thesisEvaluationIds ?? [])
          .map((evaluationId) =>
            repository.getThesisEvaluation(evaluationId),
          )
          .filter(
            (evaluation): evaluation is ThesisEvaluation =>
              evaluation !== null,
          )
      : [];
  const evaluations = [
    ...new Map(
      [...previousBriefEvaluations, ...newEvaluations].map(
        (evaluation) => [evaluation.id, evaluation],
      ),
    ).values(),
  ];
  if (evaluations.length > 0) {
    const evaluationUpdates = [
      ...new Map(
        evaluations
          .flatMap((evaluation) => evaluation.signalIds)
          .map((updateId) => repository.getUpdate(updateId))
          .filter(
            (update): update is IntelligenceUpdate => update !== null,
          )
          .map((update) => [update.id, update]),
      ).values(),
    ];
    return synthesizeBeliefBrief(
      evaluations,
      repository.listTheses({ status: "active" }),
      evaluationUpdates,
    );
  }
  if (
    latestBrief?.date === today &&
    selectBriefEligibleUpdates(newUpdates).length === 0
  ) {
    return latestBrief;
  }
  const previousBriefUpdates =
    latestBrief?.date === today
      ? latestBrief.updateIds
          .map((updateId) => repository.getUpdate(updateId))
          .filter((update): update is IntelligenceUpdate => update !== null)
      : [];
  const updates = [
    ...new Map(
      [...previousBriefUpdates, ...newUpdates].map((update) => [
        update.id,
        update,
      ]),
    ).values(),
  ];
  const sourceProfilesByUpdateId: Record<
    string,
    Pick<
      AnalysisSourceProfile,
      "id" | "name" | "role" | "authorityTier" | "priority"
    >
  > = {};
  updates.forEach((update) => {
    const sourceId = repository.getResearchSourceIdForUpdate(update.id);
    const source = sourceId
      ? findSourceById(sourceId) ??
        configuredTrustedSource(repository.getSource(sourceId))
      : undefined;
    if (source) {
      sourceProfilesByUpdateId[update.id] = {
        id: source.id,
        name: source.name,
        role: source.role,
        authorityTier: source.authorityTier,
        priority: source.priority,
      };
    }
  });
  const brief = await synthesizeDailyBrief(updates, {
    sourceProfilesByUpdateId,
  });
  const thesisEvaluationIds = relevantAcceptedEvaluationIds(
    repository,
    brief.updateIds,
  );
  return thesisEvaluationIds.length > 0
    ? {
        ...brief,
        thesisEvaluationIds: [
          ...new Set([
            ...(brief.thesisEvaluationIds ?? []),
            ...thesisEvaluationIds,
          ]),
        ],
      }
    : brief;
}

export async function evaluatePendingTheses(
  repository: RelayRepository,
): Promise<PersistedThesisEvaluationBatch> {
  const latestEvaluationCursor =
    repository.getLatestThesisEvaluationRunCursor();
  const newUpdates = latestEvaluationCursor
    ? repository.listUpdatesIngestedAfter(latestEvaluationCursor)
    : repository.listAllUpdates();
  const requeuedUpdates =
    repository.listRequeuedThesisEvaluationUpdates();
  const candidateUpdates = [
    ...new Map(
      [...newUpdates, ...requeuedUpdates].map((update) => [
        update.id,
        update,
      ]),
    ).values(),
  ];
  const pendingUpdates = selectThesisEvaluationEligibleUpdates(
    candidateUpdates,
  );
  const signalIngestionCursor = candidateUpdates.reduce<string | null>(
    (latest, update) =>
      !latest || update.ingestedAt > latest ? update.ingestedAt : latest,
    latestEvaluationCursor,
  );
  const theses = repository.listTheses({ status: "active" });
  const thesisBatches = chunksOf(
    theses.map(toEvaluationThesis),
    MAX_THESES_PER_EVALUATION,
  );
  const signalBatches = chunksOf(
    pendingUpdates.map((update) =>
      toEvaluationSignal(repository, update),
    ),
    MAX_SIGNALS_PER_EVALUATION,
  );

  if (thesisBatches.length === 0 || signalBatches.length === 0) {
    const empty = await runThesisEvaluation({
      theses: thesisBatches[0] ?? [],
      signals: [],
    });
    if (signalIngestionCursor) {
      repository.recordThesisEvaluationRun({
        signalIngestionCursor,
        signalCount: pendingUpdates.length,
        evaluationCount: 0,
        model: empty.model,
        completedAt: empty.evaluatedAt,
      });
    }
    repository.clearThesisEvaluationRequeue(
      requeuedUpdates.map((update) => update.id),
    );
    return { ...empty, evaluations: [] };
  }

  let evaluatedAt = "";
  let model = "";
  const evaluations: ThesisEvaluation[] = [];
  for (const thesisBatch of thesisBatches) {
    const thesisIdsInBatch = new Set(
      thesisBatch.map((thesis) => thesis.id),
    );
    for (const signalBatch of signalBatches) {
      const batch = await runThesisEvaluation({
        theses: thesisBatch,
        signals: signalBatch.map((signal) => ({
          ...signal,
          macroThesisImpacts: signal.macroThesisImpacts.filter((impact) =>
            thesisIdsInBatch.has(impact.thesisId),
          ),
        })),
      });
      evaluatedAt = batch.evaluatedAt;
      model = batch.model;
      for (const proposal of batch.evaluations) {
        const thesis = theses.find(
          (candidate) => candidate.id === proposal.thesisId,
        );
        if (!thesis) {
          throw new Error(
            `Thesis evaluation referenced unknown thesis ${proposal.thesisId}.`,
          );
        }
        evaluations.push(
          repository.persistThesisEvaluation({
            id: proposal.id,
            thesisId: proposal.thesisId,
            outcome: proposal.outcome,
            summary: evaluationSummary(thesis, proposal.outcome),
            rationale: proposal.rationale,
            proposedBelief:
              proposal.proposedBelief ?? thesis.currentVersion.belief,
            proposedConfidenceScore: proposal.proposedConfidenceScore,
            proposedUnknowns: proposal.unknowns,
            proposedStrengtheningConditions:
              proposal.strengthenConditions,
            proposedWeakeningConditions: proposal.weakenConditions,
            signalIds: proposal.signalIds,
            reviewRecommendation: proposal.reviewRecommendation,
            reviewRecommendationReason:
              proposal.reviewRecommendationReason,
            evidence: [
              ...proposal.supportingEvidence.flatMap((reference) =>
                reference.claimIds.map((claimId) => ({
                  claimId,
                  stance: "supports" as const,
                  rationale: reference.reason,
                })),
              ),
              ...proposal.opposingEvidence.flatMap((reference) =>
                reference.claimIds.map((claimId) => ({
                  claimId,
                  stance: "opposes" as const,
                  rationale: reference.reason,
                })),
              ),
              ...(proposal.contextEvidence ?? []).flatMap((reference) =>
                reference.claimIds.map((claimId) => ({
                  claimId,
                  stance: "context" as const,
                  rationale: reference.reason,
                })),
              ),
            ],
            model: proposal.model,
          }),
        );
      }
    }
  }
  if (signalIngestionCursor) {
    repository.recordThesisEvaluationRun({
      signalIngestionCursor,
      signalCount: pendingUpdates.length,
      evaluationCount: evaluations.length,
      model,
      completedAt: evaluatedAt,
    });
  }
  repository.clearThesisEvaluationRequeue(
    requeuedUpdates.map((update) => update.id),
  );
  return { evaluatedAt, model, evaluations };
}

export async function routeStoredSignalToMacroTheses(
  repository: RelayRepository,
  updateId: string,
): Promise<IntelligenceUpdate> {
  const update = repository.getUpdate(updateId);
  if (!update) {
    throw new RangeError(`Unknown signal: ${updateId}`);
  }
  if (update.macroThesisImpacts.length > 0) {
    return update;
  }
  if (
    update.materiality === "not-material" ||
    update.novelty === "repetition" ||
    update.claims.length === 0
  ) {
    return update;
  }
  const macroTheses = repository
    .listTheses({ kind: "macro", status: "active" })
    .map((thesis) => ({
      id: thesis.id,
      title: thesis.title,
      belief: thesis.currentVersion.belief,
      confidenceScore: thesis.currentVersion.confidenceScore,
      unknowns: thesis.currentVersion.unknowns,
      strengtheningConditions:
        thesis.currentVersion.strengtheningConditions,
      weakeningConditions:
        thesis.currentVersion.weakeningConditions,
      layerIds: thesis.layerIds,
    }));
  const macroThesisImpacts = await runMacroThesisRouting(
    update,
    macroTheses,
  );
  return repository.persistAnalyzedUpdate({
    ...update,
    macroThesisImpacts,
  });
}

export function selectThesisEvaluationEligibleUpdates(
  updates: IntelligenceUpdate[],
): IntelligenceUpdate[] {
  return selectBriefEligibleUpdates(updates);
}

export async function requeueSignalThesisEvaluation(
  repository: RelayRepository,
  updateId: string,
): Promise<ThesisEvaluationRequeueResult> {
  let update = repository.getUpdate(updateId);
  if (!update) {
    throw new RangeError(`Unknown signal: ${updateId}`);
  }
  let routesClassified = false;
  const wasManuallyPrepared =
    repository.getThesisEvaluationRequeueReason(updateId) ===
    MANUAL_REEVALUATION_REASON;
  if (
    (update.macroThesisImpacts ?? []).length === 0 &&
    !wasManuallyPrepared
  ) {
    update = await routeStoredSignalToMacroTheses(repository, updateId);
    routesClassified = true;
  }
  if (selectThesisEvaluationEligibleUpdates([update]).length === 0) {
    throw new TypeError(
      "This signal is not eligible for thesis evaluation. It needs at least one material company or macro thesis impact.",
    );
  }
  return {
    ...repository.queueThesisEvaluationUpdate(
      updateId,
      MANUAL_REEVALUATION_REASON,
    ),
    macroRouteCount: (update.macroThesisImpacts ?? []).length,
    routesClassified,
  };
}

function configuredAutomatedSource(
  source: ResearchSource | null,
): PublicSourceDefinition | null {
  if (!source?.url || !["rss", "paper", "release"].includes(source.type)) {
    return null;
  }
  const builtIn = ACTIVE_AUTOMATED_SOURCES.find(
    (definition) => definition.id === source.id,
  );
  if (builtIn) {
    return { ...builtIn, thesisIds: source.thesisIds };
  }
  if (!source.userAdded) {
    return null;
  }
  return {
    id: source.id,
    name: source.name,
    type: source.type as PublicSourceDefinition["type"],
    role: source.role,
    authorityTier: source.authorityTier,
    layerIds: source.layerIds,
    companyTickers: source.companyTickers,
    thesisIds: source.thesisIds,
    intakeMode: "feed",
    fetchStrategy: source.type === "release" ? "atom" : "rss",
    url: source.url,
    allowedDomains: [new URL(source.url).hostname],
    enabledByDefault: true,
    priority: 75,
    perRefreshQuota: 1,
    topicRules: {
      maxAgeDays: source.type === "paper" ? 21 : 45,
    },
  };
}

function configuredTrustedSource(
  source: ResearchSource | null,
): TrustedSourceDefinition | undefined {
  if (!source) {
    return undefined;
  }
  const builtIn = findSourceById(source.id);
  if (builtIn) {
    return { ...builtIn, thesisIds: source.thesisIds };
  }
  if (!source.userAdded) {
    return undefined;
  }
  const automated = configuredAutomatedSource(source);
  if (automated) {
    return automated;
  }
  return {
    id: source.id,
    name: source.name,
    type: source.type,
    role: source.role,
    authorityTier: source.authorityTier,
    layerIds: source.layerIds,
    companyTickers: source.companyTickers,
    thesisIds: source.thesisIds,
    intakeMode: source.url ? "public-url" : "manual-excerpt",
    fetchStrategy: source.url ? "on-demand-url" : "manual",
    url: source.url,
    allowedDomains: source.domain ? [source.domain] : [],
    enabledByDefault: false,
    priority:
      source.authorityTier === "first-party"
        ? 95
        : source.authorityTier === "specialist"
          ? 90
          : source.authorityTier === "context"
            ? 75
            : 50,
    perRefreshQuota: 0,
  };
}

function buildAnalysisContext(
  repository: RelayRepository,
  source: TrustedSourceDefinition | undefined,
): AnalysisContext {
  return {
    watchlistCompanies: repository.listCompanies().map((company) => ({
      ticker: company.ticker,
      thesis: company.thesis,
      provesRight: company.provesRight,
      breaksThesis: company.breaksThesis,
      watchMetrics: company.watchMetrics,
    })),
    recentSignals: repository.listUpdates(20).map((update) => ({
      id: update.id,
      title: update.title,
      publishedAt: update.publishedAt,
      companyTickers: update.companyTickers,
      materiality: update.materiality,
      whatHappened: update.whatHappened,
      thesisImpacts: update.thesisImpacts.map((impact) => ({
        companyTicker: impact.companyTicker,
        direction: impact.direction,
        thesisDelta: impact.thesisDelta,
      })),
    })),
    sourceProfile: source
      ? {
          id: source.id,
          name: source.name,
          role: source.role,
          authorityTier: source.authorityTier,
          priority: source.priority,
          layerIds: source.layerIds,
          companyTickers: source.companyTickers,
          thesisIds: source.thesisIds ?? [],
        }
      : null,
    macroTheses: repository
      .listTheses({ kind: "macro", status: "active" })
      .map((thesis) => ({
        id: thesis.id,
        title: thesis.title,
        belief: thesis.currentVersion.belief,
        confidenceScore: thesis.currentVersion.confidenceScore,
        unknowns: thesis.currentVersion.unknowns,
        strengtheningConditions:
          thesis.currentVersion.strengtheningConditions,
        weakeningConditions:
          thesis.currentVersion.weakeningConditions,
        layerIds: thesis.layerIds,
      })),
  };
}

function toEvaluationThesis(thesis: Thesis): VersionedThesisInput {
  return {
    id: thesis.id,
    type: thesis.kind,
    title: thesis.title,
    currentVersion: {
      id: thesis.currentVersion.id,
      belief: thesis.currentVersion.belief,
      confidenceScore: thesis.currentVersion.confidenceScore,
      unknowns: thesis.currentVersion.unknowns,
      strengthenConditions:
        thesis.currentVersion.strengtheningConditions,
      weakenConditions: thesis.currentVersion.weakeningConditions,
    },
    companyTickers: thesis.companyTickers,
    layerIds: thesis.layerIds,
  };
}

function toEvaluationSignal(
  repository: RelayRepository,
  update: IntelligenceUpdate,
): ThesisEvidenceSignalInput {
  const sourceId =
    repository.getResearchSourceIdForUpdate(update.id) ??
    update.claims[0]?.sourceId ??
    `publisher-${slugify(update.publisher)}`;
  const sourceProfile =
    findSourceById(sourceId) ??
    configuredTrustedSource(repository.getSource(sourceId));
  return {
    id: update.id,
    title: update.title,
    publishedAt: update.publishedAt,
    sourceProvenance: {
      id: sourceId,
      publisher:
        sourceProfile?.name ??
        repository.getSource(sourceId)?.name ??
        update.publisher,
      authorityTier: sourceProfile?.authorityTier ?? "unknown",
    },
    companyTickers: update.companyTickers,
    layerIds: update.layerIds,
    whatHappened: update.whatHappened,
    whyItMatters: update.whyItMatters,
    macroThesisImpacts: (update.macroThesisImpacts ?? []).map((impact) => ({
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
  };
}

function evaluationSummary(
  thesis: Thesis,
  outcome: ThesisEvaluation["outcome"],
): string {
  switch (outcome) {
    case "unchanged":
      return `${thesis.title}: no thesis change.`;
    case "reinforced":
      return `${thesis.title}: confidence strengthened.`;
    case "weakened":
      return `${thesis.title}: confidence weakened.`;
    case "contradicted":
      return `${thesis.title}: contradictory evidence requires review.`;
    case "revised":
      return `${thesis.title}: thesis revision proposed.`;
  }
}

function relevantAcceptedEvaluationIds(
  repository: RelayRepository,
  updateIds: readonly string[],
): string[] {
  const includedUpdates = new Set(updateIds);
  return repository
    .listRecentThesisEvaluations(100)
    .filter(
      (evaluation) =>
        evaluation.reviewStatus === "accepted" &&
        evaluation.outcome !== "unchanged" &&
        evaluation.signalIds.some((id) => includedUpdates.has(id)),
    )
    .map((evaluation) => evaluation.id);
}

function chunksOf<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function slugify(value: string): string {
  const slug = value
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "unknown";
}

export function resolveResearchSourceId(input: ImportSourceInput): string {
  if (input.sourceUrl) {
    const source = findSourceForUrl(input.sourceUrl);
    if (source) {
      return source.id;
    }
  }
  return "manual-imports";
}

function refreshLimit(): number {
  const parsed = Number.parseInt(
    process.env.RELAY_REFRESH_MAX_ITEMS ?? `${DEFAULT_REFRESH_MAX_ITEMS}`,
    10,
  );
  if (!Number.isSafeInteger(parsed)) {
    return DEFAULT_REFRESH_MAX_ITEMS;
  }
  return Math.max(1, Math.min(parsed, MAX_REFRESH_ITEMS));
}

function safeMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return "Unknown source processing error.";
  }
  return error.message.slice(0, 240);
}
