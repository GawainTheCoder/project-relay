import {
  mkdtempSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type {
  DailyBrief,
  IntelligenceUpdate,
  ThesisEvaluationInput,
} from "../../shared/contracts.js";

import { createImpactReviewRepository } from "../evaluation/index.js";
import { SOURCE_CATALOG_ROWS } from "../ingestion/source-registry.js";
import {
  createRelayRepository,
  RelayRepository,
} from "./repository.js";

describe("RelayRepository", () => {
  let repository: RelayRepository;

  beforeEach(() => {
    repository = createRelayRepository(":memory:");
  });

  afterEach(() => {
    repository.close();
  });

  it("creates and idempotently seeds the complete MVP catalog", () => {
    const first = repository.getDashboard();

    expect(first.companies).toHaveLength(13);
    expect(first.layers).toHaveLength(10);
    expect(first.updates).toHaveLength(7);
    expect(first.sources).toHaveLength(SOURCE_CATALOG_ROWS.length);
    expect(first.brief?.updateIds.length).toBeGreaterThan(0);

    const secondRepositoryView = repository.getDashboard();
    expect(secondRepositoryView.companies).toHaveLength(13);
    expect(secondRepositoryView.updates).toHaveLength(7);
  });

  it("seeds company and macro theses as first-class versioned beliefs", () => {
    const theses = repository.listTheses();
    const companyTheses = repository.listTheses({ kind: "company" });
    const macroTheses = repository.listTheses({ kind: "macro" });

    expect(theses).toHaveLength(19);
    expect(companyTheses).toHaveLength(13);
    expect(macroTheses).toHaveLength(6);
    expect(repository.getThesis("company-nvda")).toMatchObject({
      kind: "company",
      companyTickers: ["NVDA"],
      currentVersion: {
        version: 1,
        confidenceScore: 85,
      },
    });
    expect(repository.getThesis("macro-networking-bottleneck")).toMatchObject({
      kind: "macro",
      layerIds: ["accelerators", "networking", "optics"],
      currentVersion: {
        version: 1,
        confidenceScore: 70,
      },
    });
  });

  it("additively backfills legacy company theses when the belief migration runs", () => {
    const database = new DatabaseSync(":memory:");
    database.exec(`
      CREATE TABLE schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      );
      INSERT INTO schema_migrations (version, applied_at) VALUES
        (1, '2026-01-01T00:00:00.000Z'),
        (2, '2026-01-01T00:00:00.000Z'),
        (3, '2026-01-01T00:00:00.000Z'),
        (4, '2026-01-01T00:00:00.000Z'),
        (5, '2026-01-01T00:00:00.000Z');

      CREATE TABLE stack_layers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        sort_order INTEGER NOT NULL UNIQUE
      );
      CREATE TABLE companies (
        ticker TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        thesis TEXT NOT NULL,
        why_it_matters TEXT NOT NULL,
        proves_right_json TEXT NOT NULL,
        breaks_thesis_json TEXT NOT NULL,
        watch_metrics_json TEXT NOT NULL,
        confidence TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        archived INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE company_layers (
        company_ticker TEXT NOT NULL,
        layer_id TEXT NOT NULL,
        PRIMARY KEY (company_ticker, layer_id)
      );
      CREATE TABLE intelligence_updates (id TEXT PRIMARY KEY);
      CREATE TABLE evidence_claims (
        id TEXT PRIMARY KEY,
        update_id TEXT NOT NULL,
        quote TEXT NOT NULL,
        source_id TEXT NOT NULL,
        locator TEXT NOT NULL
      );
      CREATE TABLE research_sources (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        url TEXT,
        enabled INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'ready',
        last_synced_at TEXT,
        document_count INTEGER NOT NULL DEFAULT 0,
        archived INTEGER NOT NULL DEFAULT 0,
        user_added INTEGER NOT NULL DEFAULT 0,
        layer_ids_json TEXT NOT NULL DEFAULT '[]',
        company_tickers_json TEXT NOT NULL DEFAULT '[]'
      );
      CREATE TABLE source_documents (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        publisher TEXT NOT NULL,
        source_url TEXT,
        published_at TEXT NOT NULL,
        content TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        analysis_status TEXT NOT NULL DEFAULT 'pending',
        update_id TEXT,
        ingested_at TEXT NOT NULL,
        error_message TEXT,
        source_kind TEXT NOT NULL DEFAULT 'other',
        filename TEXT,
        research_source_id TEXT,
        analysis_version TEXT NOT NULL DEFAULT 'legacy'
      );
      CREATE TABLE daily_briefs (id TEXT PRIMARY KEY);
      INSERT INTO stack_layers VALUES (
        'memory', 'Memory', 'Memory systems', 1
      );
      INSERT INTO companies VALUES (
        'TEST',
        'Legacy Memory Company',
        'Legacy description',
        'HBM remains structurally constrained.',
        'It supplies a bottleneck.',
        '["Lead times stay elevated"]',
        '["Supply exceeds demand"]',
        '["HBM pricing"]',
        'medium',
        '2026-06-01T00:00:00.000Z',
        0
      );
      INSERT INTO company_layers VALUES ('TEST', 'memory');
    `);
    const legacyRepository = new RelayRepository(database);
    try {
      expect(legacyRepository.getThesis("company-test")).toMatchObject({
        kind: "company",
        title: "Legacy Memory Company",
        companyTickers: ["TEST"],
        layerIds: ["memory"],
        currentVersion: {
          belief: "HBM remains structurally constrained.",
          confidenceScore: 60,
          strengtheningConditions: ["Lead times stay elevated"],
          weakeningConditions: ["Supply exceeds demand"],
        },
      });
    } finally {
      legacyRepository.close();
    }
  });

  it("creates a version and evidence ledger entry only when a changed evaluation is accepted", () => {
    const input = buildEvaluation(repository, {
      id: "evaluation-nvda-reinforced",
      outcome: "reinforced",
      proposedConfidenceScore: 88,
    });
    const pending = repository.persistThesisEvaluation(input);

    expect(pending).toMatchObject({
      id: input.id,
      reviewStatus: "pending",
      previousConfidenceScore: 85,
      proposedConfidenceScore: 88,
      confidenceDelta: 3,
      reviewRecommendation: "accept",
      reviewRecommendationReason:
        "The cited evidence supports a modest confidence increase.",
      signalIds: ["nvda-fy26-q4"],
      claimIds: ["claim-nvda-dc"],
    });
    expect(repository.getThesis("company-nvda")?.versions).toHaveLength(1);

    const accepted = repository.reviewThesisEvaluation(pending.id, {
      decision: "accepted",
      note: "Independent demand evidence warrants a small confidence increase.",
    });
    const thesis = repository.getThesis("company-nvda");

    expect(accepted.reviewStatus).toBe("accepted");
    expect(accepted.acceptedVersionId).not.toBe(pending.previousVersionId);
    expect(thesis?.currentVersion).toMatchObject({
      version: 2,
      confidenceScore: 88,
      createdByEvaluationId: pending.id,
    });
    expect(thesis?.evidence).toEqual([
      expect.objectContaining({
        claimId: "claim-nvda-dc",
        stance: "supports",
        linkedByEvaluationId: pending.id,
      }),
    ]);
  });

  it("preserves accepted unchanged evaluations without creating a thesis version", () => {
    const current = repository.getThesis("company-nvda")?.currentVersion;
    if (!current) {
      throw new Error("Seed thesis missing");
    }
    const evaluation = repository.persistThesisEvaluation({
      ...buildEvaluation(repository, {
        id: "evaluation-nvda-unchanged",
        outcome: "unchanged",
        proposedConfidenceScore: current.confidenceScore,
      }),
      proposedBelief: current.belief,
      proposedUnknowns: current.unknowns,
      proposedStrengtheningConditions: current.strengtheningConditions,
      proposedWeakeningConditions: current.weakeningConditions,
    });

    const accepted = repository.reviewThesisEvaluation(evaluation.id, {
      decision: "accepted",
    });
    const thesis = repository.getThesis("company-nvda");

    expect(accepted).toMatchObject({
      reviewStatus: "accepted",
      acceptedVersionId: current.id,
      confidenceDelta: 0,
    });
    expect(thesis?.versions).toHaveLength(1);
    expect(thesis?.currentVersion.id).toBe(current.id);
    expect(thesis?.evidence).toHaveLength(1);
  });

  it("keeps rejected evaluations auditable without changing belief state or evidence", () => {
    const evaluation = repository.persistThesisEvaluation(
      buildEvaluation(repository, {
        id: "evaluation-nvda-rejected",
        outcome: "reinforced",
        proposedConfidenceScore: 90,
      }),
    );

    const rejected = repository.reviewThesisEvaluation(evaluation.id, {
      decision: "rejected",
      note: "The source is not independent of existing evidence.",
    });
    const thesis = repository.getThesis("company-nvda");

    expect(rejected).toMatchObject({
      reviewStatus: "rejected",
      acceptedVersionId: null,
    });
    expect(thesis?.versions).toHaveLength(1);
    expect(thesis?.evidence).toEqual([]);
  });

  it("defers an evaluation without changing the thesis and allows later review", () => {
    const evaluation = repository.persistThesisEvaluation(
      buildEvaluation(repository, {
        id: "evaluation-nvda-deferred",
        outcome: "reinforced",
        proposedConfidenceScore: 87,
      }),
    );
    const before = repository.getThesis("company-nvda")?.currentVersion;

    const deferred = repository.reviewThesisEvaluation(evaluation.id, {
      decision: "deferred",
      note: "Wait for an independent production-deployment datapoint.",
    });

    expect(deferred).toMatchObject({
      reviewStatus: "deferred",
      reviewNote: "Wait for an independent production-deployment datapoint.",
      acceptedVersionId: null,
    });
    expect(deferred.reviewedAt).not.toBeNull();
    expect(repository.getThesis("company-nvda")?.currentVersion).toEqual(before);
    expect(repository.getThesis("company-nvda")?.evidence).toEqual([]);

    expect(
      repository.reviewThesisEvaluation(evaluation.id, {
        decision: "accepted",
      }),
    ).toMatchObject({
      reviewStatus: "accepted",
      proposedConfidenceScore: 87,
    });
  });

  it("invalidates only affected pending evaluations and durably requeues restored material impacts", () => {
    const seed = repository.getUpdate("nvda-fy26-q4");
    if (!seed) {
      throw new Error("Seed signal missing");
    }
    const update: IntelligenceUpdate = {
      ...seed,
      id: "review-reconciliation-signal",
      companyTickers: ["AMD", "NVDA"],
      claims: seed.claims.map((claim) => ({
        ...claim,
        id: `review-reconciliation-${claim.id}`,
      })),
      thesisImpacts: [
        {
          ...seed.thesisImpacts[0]!,
          id: "review-reconciliation-nvda",
        },
        {
          ...seed.thesisImpacts[0]!,
          id: "review-reconciliation-amd",
          companyTicker: "AMD",
          summary: "The same evidence remains relevant to AMD competition.",
          thesisDelta: "Preserves the competitive context for AMD.",
        },
      ],
    };
    repository.persistAnalyzedUpdate(update);
    const companyEvaluation = repository.persistThesisEvaluation(
      buildEvaluation(repository, {
        id: "review-reconciliation-company",
        signalIds: [update.id],
        evidence: [{
          claimId: update.claims[0]!.id,
          stance: "supports",
          rationale: "The evidence supports the company thesis.",
        }],
      }),
    );
    const macroEvaluation = repository.persistThesisEvaluation(
      buildEvaluation(repository, {
        id: "review-reconciliation-macro",
        thesisId: "macro-custom-silicon",
        signalIds: [update.id],
        evidence: [{
          claimId: update.claims[0]!.id,
          stance: "supports",
          rationale: "The evidence remains relevant at the macro layer.",
        }],
      }),
    );
    repository.persistDailyBrief({
      id: "review-reconciliation-brief",
      date: "2026-07-02",
      title: "Pending review synthesis",
      summary: "This brief must be regenerated after review.",
      signal: "A company impact remains under review.",
      secondarySignals: [],
      updateIds: [update.id],
      citationClaimIds: [update.claims[0]!.id],
      thesisEvaluationIds: [companyEvaluation.id, macroEvaluation.id],
      generatedAt: "2026-07-02T12:00:00.000Z",
      model: "test-model",
    });
    const reviewRepository = createImpactReviewRepository(
      repository.database,
    );
    const rejected = reviewRepository.reviewImpact({
      impactId: "review-reconciliation-nvda",
      decision: "rejected",
      reasonTags: ["overstated-materiality"],
    });

    const invalidated = repository.reconcileImpactReview({
      updateId: rejected.updateId,
      impactId: rejected.impactId,
      companyTicker: rejected.companyTicker,
      decision: rejected.decision,
      previousDecision: null,
    });

    expect(invalidated).toEqual({
      invalidatedEvaluationIds: [companyEvaluation.id],
      requeued: false,
    });
    expect(
      repository.getThesisEvaluation(companyEvaluation.id),
    ).toMatchObject({
      reviewStatus: "rejected",
      reviewNote: expect.stringContaining("marked not material"),
    });
    expect(
      repository.getThesisEvaluation(macroEvaluation.id)?.reviewStatus,
    ).toBe("pending");
    expect(
      repository.getBrief("review-reconciliation-brief"),
    ).toBeNull();

    const restored = reviewRepository.reviewImpact({
      impactId: "review-reconciliation-nvda",
      decision: "accepted",
      reasonTags: ["useful-analysis"],
    });
    expect(
      repository.reconcileImpactReview({
        updateId: restored.updateId,
        impactId: restored.impactId,
        companyTicker: restored.companyTicker,
        decision: restored.decision,
        previousDecision: "rejected",
      }),
    ).toEqual({
      invalidatedEvaluationIds: [],
      requeued: true,
    });
    expect(
      repository.listRequeuedThesisEvaluationUpdates().map(
        (candidate) => candidate.id,
      ),
    ).toEqual([update.id]);
    expect(
      repository.getThesisEvaluation(companyEvaluation.id)?.reviewNote,
    ).toMatch(/^Invalidated after impact /);

    const retriedCompanyEvaluation =
      repository.persistThesisEvaluation(
        buildEvaluation(repository, {
          id: companyEvaluation.id,
          signalIds: [update.id],
          evidence: [{
            claimId: update.claims[0]!.id,
            stance: "supports",
            rationale: "The restored material impact supports retrying.",
          }],
        }),
      );
    expect(retriedCompanyEvaluation.id).not.toBe(companyEvaluation.id);
    expect(retriedCompanyEvaluation.id).toMatch(
      /^review-reconciliation-company-retry-/,
    );
    expect(retriedCompanyEvaluation.reviewStatus).toBe("pending");

    expect(
      repository.persistThesisEvaluation(
        buildEvaluation(repository, {
          id: macroEvaluation.id,
          thesisId: "macro-custom-silicon",
          signalIds: [update.id],
          evidence: [{
            claimId: update.claims[0]!.id,
            stance: "supports",
            rationale: "The evidence remains relevant at the macro layer.",
          }],
        }),
      ).id,
    ).toBe(macroEvaluation.id);
  });

  it("idempotently queues a signal for re-evaluation and supersedes only unreviewed proposals", () => {
    const accepted = repository.persistThesisEvaluation(
      buildEvaluation(repository, {
        id: "manual-requeue-accepted",
        proposedConfidenceScore: 86,
      }),
    );
    repository.reviewThesisEvaluation(accepted.id, {
      decision: "accepted",
    });
    const deferredInput = buildEvaluation(repository, {
      id: "manual-requeue-deferred",
      proposedConfidenceScore: 87,
    });
    const deferred = repository.persistThesisEvaluation(deferredInput);
    repository.reviewThesisEvaluation(deferred.id, {
      decision: "deferred",
      note: "Wait for more routing context.",
    });

    const queued = repository.queueThesisEvaluationUpdate(
      "nvda-fy26-q4",
    );

    expect(queued).toMatchObject({
      updateId: "nvda-fy26-q4",
      alreadyQueued: false,
      invalidatedEvaluationIds: [deferred.id],
    });
    expect(repository.getThesisEvaluation(accepted.id)?.reviewStatus).toBe(
      "accepted",
    );
    expect(repository.getThesisEvaluation(deferred.id)).toMatchObject({
      reviewStatus: "rejected",
      reviewNote: expect.stringContaining(
        "Superseded by signal re-evaluation",
      ),
    });
    expect(
      repository.listRequeuedThesisEvaluationUpdates().map(
        (update) => update.id,
      ),
    ).toEqual(["nvda-fy26-q4"]);

    expect(
      repository.queueThesisEvaluationUpdate("nvda-fy26-q4"),
    ).toEqual({
      updateId: "nvda-fy26-q4",
      requestedAt: queued.requestedAt,
      alreadyQueued: true,
      invalidatedEvaluationIds: [],
    });

    const retried = repository.persistThesisEvaluation(deferredInput);
    expect(retried.id).toMatch(/^manual-requeue-deferred-retry-/);
    expect(retried.reviewStatus).toBe("pending");
  });

  it("creates a fresh proposal when a requeued signal repeats an accepted unchanged evaluation", () => {
    const thesis = repository.getThesis("company-nvda");
    if (!thesis) {
      throw new Error("Seed thesis missing");
    }
    const unchangedInput = buildEvaluation(repository, {
      id: "manual-requeue-accepted-unchanged",
      outcome: "unchanged",
      proposedConfidenceScore: thesis.currentVersion.confidenceScore,
    });
    const accepted = repository.persistThesisEvaluation(unchangedInput);
    repository.reviewThesisEvaluation(accepted.id, {
      decision: "accepted",
    });
    repository.queueThesisEvaluationUpdate("nvda-fy26-q4");

    const retried = repository.persistThesisEvaluation(unchangedInput);

    expect(retried.id).toMatch(
      /^manual-requeue-accepted-unchanged-retry-/,
    );
    expect(retried.reviewStatus).toBe("pending");
    expect(
      repository.getThesisEvaluation(accepted.id)?.reviewStatus,
    ).toBe("accepted");
  });

  it("rejects stale evaluations after another proposal advances the thesis", () => {
    const first = repository.persistThesisEvaluation(
      buildEvaluation(repository, {
        id: "evaluation-nvda-first",
        outcome: "reinforced",
        proposedConfidenceScore: 87,
      }),
    );
    const stale = repository.persistThesisEvaluation(
      buildEvaluation(repository, {
        id: "evaluation-nvda-stale",
        outcome: "reinforced",
        proposedConfidenceScore: 88,
      }),
    );

    repository.reviewThesisEvaluation(first.id, { decision: "accepted" });
    expect(() =>
      repository.reviewThesisEvaluation(stale.id, {
        decision: "accepted",
      }),
    ).toThrow("This evaluation is stale because the thesis has changed.");
  });

  it("links daily briefs to exact thesis evaluations", () => {
    const evaluation = repository.persistThesisEvaluation(
      buildEvaluation(repository, {
        id: "evaluation-for-brief",
        outcome: "reinforced",
        proposedConfidenceScore: 87,
      }),
    );
    const brief: DailyBrief = {
      id: "belief-centered-brief",
      date: "2026-06-30",
      title: "What changed in the mental model",
      summary: "One belief gained modest confidence.",
      signal: "NVIDIA demand evidence reinforced the platform thesis.",
      secondarySignals: [],
      updateIds: ["nvda-fy26-q4"],
      citationClaimIds: ["claim-nvda-dc"],
      thesisEvaluationIds: [evaluation.id],
      generatedAt: "2026-06-30T12:00:00.000Z",
      model: "test-model",
    };

    expect(repository.persistDailyBrief(brief)).toEqual(brief);
    expect(repository.getBrief(brief.id)?.thesisEvaluationIds).toEqual([
      evaluation.id,
    ]);
  });

  it("advances the processed-signal cursor when an evaluation run produces no proposals", () => {
    expect(repository.getLatestThesisEvaluationRunCursor()).toBeNull();

    const emptyRun = repository.recordThesisEvaluationRun({
      id: "evaluation-run-empty",
      signalIngestionCursor: "2026-06-29T12:00:00.000Z",
      signalCount: 3,
      evaluationCount: 0,
      model: "test-evaluation-model",
      completedAt: "2026-06-30T12:00:00.000Z",
    });

    expect(emptyRun).toEqual({
      id: "evaluation-run-empty",
      signalIngestionCursor: "2026-06-29T12:00:00.000Z",
      signalCount: 3,
      evaluationCount: 0,
      model: "test-evaluation-model",
      completedAt: "2026-06-30T12:00:00.000Z",
    });
    expect(repository.getLatestThesisEvaluationRunCursor()).toBe(
      "2026-06-29T12:00:00.000Z",
    );

    repository.recordThesisEvaluationRun({
      id: "evaluation-run-later",
      signalIngestionCursor: "2026-06-30T08:00:00.000Z",
      signalCount: 1,
      evaluationCount: 1,
      completedAt: "2026-06-30T12:05:00.000Z",
    });
    expect(repository.getLatestThesisEvaluationRunCursor()).toBe(
      "2026-06-30T08:00:00.000Z",
    );
    expect(() =>
      repository.recordThesisEvaluationRun({
        signalIngestionCursor: "2026-06-28T08:00:00.000Z",
        signalCount: 1,
        evaluationCount: 0,
      }),
    ).toThrow("cannot move the signal cursor backwards");
  });

  it("lists evaluations reviewed after the requested timestamp", () => {
    const evaluation = repository.persistThesisEvaluation(
      buildEvaluation(repository, {
        id: "evaluation-reviewed-later",
        outcome: "reinforced",
        proposedConfidenceScore: 87,
      }),
    );
    repository.database
      .prepare(`
        UPDATE thesis_evaluations
        SET created_at = '2026-01-01T00:00:00.000Z'
        WHERE id = ?
      `)
      .run(evaluation.id);

    expect(
      repository.listThesisEvaluationsSince(
        "2026-06-01T00:00:00.000Z",
      ),
    ).toEqual([]);

    repository.reviewThesisEvaluation(evaluation.id, {
      decision: "rejected",
      note: "Not enough independent evidence.",
    });
    expect(
      repository
        .listThesisEvaluationsSince("2026-06-01T00:00:00.000Z")
        .map((item) => item.id),
    ).toEqual([evaluation.id]);
  });

  it("starts with a clean personal workspace when demo data is disabled", () => {
    const cleanRepository = createRelayRepository(":memory:", {
      demoData: false,
    });
    try {
      const dashboard = cleanRepository.getDashboard();
      expect(dashboard.companies).toHaveLength(13);
      expect(dashboard.layers).toHaveLength(10);
      expect(dashboard.updates).toEqual([]);
      expect(dashboard.brief).toBeNull();
      expect(dashboard.demoData).toBe(false);
    } finally {
      cleanRepository.close();
    }
  });

  it("preserves archived catalog rows and user-added sources across seeding", () => {
    const directory = mkdtempSync(join(tmpdir(), "relay-catalog-management-"));
    const databasePath = join(directory, "relay.sqlite");
    let fileRepository: RelayRepository | undefined;
    try {
      fileRepository = createRelayRepository(databasePath, {
        demoData: false,
      });
      expect(fileRepository.archiveCompany("NVDA")).toBe(true);
      expect(fileRepository.archiveSource("the-next-platform")).toBe(true);
      const customSource = fileRepository.addSource({
        name: "Personal inference feed",
        type: "rss",
        url: "https://example.com/inference.xml",
        layerIds: ["serving"],
        companyTickers: ["NVDA"],
      });
      fileRepository.close();
      fileRepository = undefined;

      fileRepository = createRelayRepository(databasePath, {
        demoData: false,
      });
      expect(fileRepository.getCompany("NVDA")).toBeNull();
      expect(fileRepository.getSource("the-next-platform")).toBeNull();
      expect(fileRepository.getSource(customSource.id)).toMatchObject({
        id: customSource.id,
        name: "Personal inference feed",
        userAdded: true,
        layerIds: ["serving"],
        companyTickers: ["NVDA"],
      });
    } finally {
      fileRepository?.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("registers trusted website profiles with explicit thesis coverage", () => {
    const profile = repository.addSourceProfile({
      name: "Memory specialist",
      domain: "memory.example.com",
      publicUrl: "https://memory.example.com/research/",
      role: "primary",
      authorityTier: "specialist",
      layerIds: ["memory"],
      companyTickers: ["MU"],
      thesisIds: ["macro-memory-bottleneck"],
    });

    expect(profile).toMatchObject({
      type: "manual",
      url: "https://memory.example.com/research",
      domain: "memory.example.com",
      role: "primary",
      authorityTier: "specialist",
      enabled: false,
      userAdded: true,
      layerIds: ["memory"],
      companyTickers: ["MU"],
      thesisIds: ["macro-memory-bottleneck"],
    });
    expect(
      repository.findSourceProfileForUrl(
        "https://sub.memory.example.com/report/1",
      )?.id,
    ).toBe(profile.id);
    expect(() =>
      repository.addSourceProfile({
        name: "Mismatched profile",
        domain: "memory.example.com",
        publicUrl: "https://other.example.com/",
        role: "primary",
        authorityTier: "specialist",
      }),
    ).toThrow("public URL must use the registered source domain");
  });

  it("removes only known demo records when reopening in personal mode", () => {
    const directory = mkdtempSync(join(tmpdir(), "relay-personal-"));
    const databasePath = join(directory, "relay.sqlite");
    const baseUpdate = repository.getUpdate("nvda-dynamo-1");
    if (!baseUpdate) {
      throw new Error("Seed update missing");
    }
    const personalUpdate: IntelligenceUpdate = {
      ...baseUpdate,
      id: "personal-research-update",
      title: "Personal research update",
      claims: baseUpdate.claims.map((claim) => ({
        ...claim,
        id: `personal-${claim.id}`,
      })),
      thesisImpacts: baseUpdate.thesisImpacts.map((impact) => ({
        ...impact,
        id: `personal-${impact.id}`,
      })),
      model: null,
    };
    let fileRepository: RelayRepository | undefined;
    try {
      fileRepository = createRelayRepository(databasePath, { demoData: true });
      fileRepository.persistAnalyzedUpdate(personalUpdate);
      const reviews = createImpactReviewRepository(fileRepository.database);
      reviews.reviewImpact({
        impactId: "impact-nvda-dynamo",
        decision: "accepted",
        reasonTags: ["useful-analysis"],
      });
      reviews.reviewImpact({
        impactId: "personal-impact-nvda-dynamo",
        decision: "accepted",
        reasonTags: ["useful-analysis"],
      });
      fileRepository.persistDailyBrief({
        id: "generated-from-demo-brief",
        date: "2026-06-27",
        title: "Generated from demo evidence",
        summary: "This synthesis must not survive removal of its demo inputs.",
        signal: "A demo update supplied the lead signal.",
        secondarySignals: [],
        updateIds: ["nvda-dynamo-1", personalUpdate.id],
        citationClaimIds: [
          "claim-nvda-dynamo",
          personalUpdate.claims[0]?.id ?? "",
        ],
        generatedAt: "2026-06-27T12:00:00.000Z",
        model: "test-synthesis-model",
      });
      fileRepository.close();
      fileRepository = undefined;

      fileRepository = createRelayRepository(databasePath, { demoData: false });
      const dashboard = fileRepository.getDashboard();
      expect(dashboard.updates.map((update) => update.id)).toEqual([
        "personal-research-update",
      ]);
      expect(dashboard.demoData).toBe(false);
      expect(dashboard.brief).toBeNull();
      expect(
        fileRepository.database
          .prepare(
            "SELECT impact_id FROM impact_reviews ORDER BY impact_id",
          )
          .all(),
      ).toEqual([{ impact_id: "personal-impact-nvda-dynamo" }]);
    } finally {
      fileRepository?.close();
      rmSync(directory, { force: true, recursive: true });
    }
  });

  it("preserves a personal brief when removing unrelated demo records", () => {
    const directory = mkdtempSync(join(tmpdir(), "relay-personal-"));
    const databasePath = join(directory, "relay.sqlite");
    const personalBrief: DailyBrief = {
      id: "personal-only-brief",
      date: "2026-06-28",
      title: "Personal brief",
      summary: "This brief does not rely on demo updates.",
      signal: "No fixture evidence is involved.",
      secondarySignals: [],
      updateIds: [],
      citationClaimIds: [],
      generatedAt: "2026-06-28T12:00:00.000Z",
      model: "test-synthesis-model",
    };
    let fileRepository: RelayRepository | undefined;
    try {
      fileRepository = createRelayRepository(databasePath, { demoData: true });
      fileRepository.persistDailyBrief(personalBrief);
      fileRepository.close();
      fileRepository = undefined;

      fileRepository = createRelayRepository(databasePath, { demoData: false });
      expect(fileRepository.getDashboard().brief).toEqual(personalBrief);
      expect(fileRepository.getDashboard().updates).toEqual([]);
    } finally {
      fileRepository?.close();
      rmSync(directory, { force: true, recursive: true });
    }
  });

  it("persists analysis and evidence atomically", () => {
    const update: IntelligenceUpdate = {
      id: "test-update",
      title: "Test update",
      publisher: "Test publisher",
      sourceUrl: "https://example.com/research",
      publishedAt: "2026-06-27T10:00:00.000Z",
      ingestedAt: "2026-06-27T10:01:00.000Z",
      layerIds: ["optics"],
      companyTickers: ["COHR"],
      materiality: "high",
      materialityReason:
        "New production evidence strengthens the optics capacity thesis.",
      novelty: "new",
      sentiment: "bullish",
      whatHappened: "A qualified optical component entered volume production.",
      whyItMatters: "The result adds supply to a constrained link in the stack.",
      beneficiaries: ["COHR"],
      threatened: [],
      watchNext: ["Volume shipments"],
      claims: [
        {
          id: "test-claim",
          quote: "Volume production started this quarter.",
          sourceId: "manual-imports",
          locator: "Page 2",
        },
      ],
      thesisImpacts: [
        {
          id: "test-impact",
          companyTicker: "COHR",
          direction: "bullish",
          summary: "The ramp supports the optics capacity thesis.",
          confidence: "medium",
          horizon: "6–12 months",
          thesisDelta:
            "Moves the thesis from expected qualification to observed volume production.",
          decision: "proposed",
        },
      ],
      macroThesisImpacts: [],
      model: "test-model",
    };

    expect(repository.persistAnalyzedUpdate(update)).toEqual({
      ...update,
      thesisImpacts: update.thesisImpacts.map((impact) => ({
        ...impact,
        review: null,
      })),
    });
    expect(repository.getUpdate(update.id)?.claims[0]?.quote).toBe(
      "Volume production started this quarter.",
    );

    repository.persistAnalyzedUpdate({
      ...update,
      whyItMatters: "The refreshed analysis keeps the same evidence.",
    });
    expect(repository.getUpdate(update.id)?.whyItMatters).toBe(
      "The refreshed analysis keeps the same evidence.",
    );

    repository.persistAnalyzedUpdate({
      ...update,
      macroThesisImpacts: [
        {
          id: "macro-impact-old",
          thesisId: "macro-optics-supply",
          relevance: "secondary",
          stance: "supports",
          rationale: "Volume production bears on optical supply.",
          claimIds: ["test-claim"],
        },
      ],
    });
    repository.persistAnalyzedUpdate({
      ...update,
      macroThesisImpacts: [
        {
          id: "macro-impact-new",
          thesisId: "macro-optics-supply",
          relevance: "context",
          stance: "context",
          rationale:
            "The production datum is adjacent context, not supply-wide evidence.",
          claimIds: ["test-claim"],
        },
      ],
    });
    expect(repository.getUpdate(update.id)?.macroThesisImpacts).toEqual([
      expect.objectContaining({
        id: "macro-impact-new",
        thesisId: "macro-optics-supply",
        relevance: "context",
        stance: "context",
      }),
    ]);
  });

  it("deletes a signal and any generated brief or unaccepted evaluation that cites it", () => {
    const document = repository.persistSourceDocument({
      title: "NVIDIA quarterly results",
      publisher: "NVIDIA",
      sourceUrl: "https://investor.nvidia.com/results",
      content: "NVIDIA reported record data-center revenue.",
      researchSourceId: "nvidia-ir",
    });
    repository.markSourceDocumentAnalyzed(
      document.id,
      "nvda-fy26-q4",
    );
    const evaluation = repository.persistThesisEvaluation(
      buildEvaluation(repository, {
        id: "evaluation-deleted-with-signal",
        outcome: "reinforced",
        proposedConfidenceScore: 87,
      }),
    );
    const brief: DailyBrief = {
      id: "brief-deleted-with-signal",
      date: "2026-07-01",
      title: "Signal-backed brief",
      summary: "This prose depends on the signal being deleted.",
      signal: "The signal reinforced a thesis.",
      secondarySignals: [],
      updateIds: ["nvda-fy26-q4"],
      citationClaimIds: ["claim-nvda-dc"],
      thesisEvaluationIds: [evaluation.id],
      generatedAt: "2026-07-01T12:00:00.000Z",
      model: "test-model",
    };
    repository.persistDailyBrief(brief);

    expect(repository.deleteUpdate("nvda-fy26-q4")).toBe(true);
    expect(repository.getUpdate("nvda-fy26-q4")).toBeNull();
    expect(repository.getThesisEvaluation(evaluation.id)).toBeNull();
    expect(repository.getBrief(brief.id)).toBeNull();
    expect(repository.deleteUpdate("nvda-fy26-q4")).toBe(false);
    expect(
      repository.persistSourceDocument({
        title: "NVIDIA quarterly results",
        publisher: "NVIDIA",
        sourceUrl: "https://investor.nvidia.com/results",
        content: "NVIDIA reported record data-center revenue.",
        researchSourceId: "nvidia-ir",
      }),
    ).toMatchObject({
      id: document.id,
      duplicate: true,
      status: "suppressed",
      updateId: null,
    });
  });

  it("refuses to delete a signal that supports an accepted thesis change", () => {
    const evaluation = repository.persistThesisEvaluation(
      buildEvaluation(repository, {
        id: "evaluation-protects-signal",
        outcome: "reinforced",
        proposedConfidenceScore: 87,
      }),
    );
    repository.reviewThesisEvaluation(evaluation.id, {
      decision: "accepted",
    });

    expect(() => repository.deleteUpdate("nvda-fy26-q4")).toThrow(
      "supports an accepted thesis change",
    );
    expect(repository.getUpdate("nvda-fy26-q4")).not.toBeNull();
  });

  it("enforces materiality and novelty invariants at persistence", () => {
    const seed = repository.getUpdate("vrt-fy25-q4");
    if (!seed) {
      throw new Error("Seed update missing");
    }
    const base: IntelligenceUpdate = {
      ...seed,
      id: "invariant-test-update",
      claims: seed.claims.map((claim) => ({
        ...claim,
        id: `invariant-${claim.id}`,
      })),
      thesisImpacts: seed.thesisImpacts.map((impact) => ({
        ...impact,
        id: `invariant-${impact.id}`,
      })),
    };

    expect(() =>
      repository.persistAnalyzedUpdate({
        ...base,
        novelty: "repetition",
      }),
    ).toThrow("Repeated signals must be classified as not material.");
    expect(() =>
      repository.persistAnalyzedUpdate({
        ...base,
        materiality: "not-material",
        sentiment: "bullish",
        thesisImpacts: [],
      }),
    ).toThrow("Not-material signals must use not-material sentiment.");
    expect(() =>
      repository.persistAnalyzedUpdate({
        ...base,
        sentiment: "not-material",
      }),
    ).toThrow("Material signals cannot use not-material sentiment.");
    expect(() =>
      repository.persistAnalyzedUpdate({
        ...base,
        thesisImpacts: base.thesisImpacts.map((impact) => ({
          ...impact,
          direction: "not-material",
        })),
      }),
    ).toThrow("Company thesis impacts must contain a concrete thesis delta.");
  });

  it("deduplicates imported source documents without duplicating source counts", () => {
    const input = {
      title: "Research note",
      publisher: "Personal research",
      content:
        "This is a sufficiently long source document used to verify deterministic deduplication.",
    };

    const first = repository.persistSourceDocument(input);
    const second = repository.persistSourceDocument(input);

    expect(first.duplicate).toBe(false);
    expect(second).toMatchObject({
      duplicate: true,
      id: first.id,
      status: "pending",
    });
    expect(
      repository
        .listSources()
        .find((source) => source.id === "manual-imports")?.documentCount,
    ).toBe(1);
  });

  it("deduplicates the same canonical source despite metadata changes", () => {
    const first = repository.persistSourceDocument({
      title: "Research note",
      publisher: "Original publisher",
      sourceUrl: "https://example.com/note?utm_source=email",
      content: "The same underlying evidence.",
    });
    const duplicate = repository.persistSourceDocument({
      title: "Research note — corrected title",
      publisher: "Personal import",
      sourceUrl: "https://example.com/note",
      content: "The same underlying evidence.",
    });

    expect(duplicate).toMatchObject({
      duplicate: true,
      id: first.id,
    });
  });

  it("replaces the brief for a date while preserving valid evidence links", () => {
    const brief: DailyBrief = {
      id: "replacement-brief",
      date: "2026-06-27",
      title: "Replacement brief",
      summary: "A compact replacement daily synthesis.",
      signal: "Power infrastructure remains the most constrained layer.",
      secondarySignals: ["Memory remains tight."],
      updateIds: ["vrt-fy25-q4"],
      citationClaimIds: ["claim-vrt-backlog"],
      generatedAt: "2026-06-27T12:00:00.000Z",
      model: "test-model",
    };

    const persisted = repository.persistDailyBrief(brief);
    expect(persisted).toEqual(brief);
    expect(repository.getDashboard().brief?.id).toBe("replacement-brief");
  });

  it("preserves a generated brief when reopening a seeded database", () => {
    const directory = mkdtempSync(join(tmpdir(), "relay-db-"));
    const databasePath = join(directory, "relay.sqlite");
    const generatedBrief: DailyBrief = {
      id: "generated-brief",
      date: "2026-06-27",
      title: "Generated brief",
      summary: "A persisted synthesis should survive application restarts.",
      signal: "The generated signal remains authoritative for its date.",
      secondarySignals: ["The seed fixture must not replace it."],
      updateIds: ["vrt-fy25-q4"],
      citationClaimIds: ["claim-vrt-backlog"],
      generatedAt: "2026-06-27T12:00:00.000Z",
      model: "test-synthesis-model",
    };
    let fileRepository: RelayRepository | undefined;

    try {
      fileRepository = createRelayRepository(databasePath);
      fileRepository.persistDailyBrief(generatedBrief);
      fileRepository.close();
      fileRepository = undefined;

      fileRepository = createRelayRepository(databasePath);

      expect(fileRepository.getDashboard().brief).toEqual(generatedBrief);
    } finally {
      fileRepository?.close();
      rmSync(directory, { force: true, recursive: true });
    }
  });

  it("creates the local database with owner-only permissions", () => {
    const directory = mkdtempSync(join(tmpdir(), "relay-db-"));
    const databasePath = join(directory, "relay.sqlite");
    const fileRepository = createRelayRepository(databasePath, {
      seed: false,
    });
    try {
      expect(statSync(databasePath).mode & 0o777).toBe(0o600);
    } finally {
      fileRepository.close();
      rmSync(directory, { force: true, recursive: true });
    }
  });

  it("redacts secret-like values from persisted processing errors", () => {
    const document = repository.persistSourceDocument({
      title: "Failed note",
      publisher: "Personal research",
      content: "A source that fails during processing.",
    });
    repository.markSourceDocumentError(
      document.id,
      "Provider rejected OPENAI_API_KEY=secret sk-project-private-token",
    );

    const stored = repository.database
      .prepare("SELECT error_message FROM source_documents WHERE id = ?")
      .get(document.id) as { error_message: string };
    expect(stored.error_message).not.toContain("secret");
    expect(stored.error_message).not.toContain("sk-project");
    expect(stored.error_message).toContain("[REDACTED]");
  });
});

function buildEvaluation(
  repository: RelayRepository,
  overrides: Partial<ThesisEvaluationInput> = {},
): ThesisEvaluationInput {
  const thesis = repository.getThesis(
    overrides.thesisId ?? "company-nvda",
  );
  if (!thesis) {
    throw new Error("Seed thesis missing");
  }
  return {
    thesisId: thesis.id,
    outcome: "reinforced",
    summary: "New demand evidence modestly reinforces the current belief.",
    rationale:
      "The cited result is consistent with durable platform demand but does not justify rewriting the belief.",
    proposedBelief: thesis.currentVersion.belief,
    proposedConfidenceScore: thesis.currentVersion.confidenceScore + 2,
    proposedUnknowns: thesis.currentVersion.unknowns,
    proposedStrengtheningConditions:
      thesis.currentVersion.strengtheningConditions,
    proposedWeakeningConditions: thesis.currentVersion.weakeningConditions,
    signalIds: ["nvda-fy26-q4"],
    evidence: [
      {
        claimId: "claim-nvda-dc",
        stance: "supports",
        rationale: "Reported data-center growth supports durable demand.",
      },
    ],
    reviewRecommendation: "accept",
    reviewRecommendationReason:
      "The cited evidence supports a modest confidence increase.",
    model: "test-evaluation-model",
    ...overrides,
  };
}
