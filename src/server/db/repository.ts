import { createHash, randomUUID } from "node:crypto";
import { chmodSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

import type {
  CompanyCaptureMechanism,
  Company,
  CompanyInput,
  DailyBrief,
  DashboardPayload,
  FailedSourceDocument,
  ImpactReview,
  IntelligenceUpdate,
  PortfolioDecision,
  PortfolioDecisionInput,
  PortfolioItem,
  PortfolioItemInput,
  PortfolioOverlap,
  PortfolioReadModel,
  PortfolioThesisExposure,
  PortfolioThesisExposureInput,
  ResearchSource,
  ResearchSourceInput,
  SourceProfileInput,
  SourceKind,
  StackLayer,
  Thesis,
  ThesisBottleneck,
  ThesisEvaluation,
  ThesisEvaluationInput,
  ThesisEvaluationReviewInput,
  ThesisEvidence,
  ThesisInput,
  ThesisMomentum,
  ThesisRoutedSignal,
  ThesisStatus,
  ThesisStructureInput,
  ThesisReview,
  ThesisType,
  ThesisVersion,
} from "../../shared/contracts.js";

import {
  clearDemoData,
  demoBriefId,
  demoUpdateIds,
  seedDatabase,
} from "../seeds/index.js";
import {
  seedPortfolioItems,
  seedPortfolioReviews,
  seedPortfolioThesisExposures,
  seedThesisStructures,
  type PortfolioReviewSeed,
} from "../seeds/catalog.js";
import { migrateDatabase } from "./schema.js";
import { canonicalizeUrl } from "../ingestion/normalize.js";
import {
  clusterStories,
  type StoryCandidate,
} from "../intelligence/story-clustering.js";

const IMPACT_REVIEW_INVALIDATION_PREFIX = "Invalidated after impact ";
const SIGNAL_REEVALUATION_INVALIDATION_PREFIX =
  "Superseded by signal re-evaluation ";

interface CatalogSeed {
  brief?: DailyBrief;
  companies: Company[];
  layers: StackLayer[];
  sources: ResearchSource[];
  theses?: ThesisInput[];
  updates: IntelligenceUpdate[];
}

interface PortfolioCatalogSeed {
  items: PortfolioItemInput[];
  exposures: PortfolioThesisExposureInput[];
  thesisStructures: ThesisStructureInput[];
}

export interface ThesisListFilters {
  kind?: ThesisType | undefined;
  status?: ThesisStatus | "all" | undefined;
}

interface ThesisReadOptions {
  includeRoutedSignals?: boolean | undefined;
}

export interface ThesisEvaluationListFilters {
  thesisId?: string | undefined;
  reviewStatus?: ThesisEvaluation["reviewStatus"] | undefined;
}

export interface ThesisReviewListFilters extends ThesisEvaluationListFilters {
  limit?: number | undefined;
}

export interface ThesisEvaluationRun {
  id: string;
  signalIngestionCursor: string;
  signalCount: number;
  evaluationCount: number;
  model: string | null;
  completedAt: string;
}

export interface ThesisEvaluationRunInput {
  id?: string | undefined;
  signalIngestionCursor: string;
  signalCount: number;
  evaluationCount: number;
  model?: string | null | undefined;
  completedAt?: string | undefined;
}

export interface ThesisEvaluationRequeueRecord {
  updateId: string;
  requestedAt: string;
  alreadyQueued: boolean;
  invalidatedEvaluationIds: string[];
}

export interface SourceDocumentInput {
  title: string;
  publisher: string;
  sourceUrl?: string;
  publishedAt?: string;
  content: string;
  researchSourceId?: string;
  sourceKind?: SourceKind;
  filename?: string;
}

export interface SourceDocumentRecord {
  id: string;
  status: "pending" | "analyzed" | "error" | "suppressed";
  updateId: string | null;
  ingestedAt: string;
  duplicate: boolean;
}

export interface SourceDocumentRecoveryRecord {
  id: string;
  title: string;
  publisher: string;
  sourceUrl: string | null;
  publishedAt: string;
  content: string;
  sourceKind: SourceKind;
  researchSourceId: string | null;
  status: SourceDocumentRecord["status"];
  updateId: string | null;
  ingestedAt: string;
  errorMessage: string | null;
  attemptCount: number;
  lastAttemptedAt: string | null;
}

export interface SourceDocumentRecoveryUpdate {
  title?: string;
  publisher?: string;
  sourceUrl?: string;
  publishedAt?: string;
  content?: string;
  sourceKind?: SourceKind;
}

type SqlValue = null | number | string | undefined;
type SqlRow = Record<string, SqlValue>;

function parseJson<T>(value: SqlValue, fallback: T): T {
  if (typeof value !== "string") {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function text(row: SqlRow, key: string): string {
  const value = row[key];
  if (typeof value !== "string") {
    throw new TypeError(`Expected ${key} to be text`);
  }
  return value;
}

function nullableText(row: SqlRow, key: string): string | null {
  const value = row[key];
  return typeof value === "string" ? value : null;
}

function numeric(row: SqlRow, key: string): number {
  const value = row[key];
  if (typeof value !== "number") {
    throw new TypeError(`Expected ${key} to be numeric`);
  }
  return value;
}

function rows(value: unknown): SqlRow[] {
  return value as SqlRow[];
}

function row(value: unknown): SqlRow | undefined {
  return value as SqlRow | undefined;
}

export class RelayRepository {
  readonly database: DatabaseSync;

  constructor(database: DatabaseSync) {
    this.database = database;
    this.database.exec("PRAGMA foreign_keys = ON");
    migrateDatabase(this.database);
  }

  close(): void {
    this.database.close();
  }

  seedCatalog(catalog: CatalogSeed): void {
    const insertLayer = this.database.prepare(`
      INSERT OR IGNORE INTO stack_layers (id, name, description, sort_order)
      VALUES (?, ?, ?, ?)
    `);
    const insertDependency = this.database.prepare(`
      INSERT OR IGNORE INTO layer_dependencies (layer_id, depends_on_layer_id)
      VALUES (?, ?)
    `);
    const insertCompany = this.database.prepare(`
      INSERT OR IGNORE INTO companies (
        ticker, name, description, thesis, why_it_matters, proves_right_json,
        breaks_thesis_json, watch_metrics_json, confidence, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertCompanyLayer = this.database.prepare(`
      INSERT OR IGNORE INTO company_layers (company_ticker, layer_id) VALUES (?, ?)
    `);
    const insertSource = this.database.prepare(`
      INSERT INTO research_sources (
        id, name, type, url, enabled, status, last_synced_at, document_count,
        archived, user_added, layer_ids_json, company_tickers_json, domain,
        role, authority_tier, thesis_ids_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        type = excluded.type,
        url = excluded.url,
        layer_ids_json = excluded.layer_ids_json,
        company_tickers_json = excluded.company_tickers_json,
        domain = excluded.domain,
        role = excluded.role,
        authority_tier = excluded.authority_tier,
        thesis_ids_json = excluded.thesis_ids_json
    `);

    this.withTransaction(() => {
      catalog.layers.forEach((layer, index) => {
        insertLayer.run(layer.id, layer.name, layer.description, index);
      });
      catalog.layers.forEach((layer) => {
        layer.dependsOn.forEach((dependency) => {
          insertDependency.run(layer.id, dependency);
        });
      });
      catalog.companies.forEach((company) => {
        insertCompany.run(
          company.ticker,
          company.name,
          company.description,
          company.thesis,
          company.whyItMatters,
          JSON.stringify(company.provesRight),
          JSON.stringify(company.breaksThesis),
          JSON.stringify(company.watchMetrics),
          company.confidence,
          company.updatedAt,
        );
        company.layerIds.forEach((layerId) => {
          insertCompanyLayer.run(company.ticker, layerId);
        });
      });
      catalog.sources.forEach((source) => {
        insertSource.run(
          source.id,
          source.name,
          source.type,
          source.url,
          source.enabled ? 1 : 0,
          source.status,
          source.lastSyncedAt,
          source.documentCount,
          JSON.stringify(source.layerIds),
          JSON.stringify(source.companyTickers),
          source.domain,
          source.role,
          source.authorityTier,
          JSON.stringify(source.thesisIds),
        );
      });
      this.database
        .prepare(`
          UPDATE research_sources
          SET archived = 1
          WHERE user_added = 0
            AND id NOT IN (${catalog.sources.map(() => "?").join(", ")})
        `)
        .run(...catalog.sources.map((source) => source.id));
    });

    catalog.theses?.forEach((thesis) => {
      const id = thesis.id;
      if (!id || !this.getThesis(id)) {
        this.createThesis(thesis);
      }
    });
    catalog.updates.forEach((update) => {
      if (!this.getUpdate(update.id)) {
        this.persistAnalyzedUpdate(update);
      }
    });
    if (catalog.brief) {
      const existingBriefForSeedDate = row(
        this.database
          .prepare("SELECT id FROM daily_briefs WHERE date = ? LIMIT 1")
          .get(catalog.brief.date),
      );
      if (!existingBriefForSeedDate) {
        this.persistDailyBrief(catalog.brief);
      }
    }
  }

  seedPortfolioCatalog(catalog: PortfolioCatalogSeed): void {
    const holdingAllocationBps = catalog.items
      .filter((item) => item.status === "holding")
      .reduce((total, item) => total + (item.allocationBps ?? 0), 0);
    if (holdingAllocationBps > 10_000) {
      throw new RangeError("Portfolio holding allocations cannot exceed 100%.");
    }

    const structureVersions = catalog.thesisStructures.map((structure) => {
      const thesis = this.getThesis(structure.thesisId);
      if (!thesis) {
        throw new RangeError(`Unknown thesis structure: ${structure.thesisId}`);
      }
      const associatedCompanies = new Set(thesis.companyTickers);
      const invalidCapture = structure.captureMechanisms.find(
        (capture) => !associatedCompanies.has(capture.companyTicker.toUpperCase()),
      );
      if (invalidCapture) {
        throw new TypeError(
          `Company ${invalidCapture.companyTicker} is not associated with thesis ${thesis.id}.`,
        );
      }
      return { structure, versionId: thesis.currentVersion.id };
    });
    const createdAt = new Date().toISOString();
    const insertItem = this.database.prepare(`
      INSERT OR IGNORE INTO portfolio_items (
        id, symbol, name, asset_type, company_ticker, status,
        allocation_bps, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertExposure = this.database.prepare(`
      INSERT OR IGNORE INTO portfolio_thesis_exposures (
        portfolio_item_id, thesis_id, exposure_type, capture_mechanism,
        sort_order
      ) VALUES (?, ?, ?, ?, ?)
    `);
    const insertBottleneck = this.database.prepare(`
      INSERT OR IGNORE INTO thesis_version_bottlenecks (
        thesis_version_id, bottleneck_key, title, description, sort_order
      ) VALUES (?, ?, ?, ?, ?)
    `);
    const insertCapture = this.database.prepare(`
      INSERT OR IGNORE INTO thesis_version_company_captures (
        thesis_version_id, capture_key, bottleneck_key, company_ticker,
        role, mechanism, sort_order
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    this.withTransaction(() => {
      catalog.items.forEach((item) => {
        insertItem.run(
          item.id.trim(),
          item.symbol?.trim() || null,
          item.name.trim(),
          item.assetType,
          item.companyTicker?.trim().toUpperCase() || null,
          item.status,
          item.allocationBps ?? null,
          createdAt,
          createdAt,
        );
      });
      catalog.exposures.forEach((exposure, index) => {
        const thesis = this.getThesis(exposure.thesisId);
        if (!thesis || thesis.kind !== "macro" || thesis.status !== "active") {
          throw new TypeError(
            `Portfolio exposure requires an active macro thesis: ${exposure.thesisId}.`,
          );
        }
        insertExposure.run(
          exposure.portfolioItemId,
          exposure.thesisId,
          exposure.exposureType,
          exposure.captureMechanism.trim(),
          exposure.sortOrder ?? index,
        );
      });
      structureVersions.forEach(({ structure, versionId }) => {
        structure.bottlenecks.forEach((bottleneck) => {
          insertBottleneck.run(
            versionId,
            bottleneck.key,
            bottleneck.title.trim(),
            bottleneck.description.trim(),
            bottleneck.sortOrder,
          );
        });
        structure.captureMechanisms.forEach((capture) => {
          insertCapture.run(
            versionId,
            capture.key,
            capture.bottleneckKey,
            capture.companyTicker.toUpperCase(),
            capture.role,
            capture.mechanism.trim(),
            capture.sortOrder,
          );
        });
      });
    });
  }

  seedPortfolioReviewHistory(seeds: readonly PortfolioReviewSeed[]): void {
    seeds.forEach((seed) => {
      if (this.getThesisEvaluation(seed.id)) {
        return;
      }
      const thesis = this.getThesis(seed.thesisId);
      const signal = this.getUpdate(seed.signalId);
      if (!thesis || thesis.status !== "active") {
        throw new RangeError(`Unknown active thesis: ${seed.thesisId}`);
      }
      if (
        !signal ||
        !signal.claims.some((claim) => claim.id === seed.claimId)
      ) {
        throw new RangeError(
          `Unknown seed evidence ${seed.claimId} for signal ${seed.signalId}.`,
        );
      }
      const evaluation = this.persistThesisEvaluation({
        id: seed.id,
        thesisId: thesis.id,
        outcome: seed.outcome,
        summary: seed.summary,
        rationale: seed.rationale,
        proposedBelief: thesis.currentVersion.belief,
        proposedConfidenceScore:
          thesis.currentVersion.confidenceScore + seed.confidenceDelta,
        proposedUnknowns: thesis.currentVersion.unknowns,
        proposedStrengtheningConditions:
          thesis.currentVersion.strengtheningConditions,
        proposedWeakeningConditions:
          thesis.currentVersion.weakeningConditions,
        signalIds: [seed.signalId],
        evidence: [
          {
            claimId: seed.claimId,
            stance: "supports",
            rationale: seed.rationale,
          },
        ],
        reviewRecommendation: "accept",
        reviewRecommendationReason:
          "Seed evidence directly supports the modeled bottleneck.",
        model: null,
      });
      if (seed.reviewStatus === "accepted") {
        this.reviewThesisEvaluation(evaluation.id, {
          decision: "accepted",
          note: "Illustrative starter review based on cited seed evidence.",
          ...(seed.nextReviewOn
            ? { nextReviewOn: seed.nextReviewOn }
            : {}),
          portfolioDecisions: seed.portfolioDecisions,
        });
      }
    });
  }

  clearPortfolioReviewHistory(evaluationIds: readonly string[]): void {
    const uniqueEvaluationIds = uniqueStrings(evaluationIds);
    const findEvaluation = this.database.prepare(`
      SELECT thesis_id, previous_version_id, accepted_version_id
      FROM thesis_evaluations
      WHERE id = ?
    `);
    const restoreCurrentVersion = this.database.prepare(`
      UPDATE theses
      SET current_version_id = ?,
          updated_at = (
            SELECT created_at FROM thesis_versions WHERE id = ?
          )
      WHERE id = ? AND current_version_id = ?
    `);
    const deleteLinkedEvidence = this.database.prepare(`
      DELETE FROM thesis_evidence
      WHERE linked_by_evaluation_id = ?
    `);
    const deleteEvaluation = this.database.prepare(
      "DELETE FROM thesis_evaluations WHERE id = ?",
    );
    const deleteUnreferencedVersion = this.database.prepare(`
      DELETE FROM thesis_versions
      WHERE id = ?
        AND NOT EXISTS (
          SELECT 1 FROM theses WHERE current_version_id = ?
        )
        AND NOT EXISTS (
          SELECT 1
          FROM thesis_evaluations
          WHERE previous_version_id = ? OR accepted_version_id = ?
        )
    `);

    this.withTransaction(() => {
      uniqueEvaluationIds.forEach((evaluationId) => {
        const evaluationRow = row(findEvaluation.get(evaluationId));
        if (!evaluationRow) {
          return;
        }
        const thesisId = text(evaluationRow, "thesis_id");
        const previousVersionId = text(
          evaluationRow,
          "previous_version_id",
        );
        const acceptedVersionId = nullableText(
          evaluationRow,
          "accepted_version_id",
        );
        if (acceptedVersionId) {
          restoreCurrentVersion.run(
            previousVersionId,
            previousVersionId,
            thesisId,
            acceptedVersionId,
          );
        }
        deleteLinkedEvidence.run(evaluationId);
        deleteEvaluation.run(evaluationId);
        if (acceptedVersionId && acceptedVersionId !== previousVersionId) {
          deleteUnreferencedVersion.run(
            acceptedVersionId,
            acceptedVersionId,
            acceptedVersionId,
            acceptedVersionId,
          );
        }
      });
    });
  }

  getDashboard(): Omit<DashboardPayload, "sourceCoverage"> {
    const briefRow = row(
      this.database
        .prepare("SELECT id FROM daily_briefs ORDER BY date DESC, generated_at DESC LIMIT 1")
        .get(),
    );
    const brief = briefRow ? this.getBrief(text(briefRow, "id")) : null;
    const updates = this.listUpdates();

    return {
      brief,
      updates,
      layers: this.listLayers(),
      companies: this.listCompanies(),
      sources: this.listSources(),
      demoData:
        brief?.id === demoBriefId ||
        updates.some((update) => demoUpdateIds.includes(update.id)),
    };
  }

  getPortfolio(): PortfolioReadModel {
    const items = this.listPortfolioItems();
    const holdings = items.filter((item) => item.status === "holding");
    return {
      allocationBasis: "illustrative-seed",
      allocationNote:
        "Starter allocations are illustrative examples (35% SpaceX, 30% VOO, 20% SMH, 15% TSM), not verified portfolio balances.",
      items,
      holdings,
      watchlist: items.filter((item) => item.status === "watchlist"),
      overlaps: this.buildPortfolioOverlaps(holdings),
    };
  }

  listPortfolioItems(): PortfolioItem[] {
    return rows(
      this.database
        .prepare(`
          SELECT *
          FROM portfolio_items
          WHERE status <> 'archived'
          ORDER BY
            CASE status WHEN 'holding' THEN 0 ELSE 1 END,
            allocation_bps DESC,
            name,
            id
        `)
        .all(),
    ).map((itemRow) => this.mapPortfolioItem(itemRow));
  }

  listPortfolioExposuresForThesis(
    thesisId: string,
  ): PortfolioThesisExposure[] {
    return rows(
      this.database
        .prepare(`
          SELECT exposure.*, thesis.title AS thesis_title
          FROM portfolio_thesis_exposures AS exposure
          INNER JOIN theses AS thesis ON thesis.id = exposure.thesis_id
          WHERE exposure.thesis_id = ?
          ORDER BY exposure.sort_order, exposure.portfolio_item_id
        `)
        .all(thesisId),
    ).map((exposureRow) => this.mapPortfolioExposure(exposureRow));
  }

  listThesisReviews(
    filters: ThesisReviewListFilters = {},
  ): ThesisReview[] {
    const portfolioItems = new Map(
      this.listPortfolioItems().map((item) => [item.id, item]),
    );
    const evaluations = this.listThesisEvaluations(filters).slice(
      0,
      filters.limit ?? 100,
    );
    return evaluations.flatMap((evaluation) => {
      const thesis = this.getThesis(evaluation.thesisId);
      return thesis
        ? [{
            evaluation,
            thesisTitle: thesis.title,
            thesisKind: thesis.kind,
            momentum: evaluationMomentum(evaluation),
            whatChanged: evaluation.summary,
            affectedPortfolioItems: thesis.portfolioExposures.flatMap(
              (exposure) => {
                const item = portfolioItems.get(exposure.portfolioItemId);
                return item
                  ? [{
                      id: item.id,
                      symbol: item.symbol,
                      name: item.name,
                      status: item.status,
                      allocationPercent: item.allocationPercent,
                    }]
                  : [];
              },
            ),
          }]
        : [];
    });
  }

  clearDemoIntelligence(updateIds: string[], briefId: string): void {
    this.withTransaction(() => {
      this.database.prepare("DELETE FROM daily_briefs WHERE id = ?").run(briefId);
      const deleteDerivedBrief = this.database.prepare(`
        DELETE FROM daily_briefs
        WHERE id IN (
          SELECT brief_id FROM brief_updates WHERE update_id = ?
        )
      `);
      const deleteUpdate = this.database.prepare(
        "DELETE FROM intelligence_updates WHERE id = ?",
      );
      const deleteDemoReviews = this.database.prepare(
        "DELETE FROM impact_reviews WHERE update_id = ?",
      );
      updateIds.forEach((updateId) => {
        deleteDerivedBrief.run(updateId);
        deleteDemoReviews.run(updateId);
        deleteUpdate.run(updateId);
      });
    });
  }

  listLayers(): StackLayer[] {
    const layerRows = rows(
      this.database
        .prepare("SELECT id, name, description FROM stack_layers ORDER BY sort_order")
        .all(),
    );
    const companyStatement = this.database.prepare(`
      SELECT company_ticker FROM company_layers
      WHERE layer_id = ? ORDER BY company_ticker
    `);
    const dependencyStatement = this.database.prepare(`
      SELECT depends_on_layer_id FROM layer_dependencies
      WHERE layer_id = ? ORDER BY depends_on_layer_id
    `);

    return layerRows.map((layerRow) => {
      const id = text(layerRow, "id") as StackLayer["id"];
      return {
        id,
        name: text(layerRow, "name"),
        description: text(layerRow, "description"),
        companyTickers: rows(companyStatement.all(id)).map((companyRow) =>
          text(companyRow, "company_ticker"),
        ),
        dependsOn: rows(dependencyStatement.all(id)).map((dependencyRow) =>
          text(dependencyRow, "depends_on_layer_id") as StackLayer["id"],
        ),
      };
    });
  }

  listCompanies(): Company[] {
    return rows(
      this.database
        .prepare("SELECT * FROM companies WHERE archived = 0 ORDER BY ticker")
        .all(),
    ).map((companyRow) => this.mapCompany(companyRow));
  }

  getCompany(ticker: string): Company | null {
    const companyRow = row(
      this.database
        .prepare("SELECT * FROM companies WHERE ticker = ? AND archived = 0")
        .get(ticker.toUpperCase()),
    );
    return companyRow ? this.mapCompany(companyRow) : null;
  }

  upsertCompany(input: CompanyInput): Company {
    const ticker = input.ticker.toUpperCase();
    const updatedAt = new Date().toISOString();
    const knownLayer = this.database.prepare(
      "SELECT 1 FROM stack_layers WHERE id = ?",
    );
    const invalidLayer = input.layerIds.find(
      (layerId) => !knownLayer.get(layerId),
    );
    if (invalidLayer) {
      throw new RangeError(`Unknown stack layer: ${invalidLayer}`);
    }

    this.withTransaction(() => {
      this.database
        .prepare(`
          INSERT INTO companies (
            ticker, name, description, thesis, why_it_matters,
            proves_right_json, breaks_thesis_json, watch_metrics_json,
            confidence, updated_at, archived
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
          ON CONFLICT(ticker) DO UPDATE SET
            name = excluded.name,
            description = excluded.description,
            thesis = excluded.thesis,
            why_it_matters = excluded.why_it_matters,
            proves_right_json = excluded.proves_right_json,
            breaks_thesis_json = excluded.breaks_thesis_json,
            watch_metrics_json = excluded.watch_metrics_json,
            confidence = excluded.confidence,
            updated_at = excluded.updated_at,
            archived = 0
        `)
        .run(
          ticker,
          input.name,
          input.description,
          input.thesis,
          input.whyItMatters,
          JSON.stringify(input.provesRight),
          JSON.stringify(input.breaksThesis),
          JSON.stringify(input.watchMetrics),
          input.confidence,
          updatedAt,
        );
      this.database
        .prepare("DELETE FROM company_layers WHERE company_ticker = ?")
        .run(ticker);
      const insertLayer = this.database.prepare(
        "INSERT INTO company_layers (company_ticker, layer_id) VALUES (?, ?)",
      );
      input.layerIds.forEach((layerId) => insertLayer.run(ticker, layerId));
    });

    const thesisId = `company-${ticker.toLowerCase()}`;
    const existingThesis = this.getThesis(thesisId);
    if (!existingThesis) {
      this.createThesis({
        id: thesisId,
        kind: "company",
        title: input.name,
        belief: input.thesis,
        confidenceScore: confidenceToScore(input.confidence),
        unknowns: [],
        strengtheningConditions: input.provesRight,
        weakeningConditions: input.breaksThesis,
        companyTickers: [ticker],
        layerIds: input.layerIds,
      });
    } else if (existingThesis.status === "archived") {
      this.database
        .prepare(`
          UPDATE theses
          SET status = 'active', updated_at = ?
          WHERE id = ?
        `)
        .run(updatedAt, thesisId);
    }

    const company = this.getCompany(ticker);
    if (!company) {
      throw new Error(`Failed to reload company ${ticker}`);
    }
    return company;
  }

  archiveCompany(ticker: string): boolean {
    const normalizedTicker = ticker.toUpperCase();
    const updatedAt = new Date().toISOString();
    let changed = false;
    this.withTransaction(() => {
      const result = this.database
        .prepare(`
          UPDATE companies
          SET archived = 1, updated_at = ?
          WHERE ticker = ? AND archived = 0
        `)
        .run(updatedAt, normalizedTicker);
      changed = result.changes > 0;
      if (changed) {
        this.database
          .prepare(`
            UPDATE theses
            SET status = 'archived', updated_at = ?
            WHERE type = 'company'
              AND id IN (
                SELECT thesis_id
                FROM thesis_companies
                WHERE company_ticker = ?
              )
          `)
          .run(updatedAt, normalizedTicker);
      }
    });
    return changed;
  }

  listTheses(filters: ThesisListFilters = {}): Thesis[] {
    const clauses: string[] = [];
    const values: string[] = [];
    if (filters.kind) {
      clauses.push("type = ?");
      values.push(filters.kind);
    }
    if (filters.status !== "all") {
      clauses.push("status = ?");
      values.push(filters.status ?? "active");
    }
    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    return rows(
      this.database
        .prepare(`
          SELECT id
          FROM theses
          ${where}
          ORDER BY type, title, id
        `)
        .all(...values),
    )
      .map((thesisRow) => this.getThesis(text(thesisRow, "id")))
      .filter((thesis): thesis is Thesis => thesis !== null);
  }

  getThesis(
    id: string,
    options: ThesisReadOptions = {},
  ): Thesis | null {
    const thesisRow = row(
      this.database.prepare("SELECT * FROM theses WHERE id = ?").get(id),
    );
    if (!thesisRow) {
      return null;
    }
    const currentVersionId = nullableText(thesisRow, "current_version_id");
    if (!currentVersionId) {
      throw new Error(`Thesis ${id} has no current version`);
    }
    const versionRow = row(
      this.database
        .prepare("SELECT * FROM thesis_versions WHERE id = ?")
        .get(currentVersionId),
    );
    if (!versionRow) {
      throw new Error(`Thesis ${id} references a missing current version`);
    }
    const companyRows = rows(
      this.database
        .prepare(`
          SELECT company_ticker
          FROM thesis_companies
          WHERE thesis_id = ?
          ORDER BY company_ticker
        `)
        .all(id),
    );
    const layerRows = rows(
      this.database
        .prepare(`
          SELECT layer_id
          FROM thesis_layers
          WHERE thesis_id = ?
          ORDER BY layer_id
        `)
        .all(id),
    );
    const kind = text(thesisRow, "type") as Thesis["kind"];
    const routedSignals = options.includeRoutedSignals
      ? this.listThesisRoutedSignals(id, kind)
      : [];
    const evaluations = this.listThesisEvaluations({ thesisId: id });
    const latestAcceptedEvaluation = evaluations.find(
      (evaluation) => evaluation.reviewStatus === "accepted",
    );
    const scheduledEvaluation = evaluations.find(
      (evaluation) =>
        (evaluation.reviewStatus === "accepted" ||
          evaluation.reviewStatus === "deferred") &&
        evaluation.nextReviewOn,
    );
    return {
      id,
      kind,
      title: text(thesisRow, "title"),
      status: text(thesisRow, "status") as Thesis["status"],
      currentVersion: this.mapThesisVersion(versionRow),
      versions: this.getThesisHistory(id),
      momentum: latestAcceptedEvaluation
        ? evaluationMomentum(latestAcceptedEvaluation)
        : "unchanged",
      nextReviewOn: scheduledEvaluation?.nextReviewOn ?? null,
      bottlenecks: this.listThesisBottlenecks(currentVersionId),
      captureMechanisms:
        this.listThesisCaptureMechanisms(currentVersionId),
      companyTickers: companyRows.map((companyRow) =>
        text(companyRow, "company_ticker"),
      ),
      layerIds: layerRows.map(
        (layerRow) => text(layerRow, "layer_id") as Thesis["layerIds"][number],
      ),
      portfolioExposures: this.listPortfolioExposuresForThesis(id),
      evidence: this.listThesisEvidence(id),
      routedSignals,
      awaitingEvaluationCount: options.includeRoutedSignals
        ? routedSignals.filter(
            (signal) =>
              signal.evaluationState === "awaiting-evaluation",
          ).length
        : this.countAwaitingThesisRoutedSignals(id, kind),
      evaluations,
      createdAt: text(thesisRow, "created_at"),
      updatedAt: text(thesisRow, "updated_at"),
    };
  }

  getThesisDetail(id: string): Thesis | null {
    return this.getThesis(id, { includeRoutedSignals: true });
  }

  getCompanyThesisByTicker(ticker: string): Thesis | null {
    const thesisRow = row(
      this.database
        .prepare(`
          SELECT thesis.id
          FROM theses AS thesis
          INNER JOIN thesis_companies AS company
            ON company.thesis_id = thesis.id
          WHERE company.company_ticker = ?
            AND thesis.type = 'company'
            AND thesis.status = 'active'
          ORDER BY thesis.updated_at DESC, thesis.id
          LIMIT 1
        `)
        .get(ticker.toUpperCase()),
    );
    return thesisRow
      ? this.getThesisDetail(text(thesisRow, "id"))
      : null;
  }

  getThesisHistory(thesisId: string): ThesisVersion[] {
    return rows(
      this.database
        .prepare(`
          SELECT *
          FROM thesis_versions
          WHERE thesis_id = ?
          ORDER BY version DESC
        `)
        .all(thesisId),
    ).map((versionRow) => this.mapThesisVersion(versionRow));
  }

  listThesisBottlenecks(thesisVersionId: string): ThesisBottleneck[] {
    return rows(
      this.database
        .prepare(`
          SELECT *
          FROM thesis_version_bottlenecks
          WHERE thesis_version_id = ?
          ORDER BY sort_order, bottleneck_key
        `)
        .all(thesisVersionId),
    ).map((bottleneckRow) => ({
      key: text(bottleneckRow, "bottleneck_key"),
      title: text(bottleneckRow, "title"),
      description: text(bottleneckRow, "description"),
      sortOrder: numeric(bottleneckRow, "sort_order"),
    }));
  }

  listThesisCaptureMechanisms(
    thesisVersionId: string,
  ): CompanyCaptureMechanism[] {
    return rows(
      this.database
        .prepare(`
          SELECT *
          FROM thesis_version_company_captures
          WHERE thesis_version_id = ?
          ORDER BY sort_order, capture_key
        `)
        .all(thesisVersionId),
    ).map((captureRow) => ({
      key: text(captureRow, "capture_key"),
      bottleneckKey: text(captureRow, "bottleneck_key"),
      companyTicker: text(captureRow, "company_ticker"),
      role: text(captureRow, "role") as CompanyCaptureMechanism["role"],
      mechanism: text(captureRow, "mechanism"),
      sortOrder: numeric(captureRow, "sort_order"),
    }));
  }

  listThesisEvidence(thesisId: string): ThesisEvidence[] {
    return rows(
      this.database
        .prepare(`
          SELECT
            evidence.*,
            claim.update_id,
            claim.quote,
            claim.source_id,
            claim.locator
          FROM thesis_evidence AS evidence
          INNER JOIN evidence_claims AS claim ON claim.id = evidence.claim_id
          WHERE evidence.thesis_id = ?
          ORDER BY evidence.linked_at DESC, evidence.claim_id
        `)
        .all(thesisId),
    ).map((evidenceRow) => ({
      thesisId: text(evidenceRow, "thesis_id"),
      claimId: text(evidenceRow, "claim_id"),
      updateId: text(evidenceRow, "update_id"),
      stance: text(
        evidenceRow,
        "stance",
      ) as ThesisEvidence["stance"],
      rationale: text(evidenceRow, "rationale"),
      linkedAt: text(evidenceRow, "linked_at"),
      linkedByEvaluationId: nullableText(
        evidenceRow,
        "linked_by_evaluation_id",
      ),
      claim: {
        id: text(evidenceRow, "claim_id"),
        quote: text(evidenceRow, "quote"),
        sourceId: text(evidenceRow, "source_id"),
        locator: text(evidenceRow, "locator"),
      },
    }));
  }

  private listThesisRoutedSignals(
    thesisId: string,
    kind: Thesis["kind"],
  ): ThesisRoutedSignal[] {
    if (kind === "macro") {
      if (!this.hasTable("update_macro_thesis_impacts")) {
        return [];
      }
      return rows(
        this.database
          .prepare(`
            SELECT
              update_record.id AS update_id,
              update_record.title,
              update_record.publisher,
              update_record.published_at,
              route.relevance,
              NULL AS materiality,
              route.rationale,
              CASE
                WHEN NOT EXISTS (
                  SELECT 1
                  FROM thesis_evaluation_requeue AS requeue
                  WHERE requeue.update_id = route.update_id
                )
                AND EXISTS (
                  SELECT 1
                  FROM thesis_evaluations AS evaluation
                  INNER JOIN thesis_evaluation_updates AS evaluation_link
                    ON evaluation_link.evaluation_id = evaluation.id
                  WHERE evaluation.thesis_id = route.thesis_id
                    AND evaluation_link.update_id = route.update_id
                    AND evaluation.review_status IN (
                      'pending', 'accepted', 'rejected', 'deferred'
                    )
                ) THEN 'evaluated'
                ELSE 'awaiting-evaluation'
              END AS evaluation_state
            FROM update_macro_thesis_impacts AS route
            INNER JOIN intelligence_updates AS update_record
              ON update_record.id = route.update_id
            WHERE route.thesis_id = ?
            ORDER BY
              CASE evaluation_state
                WHEN 'awaiting-evaluation' THEN 0
                ELSE 1
              END,
              CASE route.relevance
                WHEN 'primary' THEN 1
                WHEN 'secondary' THEN 2
                ELSE 3
              END,
              update_record.published_at DESC,
              update_record.ingested_at DESC,
              update_record.id
          `)
          .all(thesisId),
      ).map((signalRow) => this.mapThesisRoutedSignal(signalRow));
    }

    if (
      !this.hasTable("update_companies") ||
      !this.hasTable("thesis_impacts")
    ) {
      return [];
    }
    return rows(
      this.database
        .prepare(`
          WITH company_routes AS (
            SELECT DISTINCT
              update_record.id AS update_id,
              update_record.title,
              update_record.publisher,
              update_record.published_at,
              update_record.materiality,
              COALESCE(NULLIF(impact.thesis_delta, ''), impact.summary)
                AS rationale
            FROM thesis_companies AS thesis_company
            INNER JOIN update_companies AS update_company
              ON update_company.company_ticker = thesis_company.company_ticker
            INNER JOIN thesis_impacts AS impact
              ON impact.update_id = update_company.update_id
             AND impact.company_ticker = thesis_company.company_ticker
            INNER JOIN intelligence_updates AS update_record
              ON update_record.id = update_company.update_id
            WHERE thesis_company.thesis_id = ?
          ),
          routed_updates AS (
            SELECT
              update_id,
              title,
              publisher,
              published_at,
              materiality,
              GROUP_CONCAT(rationale, ' / ') AS rationale
            FROM company_routes
            GROUP BY
              update_id,
              title,
              publisher,
              published_at,
              materiality
          )
          SELECT
            route.update_id,
            route.title,
            route.publisher,
            route.published_at,
            NULL AS relevance,
            route.materiality,
            route.rationale,
            CASE
              WHEN NOT EXISTS (
                SELECT 1
                FROM thesis_evaluation_requeue AS requeue
                WHERE requeue.update_id = route.update_id
              )
              AND EXISTS (
                SELECT 1
                FROM thesis_evaluations AS evaluation
                INNER JOIN thesis_evaluation_updates AS evaluation_link
                  ON evaluation_link.evaluation_id = evaluation.id
                WHERE evaluation.thesis_id = thesis_company.thesis_id
                  AND evaluation_link.update_id = route.update_id
                  AND evaluation.review_status IN (
                    'pending', 'accepted', 'rejected', 'deferred'
                  )
              ) THEN 'evaluated'
              ELSE 'awaiting-evaluation'
            END AS evaluation_state
          FROM routed_updates AS route
          CROSS JOIN (
            SELECT ? AS thesis_id
          ) AS thesis_company
          WHERE thesis_company.thesis_id = ?
          ORDER BY
            CASE evaluation_state
              WHEN 'awaiting-evaluation' THEN 0
              ELSE 1
            END,
            CASE route.materiality
              WHEN 'high' THEN 1
              WHEN 'medium' THEN 2
              WHEN 'low' THEN 3
              ELSE 4
            END,
            route.published_at DESC,
            route.update_id
        `)
        .all(thesisId, thesisId, thesisId),
    ).map((signalRow) => this.mapThesisRoutedSignal(signalRow));
  }

  private countAwaitingThesisRoutedSignals(
    thesisId: string,
    kind: Thesis["kind"],
  ): number {
    if (
      kind === "macro" &&
      !this.hasTable("update_macro_thesis_impacts")
    ) {
      return 0;
    }
    if (
      kind === "company" &&
      (!this.hasTable("update_companies") ||
        !this.hasTable("thesis_impacts"))
    ) {
      return 0;
    }
    const result =
      kind === "macro"
        ? row(
            this.database
              .prepare(`
                SELECT COUNT(*) AS count
                FROM update_macro_thesis_impacts AS route
                WHERE route.thesis_id = ?
                  AND (
                    EXISTS (
                      SELECT 1
                      FROM thesis_evaluation_requeue AS requeue
                      WHERE requeue.update_id = route.update_id
                    )
                    OR NOT EXISTS (
                      SELECT 1
                      FROM thesis_evaluations AS evaluation
                      INNER JOIN thesis_evaluation_updates AS evaluation_link
                        ON evaluation_link.evaluation_id = evaluation.id
                      WHERE evaluation.thesis_id = route.thesis_id
                        AND evaluation_link.update_id = route.update_id
                        AND evaluation.review_status IN (
                          'pending', 'accepted', 'rejected', 'deferred'
                        )
                    )
                  )
              `)
              .get(thesisId),
          )
        : row(
            this.database
              .prepare(`
                SELECT COUNT(DISTINCT update_record.id) AS count
                FROM thesis_companies AS thesis_company
                INNER JOIN update_companies AS update_company
                  ON update_company.company_ticker =
                    thesis_company.company_ticker
                INNER JOIN thesis_impacts AS impact
                  ON impact.update_id = update_company.update_id
                 AND impact.company_ticker =
                    thesis_company.company_ticker
                INNER JOIN intelligence_updates AS update_record
                  ON update_record.id = update_company.update_id
                WHERE thesis_company.thesis_id = ?
                  AND (
                    EXISTS (
                      SELECT 1
                      FROM thesis_evaluation_requeue AS requeue
                      WHERE requeue.update_id = update_record.id
                    )
                    OR NOT EXISTS (
                      SELECT 1
                      FROM thesis_evaluations AS evaluation
                      INNER JOIN thesis_evaluation_updates AS evaluation_link
                        ON evaluation_link.evaluation_id = evaluation.id
                      WHERE evaluation.thesis_id = thesis_company.thesis_id
                        AND evaluation_link.update_id = update_record.id
                        AND evaluation.review_status IN (
                          'pending', 'accepted', 'rejected', 'deferred'
                        )
                    )
                  )
              `)
              .get(thesisId),
          );
    return result ? numeric(result, "count") : 0;
  }

  createThesis(input: ThesisInput): Thesis {
    assertThesisState(input);
    if (!input.title.trim()) {
      throw new TypeError("A thesis title cannot be empty.");
    }
    const id = input.id?.trim() || `thesis-${randomUUID()}`;
    const versionId = `${id}-v1`;
    const createdAt = new Date().toISOString();
    const companyTickers = uniqueStrings(
      input.companyTickers.map((ticker) => ticker.toUpperCase()),
    );
    const layerIds = uniqueStrings(input.layerIds);
    if (input.kind === "company" && companyTickers.length === 0) {
      throw new TypeError(
        "A company thesis must reference at least one company.",
      );
    }
    this.assertKnownThesisAssociations(companyTickers, layerIds);

    this.withTransaction(() => {
      this.database
        .prepare(`
          INSERT INTO theses (
            id, type, title, status, current_version_id, created_at, updated_at
          ) VALUES (?, ?, ?, 'active', NULL, ?, ?)
        `)
        .run(id, input.kind, input.title.trim(), createdAt, createdAt);
      this.database
        .prepare(`
          INSERT INTO thesis_versions (
            id, thesis_id, version, belief, confidence, unknowns_json,
            strengthening_conditions_json, weakening_conditions_json,
            created_at, created_by_evaluation_id
          ) VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, NULL)
        `)
        .run(
          versionId,
          id,
          input.belief.trim(),
          input.confidenceScore,
          JSON.stringify(normalizeTextList(input.unknowns)),
          JSON.stringify(normalizeTextList(input.strengtheningConditions)),
          JSON.stringify(normalizeTextList(input.weakeningConditions)),
          createdAt,
        );
      this.database
        .prepare("UPDATE theses SET current_version_id = ? WHERE id = ?")
        .run(versionId, id);
      const insertCompany = this.database.prepare(`
        INSERT INTO thesis_companies (thesis_id, company_ticker) VALUES (?, ?)
      `);
      companyTickers.forEach((ticker) => insertCompany.run(id, ticker));
      const insertLayer = this.database.prepare(`
        INSERT INTO thesis_layers (thesis_id, layer_id) VALUES (?, ?)
      `);
      layerIds.forEach((layerId) => insertLayer.run(id, layerId));
    });

    const thesis = this.getThesis(id);
    if (!thesis) {
      throw new Error(`Failed to reload thesis ${id}`);
    }
    return thesis;
  }

  archiveThesis(id: string): boolean {
    const result = this.database
      .prepare(`
        UPDATE theses
        SET status = 'archived', updated_at = ?
        WHERE id = ? AND status = 'active'
      `)
      .run(new Date().toISOString(), id);
    return result.changes > 0;
  }

  persistThesisEvaluation(
    input: ThesisEvaluationInput,
  ): ThesisEvaluation {
    const thesis = this.getThesis(input.thesisId);
    if (!thesis || thesis.status !== "active") {
      throw new RangeError(`Unknown active thesis: ${input.thesisId}`);
    }
    const proposal = {
      belief: input.proposedBelief,
      confidenceScore: input.proposedConfidenceScore,
      unknowns: input.proposedUnknowns,
      strengtheningConditions: input.proposedStrengtheningConditions,
      weakeningConditions: input.proposedWeakeningConditions,
    };
    assertThesisState(proposal);
    if (!input.summary.trim() || !input.rationale.trim()) {
      throw new TypeError("Thesis evaluations require a summary and rationale.");
    }
    const reviewRecommendation = input.reviewRecommendation ?? null;
    const reviewRecommendationReason =
      input.reviewRecommendationReason?.trim() || null;
    if (
      Boolean(reviewRecommendation) !==
      Boolean(reviewRecommendationReason)
    ) {
      throw new TypeError(
        "An LLM review recommendation requires both a decision and a reason.",
      );
    }
    if (
      reviewRecommendationReason &&
      reviewRecommendationReason.length > 240
    ) {
      throw new RangeError(
        "An LLM review recommendation reason cannot exceed 240 characters.",
      );
    }

    const signalIds = uniqueStrings(input.signalIds);
    const evidence = input.evidence.map((item) => ({
      claimId: item.claimId.trim(),
      stance: item.stance,
      rationale: item.rationale.trim(),
    }));
    if (new Set(evidence.map((item) => item.claimId)).size !== evidence.length) {
      throw new TypeError("A claim can appear only once in a thesis evaluation.");
    }
    if (signalIds.length === 0 && evidence.length === 0) {
      throw new TypeError(
        "Thesis evaluations must reference at least one signal or evidence claim.",
      );
    }
    const knownSignal = this.database.prepare(
      "SELECT 1 FROM intelligence_updates WHERE id = ?",
    );
    signalIds.forEach((signalId) => {
      if (!knownSignal.get(signalId)) {
        throw new RangeError(`Unknown signal: ${signalId}`);
      }
    });
    const claimRow = this.database.prepare(
      "SELECT update_id FROM evidence_claims WHERE id = ?",
    );
    evidence.forEach((item) => {
      if (!item.claimId || !item.rationale) {
        throw new TypeError(
          "Evaluation evidence requires a claim and rationale.",
        );
      }
      const knownClaim = row(claimRow.get(item.claimId));
      if (!knownClaim) {
        throw new RangeError(`Unknown evidence claim: ${item.claimId}`);
      }
      const updateId = text(knownClaim, "update_id");
      if (!signalIds.includes(updateId)) {
        signalIds.push(updateId);
      }
    });

    const previous = thesis.currentVersion;
    const stateChanged = !sameThesisState(previous, proposal);
    const confidenceDelta =
      proposal.confidenceScore - previous.confidenceScore;
    const beliefChanged =
      proposal.belief.trim() !== previous.belief.trim();
    const surroundingFieldsChanged =
      !sameTextSet(proposal.unknowns, previous.unknowns) ||
      !sameTextSet(
        proposal.strengtheningConditions,
        previous.strengtheningConditions,
      ) ||
      !sameTextSet(
        proposal.weakeningConditions,
        previous.weakeningConditions,
      );
    if (Math.abs(confidenceDelta) > 10) {
      throw new RangeError(
        "A thesis confidence change cannot exceed 10 points per evaluation.",
      );
    }
    if (input.outcome === "unchanged" && stateChanged) {
      throw new TypeError(
        "An unchanged evaluation cannot propose a different thesis state.",
      );
    }
    if (input.outcome !== "unchanged" && !stateChanged) {
      throw new TypeError(
        "A changed evaluation must propose a different thesis state.",
      );
    }
    if (
      input.outcome !== "revised" &&
      (beliefChanged || surroundingFieldsChanged)
    ) {
      throw new TypeError(
        "Only a revised evaluation can change thesis text or surrounding fields.",
      );
    }
    if (input.outcome === "revised" && !beliefChanged) {
      throw new TypeError(
        "A revised evaluation must propose different thesis text.",
      );
    }
    if (
      input.outcome === "reinforced" &&
      (confidenceDelta <= 0 ||
        !evidence.some((item) => item.stance === "supports"))
    ) {
      throw new TypeError(
        "A reinforced thesis requires supporting evidence and higher confidence.",
      );
    }
    if (
      (input.outcome === "weakened" ||
        input.outcome === "contradicted") &&
      (confidenceDelta >= 0 ||
        !evidence.some((item) => item.stance === "opposes"))
    ) {
      throw new TypeError(
        "A weakened or contradicted thesis requires opposing evidence and lower confidence.",
      );
    }

    const requestedId =
      input.id?.trim() || `thesis-evaluation-${randomUUID()}`;
    const existingEvaluation = this.getThesisEvaluation(requestedId);
    const repeatsExplicitlyRequeuedSignal =
      existingEvaluation?.reviewStatus !== "pending" &&
      signalIds.some((signalId) =>
        this.database
          .prepare(`
            SELECT 1
            FROM thesis_evaluation_requeue
            WHERE update_id = ?
          `)
          .get(signalId),
      );
    if (
      existingEvaluation &&
      !wasSystemInvalidated(existingEvaluation) &&
      !repeatsExplicitlyRequeuedSignal
    ) {
      if (
        existingEvaluation.thesisId !== thesis.id ||
        existingEvaluation.previousVersionId !== previous.id ||
        existingEvaluation.outcome !== input.outcome ||
        existingEvaluation.proposedBelief.trim() !== proposal.belief.trim() ||
        existingEvaluation.proposedConfidenceScore !==
          proposal.confidenceScore ||
        existingEvaluation.reviewRecommendation !== reviewRecommendation ||
        existingEvaluation.reviewRecommendationReason !==
          reviewRecommendationReason ||
        !sameTextSet(existingEvaluation.proposedUnknowns, proposal.unknowns) ||
        !sameTextSet(
          existingEvaluation.proposedStrengtheningConditions,
          proposal.strengtheningConditions,
        ) ||
        !sameTextSet(
          existingEvaluation.proposedWeakeningConditions,
          proposal.weakeningConditions,
        ) ||
        !sameTextSet(existingEvaluation.signalIds, signalIds) ||
        !sameTextSet(
          existingEvaluation.claimIds,
          evidence.map((item) => item.claimId),
        )
      ) {
        throw new TypeError(
          `Thesis evaluation ID ${requestedId} already belongs to a different proposal.`,
        );
      }
      return existingEvaluation;
    }
    const id = existingEvaluation
      ? `${requestedId}-retry-${randomUUID()}`
      : requestedId;
    const createdAt = new Date().toISOString();
    this.withTransaction(() => {
      this.database
        .prepare(`
          INSERT INTO thesis_evaluations (
            id, thesis_id, previous_version_id, accepted_version_id, outcome,
            summary, rationale, proposed_belief, previous_confidence,
            proposed_confidence, proposed_unknowns_json,
            proposed_strengthening_conditions_json,
            proposed_weakening_conditions_json, review_recommendation,
            review_recommendation_reason, review_status, review_note, model,
            created_at, reviewed_at
          ) VALUES (
            ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL,
            ?, ?, NULL
          )
        `)
        .run(
          id,
          thesis.id,
          previous.id,
          input.outcome,
          input.summary.trim(),
          input.rationale.trim(),
          proposal.belief.trim(),
          previous.confidenceScore,
          proposal.confidenceScore,
          JSON.stringify(normalizeTextList(proposal.unknowns)),
          JSON.stringify(
            normalizeTextList(proposal.strengtheningConditions),
          ),
          JSON.stringify(normalizeTextList(proposal.weakeningConditions)),
          reviewRecommendation,
          reviewRecommendationReason,
          input.model ?? null,
          createdAt,
        );
      const insertSignal = this.database.prepare(`
        INSERT INTO thesis_evaluation_updates (evaluation_id, update_id)
        VALUES (?, ?)
      `);
      signalIds.forEach((signalId) => insertSignal.run(id, signalId));
      const insertEvidence = this.database.prepare(`
        INSERT INTO thesis_evaluation_evidence (
          evaluation_id, claim_id, stance, rationale
        ) VALUES (?, ?, ?, ?)
      `);
      evidence.forEach((item) =>
        insertEvidence.run(id, item.claimId, item.stance, item.rationale),
      );
    });

    const evaluation = this.getThesisEvaluation(id);
    if (!evaluation) {
      throw new Error(`Failed to reload thesis evaluation ${id}`);
    }
    return evaluation;
  }

  getThesisEvaluation(id: string): ThesisEvaluation | null {
    const evaluationRow = row(
      this.database
        .prepare("SELECT * FROM thesis_evaluations WHERE id = ?")
        .get(id),
    );
    return evaluationRow ? this.mapThesisEvaluation(evaluationRow) : null;
  }

  listThesisEvaluations(
    filters: ThesisEvaluationListFilters = {},
  ): ThesisEvaluation[] {
    const clauses: string[] = [];
    const values: string[] = [];
    if (filters.thesisId) {
      clauses.push("thesis_id = ?");
      values.push(filters.thesisId);
    }
    if (filters.reviewStatus) {
      clauses.push("review_status = ?");
      values.push(filters.reviewStatus);
    }
    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    return rows(
      this.database
        .prepare(`
          SELECT *
          FROM thesis_evaluations
          ${where}
          ORDER BY created_at DESC, id
        `)
        .all(...values),
    ).map((evaluationRow) => this.mapThesisEvaluation(evaluationRow));
  }

  listRecentThesisEvaluations(limit = 50): ThesisEvaluation[] {
    return rows(
      this.database
        .prepare(`
          SELECT *
          FROM thesis_evaluations
          ORDER BY created_at DESC, id
          LIMIT ?
        `)
        .all(limit),
    ).map((evaluationRow) => this.mapThesisEvaluation(evaluationRow));
  }

  listThesisEvaluationsSince(timestamp: string): ThesisEvaluation[] {
    return rows(
      this.database
        .prepare(`
          SELECT *
          FROM thesis_evaluations
          WHERE created_at > ? OR reviewed_at > ?
          ORDER BY MAX(created_at, COALESCE(reviewed_at, created_at)), id
        `)
        .all(timestamp, timestamp),
    ).map((evaluationRow) => this.mapThesisEvaluation(evaluationRow));
  }

  getLatestThesisEvaluationRunCursor(): string | null {
    const latest = row(
      this.database
        .prepare(`
          SELECT signal_ingestion_cursor
          FROM thesis_evaluation_runs
          ORDER BY signal_ingestion_cursor DESC, completed_at DESC, id DESC
          LIMIT 1
        `)
        .get(),
    );
    return latest ? text(latest, "signal_ingestion_cursor") : null;
  }

  recordThesisEvaluationRun(
    input: ThesisEvaluationRunInput,
  ): ThesisEvaluationRun {
    assertIsoTimestamp(
      input.signalIngestionCursor,
      "signal ingestion cursor",
    );
    if (
      !Number.isInteger(input.signalCount) ||
      input.signalCount < 0 ||
      !Number.isInteger(input.evaluationCount) ||
      input.evaluationCount < 0
    ) {
      throw new RangeError(
        "Evaluation run counts must be non-negative integers.",
      );
    }
    const latestCursor = this.getLatestThesisEvaluationRunCursor();
    if (
      latestCursor &&
      input.signalIngestionCursor.localeCompare(latestCursor) < 0
    ) {
      throw new RangeError(
        "An evaluation run cannot move the signal cursor backwards.",
      );
    }
    const id = input.id?.trim() || `thesis-evaluation-run-${randomUUID()}`;
    const completedAt = input.completedAt ?? new Date().toISOString();
    assertIsoTimestamp(completedAt, "evaluation completion time");
    this.database
      .prepare(`
        INSERT INTO thesis_evaluation_runs (
          id, signal_ingestion_cursor, signal_count, evaluation_count,
          model, completed_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `)
      .run(
        id,
        input.signalIngestionCursor,
        input.signalCount,
        input.evaluationCount,
        input.model ?? null,
        completedAt,
      );
    return {
      id,
      signalIngestionCursor: input.signalIngestionCursor,
      signalCount: input.signalCount,
      evaluationCount: input.evaluationCount,
      model: input.model ?? null,
      completedAt,
    };
  }

  getLatestThesisEvaluationAt(): string | null {
    const latest = row(
      this.database
        .prepare(`
          SELECT created_at
          FROM thesis_evaluations
          ORDER BY created_at DESC, id DESC
          LIMIT 1
        `)
        .get(),
    );
    return latest ? text(latest, "created_at") : null;
  }

  listRequeuedThesisEvaluationUpdates(): IntelligenceUpdate[] {
    return rows(
      this.database
        .prepare(`
          SELECT update_id
          FROM thesis_evaluation_requeue
          ORDER BY requested_at, update_id
        `)
        .all(),
    )
      .map((queueRow) => this.getUpdate(text(queueRow, "update_id")))
      .filter((update): update is IntelligenceUpdate => update !== null);
  }

  getThesisEvaluationRequeueReason(updateId: string): string | null {
    const queued = row(
      this.database
        .prepare(`
          SELECT reason
          FROM thesis_evaluation_requeue
          WHERE update_id = ?
        `)
        .get(updateId),
    );
    return queued ? text(queued, "reason") : null;
  }

  queueThesisEvaluationUpdate(
    updateId: string,
    reason = "Signal was manually queued for thesis re-evaluation.",
  ): ThesisEvaluationRequeueRecord {
    if (!this.getUpdate(updateId)) {
      throw new RangeError(`Unknown signal: ${updateId}`);
    }
    const existing = row(
      this.database
        .prepare(`
          SELECT requested_at
          FROM thesis_evaluation_requeue
          WHERE update_id = ?
        `)
        .get(updateId),
    );
    const invalidatedEvaluationIds = rows(
      this.database
        .prepare(`
          SELECT evaluation.id
          FROM thesis_evaluations AS evaluation
          INNER JOIN thesis_evaluation_updates AS link
            ON link.evaluation_id = evaluation.id
          WHERE link.update_id = ?
            AND evaluation.review_status IN ('pending', 'deferred')
          ORDER BY evaluation.created_at, evaluation.id
        `)
        .all(updateId),
    ).map((evaluationRow) => text(evaluationRow, "id"));
    const requestedAt = existing
      ? text(existing, "requested_at")
      : new Date().toISOString();
    const reviewNote =
      `${SIGNAL_REEVALUATION_INVALIDATION_PREFIX}was requested for signal ${updateId}.`;

    this.withTransaction(() => {
      const invalidate = this.database.prepare(`
        UPDATE thesis_evaluations
        SET review_status = 'rejected',
            review_note = ?,
            reviewed_at = ?,
            accepted_version_id = NULL
        WHERE id = ?
          AND review_status IN ('pending', 'deferred')
      `);
      invalidatedEvaluationIds.forEach((evaluationId) => {
        invalidate.run(reviewNote, requestedAt, evaluationId);
      });
      if (!existing) {
        this.database
          .prepare(`
            INSERT INTO thesis_evaluation_requeue (
              update_id, requested_at, reason
            ) VALUES (?, ?, ?)
          `)
          .run(
            updateId,
            requestedAt,
            reason.trim() || "Manual re-evaluation",
          );
      } else {
        this.database
          .prepare(`
            UPDATE thesis_evaluation_requeue
            SET reason = ?
            WHERE update_id = ?
          `)
          .run(reason.trim() || "Manual re-evaluation", updateId);
      }
    });

    return {
      updateId,
      requestedAt,
      alreadyQueued: Boolean(existing),
      invalidatedEvaluationIds,
    };
  }

  clearThesisEvaluationRequeue(updateIds: readonly string[]): void {
    const remove = this.database.prepare(
      "DELETE FROM thesis_evaluation_requeue WHERE update_id = ?",
    );
    this.withTransaction(() => {
      uniqueStrings(updateIds).forEach((updateId) => remove.run(updateId));
    });
  }

  reconcileImpactReview(input: {
    updateId: string;
    impactId: string;
    companyTicker: string;
    decision: ImpactReview["decision"];
    previousDecision: ImpactReview["decision"] | null;
  }): {
    invalidatedEvaluationIds: string[];
    requeued: boolean;
  } {
    const update = this.getUpdate(input.updateId);
    if (!update) {
      throw new RangeError(`Unknown signal: ${input.updateId}`);
    }
    const decisionChanged = input.previousDecision !== input.decision;
    if (!decisionChanged) {
      return { invalidatedEvaluationIds: [], requeued: false };
    }

    const fullyRejected = update.thesisImpacts.length > 0 &&
      update.thesisImpacts.every(
        (impact) =>
          impact.decision === "rejected" ||
          impact.review?.decision === "rejected",
      );
    const invalidatedEvaluationIds =
      input.decision === "rejected"
        ? this.listThesisEvaluations()
            .filter(
              (evaluation) =>
                (evaluation.reviewStatus === "pending" ||
                  evaluation.reviewStatus === "deferred") &&
                evaluation.signalIds.includes(input.updateId),
            )
            .filter((evaluation) => {
              if (fullyRejected) {
                return true;
              }
              const thesis = this.getThesis(evaluation.thesisId);
              return thesis?.kind === "company" &&
                thesis.companyTickers.includes(
                  input.companyTicker.toUpperCase(),
                );
            })
            .map((evaluation) => evaluation.id)
        : [];
    const reviewedAt = new Date().toISOString();
    const requeued =
      input.decision === "accepted" &&
      input.previousDecision !== "accepted";

    this.withTransaction(() => {
      const invalidate = this.database.prepare(`
        UPDATE thesis_evaluations
        SET review_status = 'rejected',
            review_note = ?,
            reviewed_at = ?,
            accepted_version_id = NULL
        WHERE id = ?
          AND review_status IN ('pending', 'deferred')
      `);
      invalidatedEvaluationIds.forEach((evaluationId) => {
        invalidate.run(
          `${IMPACT_REVIEW_INVALIDATION_PREFIX}${input.impactId} was marked not material.`,
          reviewedAt,
          evaluationId,
        );
      });
      this.database
        .prepare(`
          DELETE FROM daily_briefs
          WHERE id IN (
            SELECT brief_id
            FROM brief_updates
            WHERE update_id = ?
            UNION
            SELECT brief_link.brief_id
            FROM brief_thesis_evaluations AS brief_link
            INNER JOIN thesis_evaluation_updates AS evaluation_link
              ON evaluation_link.evaluation_id = brief_link.evaluation_id
            WHERE evaluation_link.update_id = ?
          )
        `)
        .run(input.updateId, input.updateId);
      if (requeued) {
        this.database
          .prepare(`
            INSERT INTO thesis_evaluation_requeue (
              update_id, requested_at, reason
            ) VALUES (?, ?, ?)
            ON CONFLICT(update_id) DO UPDATE SET
              requested_at = excluded.requested_at,
              reason = excluded.reason
          `)
          .run(
            input.updateId,
            reviewedAt,
            `Impact ${input.impactId} was marked material.`,
          );
      }
    });
    return { invalidatedEvaluationIds, requeued };
  }

  reviewThesisEvaluation(
    id: string,
    input: ThesisEvaluationReviewInput,
  ): ThesisEvaluation {
    const evaluation = this.getThesisEvaluation(id);
    if (!evaluation) {
      throw new RangeError(`Unknown thesis evaluation: ${id}`);
    }
    const nextReviewOn = input.nextReviewOn?.trim() || null;
    if (nextReviewOn) {
      assertIsoDate(nextReviewOn, "next review date");
    }
    const portfolioDecisions = (input.portfolioDecisions ?? []).map(
      (decision) => ({
        portfolioItemId: decision.portfolioItemId.trim(),
        action: decision.action,
        rationale: decision.rationale.trim(),
      }),
    );
    if (
      new Set(portfolioDecisions.map((decision) => decision.portfolioItemId))
        .size !== portfolioDecisions.length
    ) {
      throw new TypeError(
        "A portfolio item can have only one decision per thesis review.",
      );
    }
    if (input.decision !== "accepted" && portfolioDecisions.length > 0) {
      throw new TypeError(
        "Portfolio decisions can be recorded only for an accepted thesis review.",
      );
    }
    const knownPortfolioItem = this.database.prepare(
      "SELECT 1 FROM portfolio_items WHERE id = ? AND status <> 'archived'",
    );
    const linkedPortfolioItem = this.database.prepare(`
      SELECT 1
      FROM portfolio_thesis_exposures
      WHERE portfolio_item_id = ? AND thesis_id = ?
    `);
    portfolioDecisions.forEach((decision) => {
      if (!decision.portfolioItemId || !decision.rationale) {
        throw new TypeError(
          "Portfolio decisions require an item and a rationale.",
        );
      }
      if (!knownPortfolioItem.get(decision.portfolioItemId)) {
        throw new RangeError(
          `Unknown active portfolio item: ${decision.portfolioItemId}`,
        );
      }
      if (!linkedPortfolioItem.get(decision.portfolioItemId, evaluation.thesisId)) {
        throw new TypeError(
          `Portfolio item ${decision.portfolioItemId} is not exposed to thesis ${evaluation.thesisId}.`,
        );
      }
    });
    if (
      evaluation.reviewStatus === "accepted" ||
      evaluation.reviewStatus === "rejected"
    ) {
      if (evaluation.reviewStatus === input.decision) {
        if (
          evaluation.nextReviewOn === nextReviewOn &&
          samePortfolioDecisions(
            evaluation.portfolioDecisions,
            portfolioDecisions,
          )
        ) {
          return evaluation;
        }
      }
      throw new TypeError(
        `A ${evaluation.reviewStatus} thesis evaluation is final.`,
      );
    }

    const reviewedAt = new Date().toISOString();
    const reviewNote = input.note?.trim() || null;
    this.withTransaction(() => {
      let acceptedVersionId: string | null = null;
      if (input.decision === "accepted") {
        const thesis = this.getThesis(evaluation.thesisId);
        if (!thesis || thesis.status !== "active") {
          throw new RangeError(
            `Unknown active thesis: ${evaluation.thesisId}`,
          );
        }
        if (thesis.currentVersion.id !== evaluation.previousVersionId) {
          throw new TypeError(
            "This evaluation is stale because the thesis has changed.",
          );
        }
        const proposal = {
          belief: evaluation.proposedBelief,
          confidenceScore: evaluation.proposedConfidenceScore,
          unknowns: evaluation.proposedUnknowns,
          strengtheningConditions:
            evaluation.proposedStrengtheningConditions,
          weakeningConditions: evaluation.proposedWeakeningConditions,
        };
        if (sameThesisState(thesis.currentVersion, proposal)) {
          acceptedVersionId = thesis.currentVersion.id;
        } else {
          const versionNumber = thesis.currentVersion.version + 1;
          acceptedVersionId = `thesis-version-${randomUUID()}`;
          this.database
            .prepare(`
              INSERT INTO thesis_versions (
                id, thesis_id, version, belief, confidence, unknowns_json,
                strengthening_conditions_json, weakening_conditions_json,
                created_at, created_by_evaluation_id
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `)
            .run(
              acceptedVersionId,
              thesis.id,
              versionNumber,
              proposal.belief,
              proposal.confidenceScore,
              JSON.stringify(proposal.unknowns),
              JSON.stringify(proposal.strengtheningConditions),
              JSON.stringify(proposal.weakeningConditions),
              reviewedAt,
              evaluation.id,
            );
          this.copyThesisVersionStructure(
            thesis.currentVersion.id,
            acceptedVersionId,
          );
          this.database
            .prepare(`
              UPDATE theses
              SET current_version_id = ?, updated_at = ?
              WHERE id = ?
            `)
            .run(acceptedVersionId, reviewedAt, thesis.id);
        }
        const linkEvidence = this.database.prepare(`
          INSERT INTO thesis_evidence (
            thesis_id, claim_id, stance, rationale, linked_at,
            linked_by_evaluation_id
          ) VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(thesis_id, claim_id) DO UPDATE SET
            stance = excluded.stance,
            rationale = excluded.rationale,
            linked_at = excluded.linked_at,
            linked_by_evaluation_id = excluded.linked_by_evaluation_id
        `);
        evaluation.evidence.forEach((item) =>
          linkEvidence.run(
            thesis.id,
            item.claimId,
            item.stance,
            item.rationale,
            reviewedAt,
            evaluation.id,
          ),
        );
        const insertPortfolioDecision = this.database.prepare(`
          INSERT INTO portfolio_decisions (
            evaluation_id, portfolio_item_id, action, rationale, created_at
          ) VALUES (?, ?, ?, ?, ?)
        `);
        portfolioDecisions.forEach((decision) => {
          insertPortfolioDecision.run(
            evaluation.id,
            decision.portfolioItemId,
            decision.action,
            decision.rationale,
            reviewedAt,
          );
        });
      }
      this.database
        .prepare(`
          UPDATE thesis_evaluations
          SET review_status = ?, review_note = ?, reviewed_at = ?,
              accepted_version_id = ?, next_review_on = ?
          WHERE id = ?
        `)
        .run(
          input.decision,
          reviewNote,
          reviewedAt,
          acceptedVersionId,
          nextReviewOn,
          evaluation.id,
        );
    });

    const reviewed = this.getThesisEvaluation(id);
    if (!reviewed) {
      throw new Error(`Failed to reload thesis evaluation ${id}`);
    }
    return reviewed;
  }

  listSources(): ResearchSource[] {
    return rows(
      this.database
        .prepare(
          "SELECT * FROM research_sources WHERE archived = 0 ORDER BY name",
        )
        .all(),
    ).map((sourceRow) => this.mapSource(sourceRow));
  }

  getSource(id: string): ResearchSource | null {
    const sourceRow = row(
      this.database
        .prepare(
          "SELECT * FROM research_sources WHERE id = ? AND archived = 0",
        )
        .get(id),
    );
    return sourceRow ? this.mapSource(sourceRow) : null;
  }

  addSource(input: ResearchSourceInput): ResearchSource {
    const id = `source-${randomUUID()}`;
    const url = canonicalizeUrl(input.url);
    const domain = normalizedDomain(new URL(url).hostname);
    this.database
      .prepare(`
        INSERT INTO research_sources (
          id, name, type, url, enabled, status, last_synced_at,
          document_count, archived, user_added, layer_ids_json,
          company_tickers_json, domain, role, authority_tier, thesis_ids_json
        ) VALUES (
          ?, ?, ?, ?, ?, 'ready', NULL, 0, 0, 1, ?, ?,
          ?, 'primary', 'unknown', '[]'
        )
      `)
      .run(
        id,
        input.name,
        input.type,
        url,
        input.enabled === false ? 0 : 1,
        JSON.stringify(input.layerIds ?? []),
        JSON.stringify(
          (input.companyTickers ?? []).map((ticker) => ticker.toUpperCase()),
        ),
        domain,
      );
    const source = this.getSource(id);
    if (!source) {
      throw new Error(`Failed to reload source ${id}`);
    }
    return source;
  }

  addSourceProfile(input: SourceProfileInput): ResearchSource {
    const id = `source-profile-${randomUUID()}`;
    const url = canonicalizeUrl(input.publicUrl);
    const domain = normalizedDomain(input.domain);
    const publicUrlDomain = normalizedDomain(new URL(url).hostname);
    if (!domainMatches(publicUrlDomain, domain)) {
      throw new RangeError(
        "The public URL must use the registered source domain.",
      );
    }
    const companyTickers = uniqueStrings(
      (input.companyTickers ?? []).map((ticker) => ticker.toUpperCase()),
    );
    companyTickers.forEach((ticker) => {
      if (!this.getCompany(ticker)) {
        throw new RangeError(`Unknown company ticker: ${ticker}`);
      }
    });
    const thesisIds = uniqueStrings(input.thesisIds ?? []);
    thesisIds.forEach((thesisId) => {
      const thesis = this.getThesis(thesisId);
      if (!thesis || thesis.kind !== "macro") {
        throw new RangeError(`Unknown macro thesis: ${thesisId}`);
      }
    });
    this.database
      .prepare(`
        INSERT INTO research_sources (
          id, name, type, url, enabled, status, last_synced_at,
          document_count, archived, user_added, layer_ids_json,
          company_tickers_json, domain, role, authority_tier, thesis_ids_json
        ) VALUES (
          ?, ?, 'manual', ?, 0, 'ready', NULL, 0, 0, 1, ?, ?, ?, ?, ?, ?
        )
      `)
      .run(
        id,
        input.name,
        url,
        JSON.stringify(input.layerIds ?? []),
        JSON.stringify(companyTickers),
        domain,
        input.role,
        input.authorityTier,
        JSON.stringify(thesisIds),
      );
    const source = this.getSource(id);
    if (!source) {
      throw new Error(`Failed to reload source profile ${id}`);
    }
    return source;
  }

  findSourceProfileForUrl(sourceUrl: string): ResearchSource | null {
    let hostname: string;
    try {
      hostname = normalizedDomain(new URL(sourceUrl).hostname);
    } catch {
      return null;
    }
    return (
      this.listSources()
        .filter((source) => source.domain)
        .filter((source) => domainMatches(hostname, source.domain ?? ""))
        .toSorted(
          (left, right) =>
            (right.domain?.length ?? 0) - (left.domain?.length ?? 0),
        )[0] ?? null
    );
  }

  getSourceProfile(
    id: string,
    sourceUrl?: string,
  ): ResearchSource {
    const source = this.getSource(id);
    if (
      !source ||
      !source.domain ||
      ["rss", "paper", "release"].includes(source.type) ||
      source.id === "manual-imports"
    ) {
      throw new RangeError(`Unknown trusted source profile: ${id}`);
    }
    if (sourceUrl) {
      const hostname = normalizedDomain(new URL(sourceUrl).hostname);
      if (!domainMatches(hostname, source.domain)) {
        throw new RangeError(
          "The signal URL does not match the selected source profile.",
        );
      }
    }
    return source;
  }

  archiveSource(id: string): boolean {
    const result = this.database
      .prepare(`
        UPDATE research_sources
        SET archived = 1, enabled = 0
        WHERE id = ? AND archived = 0
      `)
      .run(id);
    return result.changes > 0;
  }

  private mapSource(sourceRow: SqlRow): ResearchSource {
    return {
      id: text(sourceRow, "id"),
      name: text(sourceRow, "name"),
      type: text(sourceRow, "type") as ResearchSource["type"],
      url: nullableText(sourceRow, "url"),
      domain:
        nullableText(sourceRow, "domain") ??
        domainFromUrl(nullableText(sourceRow, "url")),
      role: text(sourceRow, "role") as ResearchSource["role"],
      authorityTier: text(
        sourceRow,
        "authority_tier",
      ) as ResearchSource["authorityTier"],
      enabled: sourceRow.enabled === 1,
      userAdded: sourceRow.user_added === 1,
      layerIds: parseJson<ResearchSource["layerIds"]>(
        sourceRow.layer_ids_json,
        [],
      ),
      companyTickers: parseJson<string[]>(
        sourceRow.company_tickers_json,
        [],
      ),
      thesisIds: parseJson<string[]>(sourceRow.thesis_ids_json, []),
      status: text(sourceRow, "status") as ResearchSource["status"],
      lastSyncedAt: nullableText(sourceRow, "last_synced_at"),
      documentCount:
        typeof sourceRow.document_count === "number"
          ? sourceRow.document_count
          : 0,
    };
  }

  listUpdates(limit = 50): IntelligenceUpdate[] {
    const updateRows = rows(
      this.database
        .prepare(`
          SELECT id FROM intelligence_updates
          ORDER BY published_at DESC, ingested_at DESC
          LIMIT ?
        `)
        .all(limit),
    );
    return updateRows
      .map((updateRow) => this.getUpdate(text(updateRow, "id")))
      .filter((update): update is IntelligenceUpdate => update !== null);
  }

  listAllUpdates(): IntelligenceUpdate[] {
    const updateRows = rows(
      this.database
        .prepare(`
          SELECT id FROM intelligence_updates
          ORDER BY ingested_at ASC, published_at ASC
        `)
        .all(),
    );
    return updateRows
      .map((updateRow) => this.getUpdate(text(updateRow, "id")))
      .filter((update): update is IntelligenceUpdate => update !== null);
  }

  listUpdatesIngestedAfter(ingestedAt: string): IntelligenceUpdate[] {
    const updateRows = rows(
      this.database
        .prepare(`
          SELECT id FROM intelligence_updates
          WHERE ingested_at > ?
          ORDER BY ingested_at ASC, published_at ASC
        `)
        .all(ingestedAt),
    );
    return updateRows
      .map((updateRow) => this.getUpdate(text(updateRow, "id")))
      .filter((update): update is IntelligenceUpdate => update !== null);
  }

  getUpdate(id: string): IntelligenceUpdate | null {
    const updateRow = row(
      this.database
        .prepare("SELECT * FROM intelligence_updates WHERE id = ?")
        .get(id),
    );
    if (!updateRow) {
      return null;
    }

    const layerRows = rows(
      this.database
        .prepare("SELECT layer_id FROM update_layers WHERE update_id = ? ORDER BY layer_id")
        .all(id),
    );
    const companyRows = rows(
      this.database
        .prepare("SELECT company_ticker FROM update_companies WHERE update_id = ? ORDER BY company_ticker")
        .all(id),
    );
    const claimRows = rows(
      this.database
        .prepare("SELECT * FROM evidence_claims WHERE update_id = ? ORDER BY rowid")
        .all(id),
    );
    const impactRows = rows(
      this.database
        .prepare("SELECT * FROM thesis_impacts WHERE update_id = ? ORDER BY rowid")
        .all(id),
    );
    const macroImpactRows = rows(
      this.database
        .prepare(`
          SELECT *
          FROM update_macro_thesis_impacts
          WHERE update_id = ?
          ORDER BY
            CASE relevance
              WHEN 'primary' THEN 1
              WHEN 'secondary' THEN 2
              ELSE 3
            END,
            rowid
        `)
        .all(id),
    );
    const reviewStatement = this.database.prepare(
      "SELECT * FROM impact_reviews WHERE impact_id = ?",
    );
    const storyClusterId = nullableText(updateRow, "story_cluster_id");
    const lineageRows = storyClusterId
      ? rows(
          this.database
            .prepare(`
              SELECT id, publisher, story_match_score, story_match_reason
              FROM intelligence_updates
              WHERE story_cluster_id = ?
              ORDER BY published_at ASC, id ASC
            `)
            .all(storyClusterId),
        )
      : [];
    const sourceLineage =
      storyClusterId && lineageRows.length > 1
        ? {
            evidenceChainId: storyClusterId,
            reportCount: lineageRows.length,
            publishers: [
              ...new Set(
                lineageRows.map((lineageRow) =>
                  text(lineageRow, "publisher"),
                ),
              ),
            ],
            updateIds: lineageRows.map((lineageRow) =>
              text(lineageRow, "id"),
            ),
            matchScore:
              typeof updateRow.story_match_score === "number"
                ? updateRow.story_match_score
                : null,
            matchReason: nullableText(updateRow, "story_match_reason"),
          }
        : null;

    return {
      id: text(updateRow, "id"),
      title: text(updateRow, "title"),
      publisher: text(updateRow, "publisher"),
      sourceUrl: nullableText(updateRow, "source_url"),
      publishedAt: text(updateRow, "published_at"),
      ingestedAt: text(updateRow, "ingested_at"),
      layerIds: layerRows.map(
        (layerRow) =>
          text(layerRow, "layer_id") as IntelligenceUpdate["layerIds"][number],
      ),
      companyTickers: companyRows.map((companyRow) =>
        text(companyRow, "company_ticker"),
      ),
      materiality: text(
        updateRow,
        "materiality",
      ) as IntelligenceUpdate["materiality"],
      materialityReason: text(updateRow, "materiality_reason"),
      novelty: text(
        updateRow,
        "novelty",
      ) as IntelligenceUpdate["novelty"],
      sentiment: text(updateRow, "sentiment") as IntelligenceUpdate["sentiment"],
      whatHappened: text(updateRow, "what_happened"),
      whyItMatters: text(updateRow, "why_it_matters"),
      beneficiaries: parseJson<string[]>(updateRow.beneficiaries_json, []),
      threatened: parseJson<string[]>(updateRow.threatened_json, []),
      watchNext: parseJson<string[]>(updateRow.watch_next_json, []),
      claims: claimRows.map((claimRow) => ({
        id: text(claimRow, "id"),
        quote: text(claimRow, "quote"),
        sourceId: text(claimRow, "source_id"),
        locator: text(claimRow, "locator"),
      })),
      thesisImpacts: impactRows.map((impactRow) => {
        const impactId = text(impactRow, "id");
        const reviewRow = row(reviewStatement.get(impactId));
        return {
          id: impactId,
          companyTicker: text(impactRow, "company_ticker"),
          direction: text(
            impactRow,
            "direction",
          ) as IntelligenceUpdate["thesisImpacts"][number]["direction"],
          summary: text(impactRow, "summary"),
          confidence: text(
            impactRow,
            "confidence",
          ) as IntelligenceUpdate["thesisImpacts"][number]["confidence"],
          horizon: text(impactRow, "horizon"),
          thesisDelta: text(impactRow, "thesis_delta"),
          decision: text(
            impactRow,
            "decision",
          ) as IntelligenceUpdate["thesisImpacts"][number]["decision"],
          review: reviewRow ? mapImpactReview(reviewRow) : null,
        };
      }),
      macroThesisImpacts: macroImpactRows.map((impactRow) => ({
        id: text(impactRow, "id"),
        thesisId: text(impactRow, "thesis_id"),
        relevance: text(
          impactRow,
          "relevance",
        ) as NonNullable<
          IntelligenceUpdate["macroThesisImpacts"]
        >[number]["relevance"],
        stance: text(
          impactRow,
          "stance",
        ) as NonNullable<
          IntelligenceUpdate["macroThesisImpacts"]
        >[number]["stance"],
        rationale: text(impactRow, "rationale"),
        claimIds: parseJson<string[]>(impactRow.claim_ids_json, []),
      })),
      model: nullableText(updateRow, "model"),
      ...(sourceLineage ? { sourceLineage } : {}),
    };
  }

  getEvidenceChainIdForUpdate(updateId: string): string | null {
    const updateRow = row(
      this.database
        .prepare(`
          SELECT story_cluster_id
          FROM intelligence_updates
          WHERE id = ?
        `)
        .get(updateId),
    );
    return updateRow
      ? nullableText(updateRow, "story_cluster_id")
      : null;
  }

  deleteUpdate(id: string): boolean {
    if (!this.getUpdate(id)) {
      return false;
    }
    const acceptedEvaluation = row(
      this.database
        .prepare(`
          SELECT evaluation.id
          FROM thesis_evaluations AS evaluation
          INNER JOIN thesis_evaluation_updates AS link
            ON link.evaluation_id = evaluation.id
          WHERE link.update_id = ?
            AND evaluation.review_status = 'accepted'
          LIMIT 1
        `)
        .get(id),
    );
    if (acceptedEvaluation) {
      throw new TypeError(
        "This signal supports an accepted thesis change and cannot be deleted.",
      );
    }

    this.withTransaction(() => {
      this.database
        .prepare(`
          DELETE FROM daily_briefs
          WHERE id IN (
            SELECT brief_id
            FROM brief_updates
            WHERE update_id = ?
            UNION
            SELECT brief_claims.brief_id
            FROM brief_claims
            INNER JOIN evidence_claims
              ON evidence_claims.id = brief_claims.claim_id
            WHERE evidence_claims.update_id = ?
            UNION
            SELECT brief_link.brief_id
            FROM brief_thesis_evaluations AS brief_link
            INNER JOIN thesis_evaluation_updates AS evaluation_link
              ON evaluation_link.evaluation_id = brief_link.evaluation_id
            WHERE evaluation_link.update_id = ?
          )
        `)
        .run(id, id, id);
      this.database
        .prepare(`
          DELETE FROM thesis_evaluations
          WHERE id IN (
            SELECT evaluation.id
            FROM thesis_evaluations AS evaluation
            INNER JOIN thesis_evaluation_updates AS link
              ON link.evaluation_id = evaluation.id
            WHERE link.update_id = ?
              AND evaluation.review_status <> 'accepted'
          )
        `)
        .run(id);
      this.database
        .prepare("DELETE FROM impact_reviews WHERE update_id = ?")
        .run(id);
      this.database
        .prepare(`
          UPDATE source_documents
          SET update_id = NULL, suppressed_at = ?,
              error_message = NULL
          WHERE update_id = ?
        `)
        .run(new Date().toISOString(), id);
      this.database
        .prepare("DELETE FROM intelligence_updates WHERE id = ?")
        .run(id);
    });
    return true;
  }

  persistAnalyzedUpdate(update: IntelligenceUpdate): IntelligenceUpdate {
    assertSignalInvariants(update);
    const storyLineage = this.resolveStoryLineage(update);
    const insertUpdate = this.database.prepare(`
      INSERT INTO intelligence_updates (
        id, title, publisher, source_url, published_at, ingested_at, materiality,
        materiality_reason, novelty, sentiment, what_happened, why_it_matters,
        beneficiaries_json, threatened_json, watch_next_json, model,
        story_cluster_id, story_match_score, story_match_reason,
        story_entity_tickers_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        publisher = excluded.publisher,
        source_url = excluded.source_url,
        published_at = excluded.published_at,
        ingested_at = excluded.ingested_at,
        materiality = excluded.materiality,
        materiality_reason = excluded.materiality_reason,
        novelty = excluded.novelty,
        sentiment = excluded.sentiment,
        what_happened = excluded.what_happened,
        why_it_matters = excluded.why_it_matters,
        beneficiaries_json = excluded.beneficiaries_json,
        threatened_json = excluded.threatened_json,
        watch_next_json = excluded.watch_next_json,
        model = excluded.model,
        story_cluster_id = excluded.story_cluster_id,
        story_match_score = excluded.story_match_score,
        story_match_reason = excluded.story_match_reason,
        story_entity_tickers_json = excluded.story_entity_tickers_json
    `);
    const insertLayer = this.database.prepare(
      "INSERT INTO update_layers (update_id, layer_id) VALUES (?, ?)",
    );
    const insertCompany = this.database.prepare(
      "INSERT INTO update_companies (update_id, company_ticker) VALUES (?, ?)",
    );
    const insertClaim = this.database.prepare(`
      INSERT INTO evidence_claims (id, update_id, quote, source_id, locator)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        update_id = excluded.update_id,
        quote = excluded.quote,
        source_id = excluded.source_id,
        locator = excluded.locator
    `);
    const insertImpact = this.database.prepare(`
      INSERT INTO thesis_impacts (
        id, update_id, company_ticker, direction, summary, confidence, horizon, decision
        , thesis_delta
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        update_id = excluded.update_id,
        company_ticker = excluded.company_ticker,
        direction = excluded.direction,
        summary = excluded.summary,
        confidence = excluded.confidence,
        horizon = excluded.horizon,
        thesis_delta = excluded.thesis_delta,
        decision = CASE
          WHEN thesis_impacts.decision = 'proposed' THEN excluded.decision
          ELSE thesis_impacts.decision
        END
    `);
    const insertMacroImpact = this.database.prepare(`
      INSERT INTO update_macro_thesis_impacts (
        id, update_id, thesis_id, relevance, stance, rationale,
        claim_ids_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(update_id, thesis_id) DO UPDATE SET
        id = excluded.id,
        relevance = excluded.relevance,
        stance = excluded.stance,
        rationale = excluded.rationale,
        claim_ids_json = excluded.claim_ids_json
    `);
    const knownLayer = this.database.prepare("SELECT 1 FROM stack_layers WHERE id = ?");
    const knownCompany = this.database.prepare("SELECT 1 FROM companies WHERE ticker = ?");

    this.withTransaction(() => {
      insertUpdate.run(
        update.id,
        update.title,
        update.publisher,
        update.sourceUrl,
        update.publishedAt,
        update.ingestedAt,
        update.materiality,
        update.materialityReason,
        update.novelty,
        update.sentiment,
        update.whatHappened,
        update.whyItMatters,
        JSON.stringify(update.beneficiaries),
        JSON.stringify(update.threatened),
        JSON.stringify(update.watchNext),
        update.model,
        storyLineage.evidenceChainId,
        storyLineage.matchScore,
        storyLineage.matchReason,
        JSON.stringify(storyLineage.entityTickers),
      );
      this.database
        .prepare("DELETE FROM update_layers WHERE update_id = ?")
        .run(update.id);
      this.database
        .prepare("DELETE FROM update_companies WHERE update_id = ?")
        .run(update.id);
      const nextClaimIds = new Set(update.claims.map((claim) => claim.id));
      rows(
        this.database
          .prepare("SELECT id FROM evidence_claims WHERE update_id = ?")
          .all(update.id),
      ).forEach((claimRow) => {
        const claimId = text(claimRow, "id");
        if (!nextClaimIds.has(claimId)) {
          this.database
            .prepare("DELETE FROM evidence_claims WHERE id = ?")
            .run(claimId);
        }
      });
      const nextImpactIds = new Set(
        update.thesisImpacts.map((impact) => impact.id),
      );
      rows(
        this.database
          .prepare("SELECT id FROM thesis_impacts WHERE update_id = ?")
          .all(update.id),
      ).forEach((impactRow) => {
        const impactId = text(impactRow, "id");
        if (!nextImpactIds.has(impactId)) {
          this.database
            .prepare("DELETE FROM thesis_impacts WHERE id = ?")
            .run(impactId);
        }
      });
      const nextMacroImpactIds = new Set(
        (update.macroThesisImpacts ?? []).map((impact) => impact.id),
      );
      rows(
        this.database
          .prepare(`
            SELECT id
            FROM update_macro_thesis_impacts
            WHERE update_id = ?
          `)
          .all(update.id),
      ).forEach((impactRow) => {
        const impactId = text(impactRow, "id");
        if (!nextMacroImpactIds.has(impactId)) {
          this.database
            .prepare(
              "DELETE FROM update_macro_thesis_impacts WHERE id = ?",
            )
            .run(impactId);
        }
      });

      update.layerIds.forEach((layerId) => {
        if (knownLayer.get(layerId)) {
          insertLayer.run(update.id, layerId);
        }
      });
      update.companyTickers.forEach((ticker) => {
        const normalizedTicker = ticker.toUpperCase();
        if (knownCompany.get(normalizedTicker)) {
          insertCompany.run(update.id, normalizedTicker);
        }
      });
      update.claims.forEach((claim) => {
        insertClaim.run(
          claim.id,
          update.id,
          claim.quote,
          claim.sourceId,
          claim.locator,
        );
      });
      (update.macroThesisImpacts ?? []).forEach((impact) => {
        insertMacroImpact.run(
          impact.id,
          update.id,
          impact.thesisId,
          impact.relevance,
          impact.stance,
          impact.rationale,
          JSON.stringify(impact.claimIds),
        );
      });
      update.thesisImpacts.forEach((impact) => {
        const normalizedTicker = impact.companyTicker.toUpperCase();
        if (knownCompany.get(normalizedTicker)) {
          insertImpact.run(
            impact.id,
            update.id,
            normalizedTicker,
            impact.direction,
            impact.summary,
            impact.confidence,
            impact.horizon,
            impact.decision,
            impact.thesisDelta,
          );
        }
      });
    });

    const persisted = this.getUpdate(update.id);
    if (!persisted) {
      throw new Error(`Failed to reload update ${update.id}`);
    }
    return persisted;
  }

  private resolveStoryLineage(update: IntelligenceUpdate): {
    evidenceChainId: string;
    matchScore: number | null;
    matchReason: string | null;
    entityTickers: string[];
  } {
    const existingRow = row(
      this.database
        .prepare(`
          SELECT story_cluster_id, story_match_score, story_match_reason,
                 story_entity_tickers_json
          FROM intelligence_updates
          WHERE id = ?
        `)
        .get(update.id),
    );
    if (existingRow) {
      return {
        evidenceChainId:
          nullableText(existingRow, "story_cluster_id") ??
          `story-legacy-${update.id}`,
        matchScore:
          typeof existingRow.story_match_score === "number"
            ? existingRow.story_match_score
            : null,
        matchReason: nullableText(existingRow, "story_match_reason"),
        entityTickers: parseJson<string[]>(
          existingRow.story_entity_tickers_json,
          update.companyTickers,
        ),
      };
    }

    const entityTickers = [
      ...new Set(
        update.companyTickers
          .map((ticker) => ticker.trim().toUpperCase())
          .filter(Boolean),
      ),
    ].sort();
    const candidateRows = rows(
      this.database
        .prepare(`
          SELECT id, title, published_at, story_cluster_id,
                 story_entity_tickers_json
          FROM intelligence_updates
          WHERE id <> ?
        `)
        .all(update.id),
    );
    const candidates: StoryCandidate[] = candidateRows.map(
      (candidateRow) => ({
        id: text(candidateRow, "id"),
        title: text(candidateRow, "title"),
        publishedAt: text(candidateRow, "published_at"),
        companyTickers: parseJson<string[]>(
          candidateRow.story_entity_tickers_json,
          [],
        ),
      }),
    );
    const currentCandidate: StoryCandidate = {
      id: update.id,
      title: update.title,
      publishedAt: update.publishedAt,
      companyTickers: entityTickers,
    };
    const cluster = clusterStories([...candidates, currentCandidate]).find(
      (candidateCluster) =>
        candidateCluster.members.some((member) => member.id === update.id),
    );
    if (!cluster) {
      throw new Error(`Failed to assign story lineage for ${update.id}`);
    }

    const existingMembers = cluster.members
      .filter((member) => member.id !== update.id)
      .map((member) => ({
        member,
        row: candidateRows.find(
          (candidateRow) => text(candidateRow, "id") === member.id,
        ),
      }))
      .filter(
        (
          result,
        ): result is {
          member: (typeof cluster.members)[number];
          row: SqlRow;
        } => Boolean(result.row),
      );
    const persistedEvidenceChainId = existingMembers
      .map(({ row: memberRow }) =>
        nullableText(memberRow, "story_cluster_id"),
      )
      .find((value): value is string => Boolean(value));
    const comparison =
      cluster.members.find((member) => member.id === update.id)
        ?.comparisonToAnchor ??
      existingMembers
        .map(({ member }) => member.comparisonToAnchor)
        .filter(
          (
            result,
          ): result is NonNullable<typeof result> => result !== null,
        )
        .sort((left, right) => right.score - left.score)[0] ??
      null;

    return {
      evidenceChainId: persistedEvidenceChainId ?? cluster.key,
      matchScore: persistedEvidenceChainId ? comparison?.score ?? null : null,
      matchReason:
        persistedEvidenceChainId && comparison
          ? comparison.reasons
              .filter((reason) => reason.passed)
              .map((reason) => reason.detail)
              .join(" ")
          : null,
      entityTickers,
    };
  }

  getBrief(id: string): DailyBrief | null {
    const briefRow = row(
      this.database.prepare("SELECT * FROM daily_briefs WHERE id = ?").get(id),
    );
    if (!briefRow) {
      return null;
    }

    const updateRows = rows(
      this.database
        .prepare("SELECT update_id FROM brief_updates WHERE brief_id = ? ORDER BY sort_order")
        .all(id),
    );
    const claimRows = rows(
      this.database
        .prepare("SELECT claim_id FROM brief_claims WHERE brief_id = ? ORDER BY claim_id")
        .all(id),
    );
    const evaluationIds = rows(
      this.database
        .prepare(`
          SELECT evaluation_id
          FROM brief_thesis_evaluations
          WHERE brief_id = ?
          ORDER BY sort_order
        `)
        .all(id),
    ).map((evaluationRow) => text(evaluationRow, "evaluation_id"));

    return {
      id: text(briefRow, "id"),
      date: text(briefRow, "date"),
      title: text(briefRow, "title"),
      summary: text(briefRow, "summary"),
      signal: text(briefRow, "signal"),
      secondarySignals: parseJson<string[]>(
        briefRow.secondary_signals_json,
        [],
      ),
      updateIds: updateRows.map((updateRow) => text(updateRow, "update_id")),
      citationClaimIds: claimRows.map((claimRow) => text(claimRow, "claim_id")),
      ...(evaluationIds.length > 0
        ? { thesisEvaluationIds: evaluationIds }
        : {}),
      generatedAt: text(briefRow, "generated_at"),
      model: nullableText(briefRow, "model"),
    };
  }

  listBriefs(limit = 30): DailyBrief[] {
    const briefRows = rows(
      this.database
        .prepare(`
          SELECT id
          FROM daily_briefs
          ORDER BY date DESC, generated_at DESC
          LIMIT ?
        `)
        .all(limit),
    );
    return briefRows
      .map((briefRow) => this.getBrief(text(briefRow, "id")))
      .filter((brief): brief is DailyBrief => brief !== null);
  }

  persistDailyBrief(brief: DailyBrief): DailyBrief {
    const insertBrief = this.database.prepare(`
      INSERT INTO daily_briefs (
        id, date, title, summary, signal, secondary_signals_json, generated_at, model
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        date = excluded.date,
        title = excluded.title,
        summary = excluded.summary,
        signal = excluded.signal,
        secondary_signals_json = excluded.secondary_signals_json,
        generated_at = excluded.generated_at,
        model = excluded.model
    `);
    const insertUpdate = this.database.prepare(`
      INSERT INTO brief_updates (brief_id, update_id, sort_order) VALUES (?, ?, ?)
    `);
    const insertClaim = this.database.prepare(`
      INSERT INTO brief_claims (brief_id, claim_id) VALUES (?, ?)
    `);
    const insertEvaluation = this.database.prepare(`
      INSERT INTO brief_thesis_evaluations (
        brief_id, evaluation_id, sort_order
      ) VALUES (?, ?, ?)
    `);
    const knownUpdate = this.database.prepare(
      "SELECT 1 FROM intelligence_updates WHERE id = ?",
    );
    const knownClaim = this.database.prepare(
      "SELECT 1 FROM evidence_claims WHERE id = ?",
    );
    const knownEvaluation = this.database.prepare(
      "SELECT 1 FROM thesis_evaluations WHERE id = ?",
    );

    this.withTransaction(() => {
      this.database
        .prepare("DELETE FROM daily_briefs WHERE date = ? AND id <> ?")
        .run(brief.date, brief.id);
      insertBrief.run(
        brief.id,
        brief.date,
        brief.title,
        brief.summary,
        brief.signal,
        JSON.stringify(brief.secondarySignals),
        brief.generatedAt,
        brief.model,
      );
      this.database
        .prepare("DELETE FROM brief_updates WHERE brief_id = ?")
        .run(brief.id);
      this.database
        .prepare("DELETE FROM brief_claims WHERE brief_id = ?")
        .run(brief.id);
      this.database
        .prepare("DELETE FROM brief_thesis_evaluations WHERE brief_id = ?")
        .run(brief.id);
      brief.updateIds.forEach((updateId, index) => {
        if (knownUpdate.get(updateId)) {
          insertUpdate.run(brief.id, updateId, index);
        }
      });
      brief.citationClaimIds.forEach((claimId) => {
        if (knownClaim.get(claimId)) {
          insertClaim.run(brief.id, claimId);
        }
      });
      (brief.thesisEvaluationIds ?? []).forEach((evaluationId, index) => {
        if (knownEvaluation.get(evaluationId)) {
          insertEvaluation.run(brief.id, evaluationId, index);
        }
      });
    });

    const persisted = this.getBrief(brief.id);
    if (!persisted) {
      throw new Error(`Failed to reload brief ${brief.id}`);
    }
    return persisted;
  }

  persistSourceDocument(input: SourceDocumentInput): SourceDocumentRecord {
    const sourceUrl = input.sourceUrl
      ? canonicalizeUrl(input.sourceUrl)
      : null;
    const contentHash = sourceDocumentContentHash(input.content, sourceUrl);
    const existing = row(
      this.database
        .prepare(`
          SELECT id, analysis_status, update_id, ingested_at, suppressed_at
          FROM source_documents WHERE content_hash = ?
        `)
        .get(contentHash),
    );
    if (existing) {
      return {
        id: text(existing, "id"),
        status: existing.suppressed_at
          ? "suppressed"
          : text(
              existing,
              "analysis_status",
            ) as SourceDocumentRecord["status"],
        updateId: nullableText(existing, "update_id"),
        ingestedAt: text(existing, "ingested_at"),
        duplicate: true,
      };
    }

    const id = `document-${randomUUID()}`;
    const ingestedAt = new Date().toISOString();
    this.withTransaction(() => {
      this.database
        .prepare(`
          INSERT INTO source_documents (
            id, title, publisher, source_url, published_at, content, content_hash,
            analysis_status, ingested_at, source_kind, filename,
            research_source_id, analysis_version
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, 'thesis-aware-v1')
        `)
        .run(
          id,
          input.title,
          input.publisher,
          sourceUrl,
          input.publishedAt ?? ingestedAt,
          input.content,
          contentHash,
          ingestedAt,
          input.sourceKind ?? "other",
          input.filename ?? null,
          input.researchSourceId ?? "manual-imports",
        );
      this.database
        .prepare(`
          UPDATE research_sources
          SET document_count = document_count + 1, last_synced_at = ?
          WHERE id = ?
        `)
        .run(ingestedAt, input.researchSourceId ?? "manual-imports");
    });
    return { id, status: "pending", updateId: null, ingestedAt, duplicate: false };
  }

  markSourceDocumentAnalyzed(documentId: string, updateId: string): void {
    this.database
      .prepare(`
        UPDATE source_documents
        SET analysis_status = 'analyzed', update_id = ?, error_message = NULL
        WHERE id = ? AND suppressed_at IS NULL
      `)
      .run(updateId, documentId);
  }

  recordSourceDocumentRetryAttempt(documentId: string): void {
    const attemptedAt = new Date().toISOString();
    this.database
      .prepare(`
        UPDATE source_documents
        SET attempt_count = attempt_count + 1,
            last_attempted_at = ?
        WHERE id = ?
          AND analysis_status = 'error'
          AND suppressed_at IS NULL
      `)
      .run(attemptedAt, documentId);
  }

  markSourceDocumentError(
    documentId: string,
    message: string,
    options: { recordAttempt?: boolean } = {},
  ): void {
    const attemptedAt = new Date().toISOString();
    const recordAttempt = options.recordAttempt !== false;
    this.database
      .prepare(`
        UPDATE source_documents
        SET analysis_status = 'error',
            error_message = ?,
            attempt_count = attempt_count + ?,
            last_attempted_at = CASE
              WHEN ? = 1 THEN ?
              ELSE last_attempted_at
            END
        WHERE id = ? AND suppressed_at IS NULL
      `)
      .run(
        sanitizeStoredError(message),
        recordAttempt ? 1 : 0,
        recordAttempt ? 1 : 0,
        attemptedAt,
        documentId,
      );
  }

  listFailedSourceDocuments(): FailedSourceDocument[] {
    return rows(
      this.database
        .prepare(`
          SELECT id, title, publisher, source_url, published_at, source_kind,
                 error_message, attempt_count, last_attempted_at, ingested_at
          FROM source_documents
          WHERE analysis_status = 'error'
            AND suppressed_at IS NULL
          ORDER BY COALESCE(last_attempted_at, ingested_at) DESC, id
        `)
        .all(),
    ).map((documentRow) => ({
      id: text(documentRow, "id"),
      title: text(documentRow, "title"),
      publisher: text(documentRow, "publisher"),
      sourceUrl: nullableText(documentRow, "source_url"),
      publishedAt: text(documentRow, "published_at"),
      sourceKind: text(documentRow, "source_kind") as SourceKind,
      errorMessage: text(documentRow, "error_message"),
      attemptCount: numeric(documentRow, "attempt_count"),
      lastAttemptedAt: nullableText(documentRow, "last_attempted_at"),
      ingestedAt: text(documentRow, "ingested_at"),
    }));
  }

  getSourceDocumentForRecovery(
    documentId: string,
  ): SourceDocumentRecoveryRecord | null {
    const documentRow = row(
      this.database
        .prepare(`
          SELECT id, title, publisher, source_url, published_at, content,
                 source_kind, research_source_id, analysis_status, update_id,
                 ingested_at, error_message, attempt_count, last_attempted_at,
                 suppressed_at
          FROM source_documents
          WHERE id = ?
        `)
        .get(documentId),
    );
    if (!documentRow) {
      return null;
    }
    return {
      id: text(documentRow, "id"),
      title: text(documentRow, "title"),
      publisher: text(documentRow, "publisher"),
      sourceUrl: nullableText(documentRow, "source_url"),
      publishedAt: text(documentRow, "published_at"),
      content: text(documentRow, "content"),
      sourceKind: text(documentRow, "source_kind") as SourceKind,
      researchSourceId: nullableText(documentRow, "research_source_id"),
      status: documentRow.suppressed_at
        ? "suppressed"
        : (text(
            documentRow,
            "analysis_status",
          ) as SourceDocumentRecoveryRecord["status"]),
      updateId: nullableText(documentRow, "update_id"),
      ingestedAt: text(documentRow, "ingested_at"),
      errorMessage: nullableText(documentRow, "error_message"),
      attemptCount: numeric(documentRow, "attempt_count"),
      lastAttemptedAt: nullableText(documentRow, "last_attempted_at"),
    };
  }

  updateSourceDocumentForRecovery(
    documentId: string,
    input: SourceDocumentRecoveryUpdate,
  ): SourceDocumentRecoveryRecord {
    const document = this.getSourceDocumentForRecovery(documentId);
    if (!document) {
      throw new RangeError(`Source document not found: ${documentId}`);
    }
    if (document.status !== "error") {
      throw new TypeError(
        `Only failed source documents can be recovered: ${documentId}`,
      );
    }

    const suppliedUrl = input.sourceUrl
      ? canonicalizeUrl(input.sourceUrl)
      : null;
    if (
      document.sourceUrl &&
      suppliedUrl &&
      document.sourceUrl !== suppliedUrl
    ) {
      throw new TypeError(
        "The recovery URL must match the original source URL.",
      );
    }
    const sourceUrl = document.sourceUrl ?? suppliedUrl;
    const content = input.content ?? document.content;
    const contentHash = sourceDocumentContentHash(content, sourceUrl);
    const collision = row(
      this.database
        .prepare(`
          SELECT id
          FROM source_documents
          WHERE content_hash = ? AND id <> ?
          LIMIT 1
        `)
        .get(contentHash, documentId),
    );
    if (collision) {
      throw new RangeError(
        `Recovery content duplicates source document ${text(collision, "id")}.`,
      );
    }

    this.database
      .prepare(`
        UPDATE source_documents
        SET title = ?,
            publisher = ?,
            source_url = ?,
            published_at = ?,
            content = ?,
            content_hash = ?,
            source_kind = ?
        WHERE id = ?
          AND analysis_status = 'error'
          AND suppressed_at IS NULL
      `)
      .run(
        input.title ?? document.title,
        input.publisher ?? document.publisher,
        sourceUrl,
        input.publishedAt ?? document.publishedAt,
        content,
        contentHash,
        input.sourceKind ?? document.sourceKind,
        documentId,
      );

    const updated = this.getSourceDocumentForRecovery(documentId);
    if (!updated) {
      throw new Error(`Failed to reload source document ${documentId}.`);
    }
    return updated;
  }

  getResearchSourceIdForUpdate(updateId: string): string | null {
    const sourceRow = row(
      this.database
        .prepare(`
          SELECT research_source_id
          FROM source_documents
          WHERE update_id = ?
          ORDER BY ingested_at DESC
          LIMIT 1
        `)
        .get(updateId),
    );
    return sourceRow
      ? nullableText(sourceRow, "research_source_id")
      : null;
  }

  recordSourceSync(
    sourceId: string,
    status: ResearchSource["status"],
  ): void {
    this.database
      .prepare(`
        UPDATE research_sources
        SET status = ?, last_synced_at = ?
        WHERE id = ?
      `)
      .run(status, new Date().toISOString(), sourceId);
  }

  private mapPortfolioItem(itemRow: SqlRow): PortfolioItem {
    const id = text(itemRow, "id");
    const exposureRows = rows(
      this.database
        .prepare(`
          SELECT exposure.*, thesis.title AS thesis_title
          FROM portfolio_thesis_exposures AS exposure
          INNER JOIN theses AS thesis ON thesis.id = exposure.thesis_id
          WHERE exposure.portfolio_item_id = ?
          ORDER BY exposure.sort_order, thesis.title, thesis.id
        `)
        .all(id),
    );
    const decisionRow = row(
      this.database
        .prepare(`
          SELECT decision.*
          FROM portfolio_decisions AS decision
          INNER JOIN thesis_evaluations AS evaluation
            ON evaluation.id = decision.evaluation_id
          WHERE decision.portfolio_item_id = ?
            AND evaluation.review_status = 'accepted'
          ORDER BY evaluation.reviewed_at DESC, decision.created_at DESC,
                   decision.evaluation_id DESC
          LIMIT 1
        `)
        .get(id),
    );
    const allocationBps = itemRow.allocation_bps;
    return {
      id,
      symbol: nullableText(itemRow, "symbol"),
      name: text(itemRow, "name"),
      assetType: text(itemRow, "asset_type") as PortfolioItem["assetType"],
      companyTicker: nullableText(itemRow, "company_ticker"),
      status: text(itemRow, "status") as PortfolioItem["status"],
      allocationBps:
        typeof allocationBps === "number" ? allocationBps : null,
      allocationPercent:
        typeof allocationBps === "number" ? allocationBps / 100 : null,
      thesisExposures: exposureRows.map((exposureRow) =>
        this.mapPortfolioExposure(exposureRow),
      ),
      latestDecision: decisionRow
        ? this.mapPortfolioDecision(decisionRow)
        : null,
      createdAt: text(itemRow, "created_at"),
      updatedAt: text(itemRow, "updated_at"),
    };
  }

  private mapPortfolioExposure(
    exposureRow: SqlRow,
  ): PortfolioThesisExposure {
    return {
      portfolioItemId: text(exposureRow, "portfolio_item_id"),
      thesisId: text(exposureRow, "thesis_id"),
      thesisTitle: text(exposureRow, "thesis_title"),
      exposureType: text(
        exposureRow,
        "exposure_type",
      ) as PortfolioThesisExposure["exposureType"],
      captureMechanism: text(exposureRow, "capture_mechanism"),
      sortOrder: numeric(exposureRow, "sort_order"),
    };
  }

  private mapPortfolioDecision(decisionRow: SqlRow): PortfolioDecision {
    return {
      evaluationId: text(decisionRow, "evaluation_id"),
      portfolioItemId: text(decisionRow, "portfolio_item_id"),
      action: text(
        decisionRow,
        "action",
      ) as PortfolioDecision["action"],
      rationale: text(decisionRow, "rationale"),
      createdAt: text(decisionRow, "created_at"),
    };
  }

  private buildPortfolioOverlaps(
    holdings: PortfolioItem[],
  ): PortfolioOverlap[] {
    const overlaps: PortfolioOverlap[] = [];
    holdings.forEach((left, leftIndex) => {
      holdings.slice(leftIndex + 1).forEach((right) => {
        const rightTheses = new Map(
          right.thesisExposures.map((exposure) => [
            exposure.thesisId,
            exposure.thesisTitle,
          ]),
        );
        const sharedTheses = left.thesisExposures.flatMap((exposure) => {
          const thesisTitle = rightTheses.get(exposure.thesisId);
          return thesisTitle
            ? [{ thesisId: exposure.thesisId, thesisTitle }]
            : [];
        });
        if (sharedTheses.length > 0) {
          overlaps.push({
            leftPortfolioItemId: left.id,
            leftPortfolioItemName: left.name,
            rightPortfolioItemId: right.id,
            rightPortfolioItemName: right.name,
            sharedTheses,
          });
        }
      });
    });
    return overlaps.toSorted(
      (left, right) =>
        right.sharedTheses.length - left.sharedTheses.length ||
        left.leftPortfolioItemName.localeCompare(right.leftPortfolioItemName) ||
        left.rightPortfolioItemName.localeCompare(right.rightPortfolioItemName),
    );
  }

  private mapThesisVersion(versionRow: SqlRow): ThesisVersion {
    return {
      id: text(versionRow, "id"),
      thesisId: text(versionRow, "thesis_id"),
      version: numeric(versionRow, "version"),
      belief: text(versionRow, "belief"),
      confidenceScore: numeric(versionRow, "confidence"),
      unknowns: parseJson<string[]>(versionRow.unknowns_json, []),
      strengtheningConditions: parseJson<string[]>(
        versionRow.strengthening_conditions_json,
        [],
      ),
      weakeningConditions: parseJson<string[]>(
        versionRow.weakening_conditions_json,
        [],
      ),
      createdAt: text(versionRow, "created_at"),
      createdByEvaluationId: nullableText(
        versionRow,
        "created_by_evaluation_id",
      ),
    };
  }

  private mapThesisEvaluation(evaluationRow: SqlRow): ThesisEvaluation {
    const id = text(evaluationRow, "id");
    const signalIds = rows(
      this.database
        .prepare(`
          SELECT update_id
          FROM thesis_evaluation_updates
          WHERE evaluation_id = ?
          ORDER BY update_id
        `)
        .all(id),
    ).map((signalRow) => text(signalRow, "update_id"));
    const evidence = rows(
      this.database
        .prepare(`
          SELECT claim_id, stance, rationale
          FROM thesis_evaluation_evidence
          WHERE evaluation_id = ?
          ORDER BY claim_id
        `)
        .all(id),
    ).map((evidenceRow) => ({
      claimId: text(evidenceRow, "claim_id"),
      stance: text(
        evidenceRow,
        "stance",
      ) as ThesisEvaluation["evidence"][number]["stance"],
      rationale: text(evidenceRow, "rationale"),
    }));
    const previousConfidenceScore = numeric(
      evaluationRow,
      "previous_confidence",
    );
    const proposedConfidenceScore = numeric(
      evaluationRow,
      "proposed_confidence",
    );
    const portfolioDecisions = rows(
      this.database
        .prepare(`
          SELECT *
          FROM portfolio_decisions
          WHERE evaluation_id = ?
          ORDER BY portfolio_item_id
        `)
        .all(id),
    ).map((decisionRow) => this.mapPortfolioDecision(decisionRow));
    return {
      id,
      thesisId: text(evaluationRow, "thesis_id"),
      previousVersionId: text(evaluationRow, "previous_version_id"),
      acceptedVersionId: nullableText(evaluationRow, "accepted_version_id"),
      outcome: text(
        evaluationRow,
        "outcome",
      ) as ThesisEvaluation["outcome"],
      summary: text(evaluationRow, "summary"),
      rationale: text(evaluationRow, "rationale"),
      proposedBelief: text(evaluationRow, "proposed_belief"),
      previousConfidenceScore,
      proposedConfidenceScore,
      confidenceDelta:
        Math.round(
          (proposedConfidenceScore - previousConfidenceScore) * 10,
        ) / 10,
      proposedUnknowns: parseJson<string[]>(
        evaluationRow.proposed_unknowns_json,
        [],
      ),
      proposedStrengtheningConditions: parseJson<string[]>(
        evaluationRow.proposed_strengthening_conditions_json,
        [],
      ),
      proposedWeakeningConditions: parseJson<string[]>(
        evaluationRow.proposed_weakening_conditions_json,
        [],
      ),
      signalIds,
      claimIds: evidence.map((item) => item.claimId),
      evidence,
      reviewRecommendation: nullableText(
        evaluationRow,
        "review_recommendation",
      ) as ThesisEvaluation["reviewRecommendation"],
      reviewRecommendationReason: nullableText(
        evaluationRow,
        "review_recommendation_reason",
      ),
      reviewStatus: text(
        evaluationRow,
        "review_status",
      ) as ThesisEvaluation["reviewStatus"],
      reviewNote: nullableText(evaluationRow, "review_note"),
      nextReviewOn: nullableText(evaluationRow, "next_review_on"),
      portfolioDecisions,
      model: nullableText(evaluationRow, "model"),
      createdAt: text(evaluationRow, "created_at"),
      reviewedAt: nullableText(evaluationRow, "reviewed_at"),
    };
  }

  private mapThesisRoutedSignal(
    signalRow: SqlRow,
  ): ThesisRoutedSignal {
    return {
      updateId: text(signalRow, "update_id"),
      title: text(signalRow, "title"),
      publisher: text(signalRow, "publisher"),
      publishedAt: text(signalRow, "published_at"),
      relevance: nullableText(
        signalRow,
        "relevance",
      ) as ThesisRoutedSignal["relevance"],
      materiality: nullableText(
        signalRow,
        "materiality",
      ) as ThesisRoutedSignal["materiality"],
      rationale: text(signalRow, "rationale"),
      evaluationState: text(
        signalRow,
        "evaluation_state",
      ) as ThesisRoutedSignal["evaluationState"],
    };
  }

  private hasTable(name: string): boolean {
    return Boolean(
      row(
        this.database
          .prepare(`
            SELECT 1
            FROM sqlite_master
            WHERE type = 'table' AND name = ?
          `)
          .get(name),
      ),
    );
  }

  private assertKnownThesisAssociations(
    companyTickers: string[],
    layerIds: string[],
  ): void {
    const knownCompany = this.database.prepare(
      "SELECT 1 FROM companies WHERE ticker = ?",
    );
    companyTickers.forEach((ticker) => {
      if (!knownCompany.get(ticker)) {
        throw new RangeError(`Unknown company: ${ticker}`);
      }
    });
    const knownLayer = this.database.prepare(
      "SELECT 1 FROM stack_layers WHERE id = ?",
    );
    layerIds.forEach((layerId) => {
      if (!knownLayer.get(layerId)) {
        throw new RangeError(`Unknown stack layer: ${layerId}`);
      }
    });
  }

  private copyThesisVersionStructure(
    previousVersionId: string,
    nextVersionId: string,
  ): void {
    this.database
      .prepare(`
        INSERT INTO thesis_version_bottlenecks (
          thesis_version_id, bottleneck_key, title, description, sort_order
        )
        SELECT ?, bottleneck_key, title, description, sort_order
        FROM thesis_version_bottlenecks
        WHERE thesis_version_id = ?
      `)
      .run(nextVersionId, previousVersionId);
    this.database
      .prepare(`
        INSERT INTO thesis_version_company_captures (
          thesis_version_id, capture_key, bottleneck_key, company_ticker,
          role, mechanism, sort_order
        )
        SELECT ?, capture_key, bottleneck_key, company_ticker,
               role, mechanism, sort_order
        FROM thesis_version_company_captures
        WHERE thesis_version_id = ?
      `)
      .run(nextVersionId, previousVersionId);
  }

  private mapCompany(companyRow: SqlRow): Company {
    const ticker = text(companyRow, "ticker");
    const layerRows = rows(
      this.database
        .prepare("SELECT layer_id FROM company_layers WHERE company_ticker = ? ORDER BY layer_id")
        .all(ticker),
    );
    return {
      ticker,
      name: text(companyRow, "name"),
      layerIds: layerRows.map(
        (layerRow) =>
          text(layerRow, "layer_id") as Company["layerIds"][number],
      ),
      description: text(companyRow, "description"),
      thesis: text(companyRow, "thesis"),
      whyItMatters: text(companyRow, "why_it_matters"),
      provesRight: parseJson<string[]>(companyRow.proves_right_json, []),
      breaksThesis: parseJson<string[]>(companyRow.breaks_thesis_json, []),
      watchMetrics: parseJson<string[]>(companyRow.watch_metrics_json, []),
      confidence: text(companyRow, "confidence") as Company["confidence"],
      updatedAt: text(companyRow, "updated_at"),
    };
  }

  private withTransaction(operation: () => void): void {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      operation();
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }
}

function wasSystemInvalidated(evaluation: ThesisEvaluation): boolean {
  return Boolean(
    evaluation.reviewNote?.startsWith(IMPACT_REVIEW_INVALIDATION_PREFIX) ||
      evaluation.reviewNote?.startsWith(
        SIGNAL_REEVALUATION_INVALIDATION_PREFIX,
      ),
  );
}

export function createRelayRepository(
  databasePath = process.env.RELAY_DATABASE_PATH ??
    resolve(process.cwd(), "data", "relay.sqlite"),
  options: { seed?: boolean; demoData?: boolean } = {},
): RelayRepository {
  if (databasePath !== ":memory:") {
    mkdirSync(dirname(databasePath), { recursive: true });
  }
  const database = new DatabaseSync(databasePath);
  if (databasePath !== ":memory:") {
    database.exec("PRAGMA journal_mode = WAL");
    restrictDatabaseFiles(databasePath);
  }
  database.exec("PRAGMA busy_timeout = 5000");
  const repository = new RelayRepository(database);
  if (options.seed ?? true) {
    const explicitlyRequestedDemoData =
      options.demoData === true ||
      (options.demoData === undefined &&
        process.env.RELAY_DEMO_DATA?.trim().toLowerCase() === "true");
    const includeDemoData =
      options.demoData ??
      (process.env.NODE_ENV === "test" ||
        process.env.RELAY_DEMO_DATA?.trim().toLowerCase() === "true");
    seedDatabase(repository, { includeDemoData });
    repository.seedPortfolioCatalog({
      items: seedPortfolioItems,
      exposures: seedPortfolioThesisExposures,
      thesisStructures: seedThesisStructures,
    });
    if (explicitlyRequestedDemoData) {
      repository.seedPortfolioReviewHistory(seedPortfolioReviews);
    }
    if (!includeDemoData) {
      repository.clearPortfolioReviewHistory(
        seedPortfolioReviews.map((review) => review.id),
      );
      clearDemoData(repository);
    }
  }
  if (databasePath !== ":memory:") {
    restrictDatabaseFiles(databasePath);
  }
  return repository;
}

function restrictDatabaseFiles(databasePath: string): void {
  for (const path of [
    databasePath,
    `${databasePath}-shm`,
    `${databasePath}-wal`,
  ]) {
    if (existsSync(path)) {
      chmodSync(path, 0o600);
    }
  }
}

function sanitizeStoredError(message: string): string {
  return message
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, "[REDACTED]")
    .replace(/\bBearer\s+\S+/gi, "Bearer [REDACTED]")
    .replace(
      /((?:openai[_ -]?)?api[_ -]?key)\s*[:=]\s*\S+/gi,
      "$1=[REDACTED]",
    )
    .replace(/[\r\n\t]+/g, " ")
    .slice(0, 1_000);
}

function sourceDocumentContentHash(
  content: string,
  sourceUrl: string | null,
): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        content: content.trim(),
        sourceUrl,
      }),
    )
    .digest("hex");
}

function mapImpactReview(reviewRow: SqlRow): ImpactReview {
  return {
    impactId: text(reviewRow, "impact_id"),
    updateId: text(reviewRow, "update_id"),
    companyTicker: text(reviewRow, "company_ticker"),
    decision: text(
      reviewRow,
      "decision",
    ) as ImpactReview["decision"],
    reasonTags: parseJson<ImpactReview["reasonTags"]>(
      reviewRow.reason_tags_json,
      [],
    ),
    note: nullableText(reviewRow, "note"),
    createdAt: text(reviewRow, "created_at"),
    updatedAt: text(reviewRow, "updated_at"),
  };
}

interface ThesisState {
  belief: string;
  confidenceScore: number;
  unknowns: string[];
  strengtheningConditions: string[];
  weakeningConditions: string[];
}

function assertThesisState(state: ThesisState): void {
  if (!state.belief.trim()) {
    throw new TypeError("A thesis statement cannot be empty.");
  }
  if (
    !Number.isFinite(state.confidenceScore) ||
    state.confidenceScore < 0 ||
    state.confidenceScore > 100
  ) {
    throw new RangeError("Thesis confidence must be between 0 and 100.");
  }
  for (const items of [
    state.unknowns,
    state.strengtheningConditions,
    state.weakeningConditions,
  ]) {
    if (items.some((item) => !item.trim())) {
      throw new TypeError("Thesis lists cannot contain empty items.");
    }
  }
}

function sameThesisState(left: ThesisState, right: ThesisState): boolean {
  return (
    left.belief.trim() === right.belief.trim() &&
    left.confidenceScore === right.confidenceScore &&
    sameTextSet(left.unknowns, right.unknowns) &&
    sameTextSet(
      left.strengtheningConditions,
      right.strengtheningConditions,
    ) &&
    sameTextSet(left.weakeningConditions, right.weakeningConditions)
  );
}

function sameTextSet(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  const normalizedLeft = left.map(normalizeComparableText).sort();
  const normalizedRight = right.map(normalizeComparableText).sort();
  return normalizedLeft.every(
    (value, index) => value === normalizedRight[index],
  );
}

function normalizeComparableText(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

function normalizeTextList(items: string[]): string[] {
  return uniqueStrings(items);
}

function uniqueStrings(items: readonly string[]): string[] {
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))];
}

function normalizedDomain(value: string): string {
  return value.trim().toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
}

function domainMatches(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

function domainFromUrl(value: string | null): string | null {
  if (!value) {
    return null;
  }
  try {
    return normalizedDomain(new URL(value).hostname);
  } catch {
    return null;
  }
}

function confidenceToScore(confidence: Company["confidence"]): number {
  switch (confidence) {
    case "high":
      return 85;
    case "medium":
      return 60;
    case "low":
      return 35;
  }
}

function evaluationMomentum(
  evaluation: Pick<ThesisEvaluation, "outcome" | "confidenceDelta">,
): ThesisMomentum {
  switch (evaluation.outcome) {
    case "reinforced":
      return "strengthening";
    case "weakened":
    case "contradicted":
      return "weakening";
    case "revised":
      return evaluation.confidenceDelta > 0
        ? "strengthening"
        : evaluation.confidenceDelta < 0
          ? "weakening"
          : "unchanged";
    case "unchanged":
      return "unchanged";
  }
}

function samePortfolioDecisions(
  persisted: readonly PortfolioDecision[],
  proposed: readonly PortfolioDecisionInput[],
): boolean {
  if (persisted.length !== proposed.length) {
    return false;
  }
  const persistedByItem = new Map(
    persisted.map((decision) => [decision.portfolioItemId, decision]),
  );
  return proposed.every((decision) => {
    const existing = persistedByItem.get(decision.portfolioItemId);
    return existing?.action === decision.action &&
      existing.rationale === decision.rationale;
  });
}

function assertIsoDate(value: string, label: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new TypeError(`Invalid ISO date for ${label}.`);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new TypeError(`Invalid ISO date for ${label}.`);
  }
}

function assertIsoTimestamp(value: string, label: string): void {
  const parsed = new Date(value);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString() !== value
  ) {
    throw new TypeError(`Invalid ISO timestamp for ${label}.`);
  }
}

function assertSignalInvariants(update: IntelligenceUpdate): void {
  if (update.novelty === "repetition" && update.materiality !== "not-material") {
    throw new TypeError("Repeated signals must be classified as not material.");
  }
  if (update.materiality === "not-material") {
    if (update.sentiment !== "not-material") {
      throw new TypeError(
        "Not-material signals must use not-material sentiment.",
      );
    }
    if (update.thesisImpacts.length > 0) {
      throw new TypeError(
        "Not-material signals cannot contain thesis impacts.",
      );
    }
    if ((update.macroThesisImpacts?.length ?? 0) > 0) {
      throw new TypeError(
        "Not-material signals cannot contain macro-thesis impacts.",
      );
    }
    return;
  }

  if (update.sentiment === "not-material") {
    throw new TypeError(
      "Material signals cannot use not-material sentiment.",
    );
  }
  if (update.claims.length === 0) {
    throw new TypeError(
      "Material signals must contain at least one exact evidence claim.",
    );
  }
  if (
    update.thesisImpacts.some(
      (impact) =>
        impact.direction === "not-material" ||
        !impact.thesisDelta.trim(),
    )
  ) {
    throw new TypeError(
      "Company thesis impacts must contain a concrete thesis delta.",
    );
  }
  const claimIds = new Set(update.claims.map((claim) => claim.id));
  const routedThesisIds = new Set<string>();
  for (const impact of update.macroThesisImpacts ?? []) {
    if (routedThesisIds.has(impact.thesisId)) {
      throw new TypeError(
        "A signal cannot route to the same macro thesis more than once.",
      );
    }
    routedThesisIds.add(impact.thesisId);
    if (
      !impact.rationale.trim() ||
      impact.claimIds.length === 0 ||
      impact.claimIds.some((claimId) => !claimIds.has(claimId))
    ) {
      throw new TypeError(
        "Macro-thesis impacts must cite exact claims from their signal.",
      );
    }
    if (
      (impact.relevance === "context") !==
      (impact.stance === "context")
    ) {
      throw new TypeError(
        "Macro-thesis relevance and evidence stance are inconsistent.",
      );
    }
  }
  if (
    update.thesisImpacts.length === 0 &&
    !(update.macroThesisImpacts ?? []).some(
      (impact) =>
        impact.relevance === "primary" ||
        impact.relevance === "secondary",
    )
  ) {
    throw new TypeError(
      "Material signals require a company impact or direct macro-thesis impact.",
    );
  }
}
