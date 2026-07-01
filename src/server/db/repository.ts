import { createHash, randomUUID } from "node:crypto";
import { chmodSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

import type {
  Company,
  CompanyInput,
  DailyBrief,
  DashboardPayload,
  ImpactReview,
  IntelligenceUpdate,
  ResearchSource,
  ResearchSourceInput,
  SourceProfileInput,
  SourceKind,
  StackLayer,
  Thesis,
  ThesisEvaluation,
  ThesisEvaluationInput,
  ThesisEvaluationReviewInput,
  ThesisEvidence,
  ThesisInput,
  ThesisStatus,
  ThesisType,
  ThesisVersion,
} from "../../shared/contracts.js";

import {
  clearDemoData,
  demoBriefId,
  demoUpdateIds,
  seedDatabase,
} from "../seeds/index.js";
import { migrateDatabase } from "./schema.js";
import { canonicalizeUrl } from "../ingestion/normalize.js";

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

export interface ThesisListFilters {
  kind?: ThesisType | undefined;
  status?: ThesisStatus | "all" | undefined;
}

export interface ThesisEvaluationListFilters {
  thesisId?: string | undefined;
  reviewStatus?: ThesisEvaluation["reviewStatus"] | undefined;
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

  getThesis(id: string): Thesis | null {
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
    return {
      id,
      kind: text(thesisRow, "type") as Thesis["kind"],
      title: text(thesisRow, "title"),
      status: text(thesisRow, "status") as Thesis["status"],
      currentVersion: this.mapThesisVersion(versionRow),
      versions: this.getThesisHistory(id),
      companyTickers: companyRows.map((companyRow) =>
        text(companyRow, "company_ticker"),
      ),
      layerIds: layerRows.map(
        (layerRow) => text(layerRow, "layer_id") as Thesis["layerIds"][number],
      ),
      evidence: this.listThesisEvidence(id),
      evaluations: this.listThesisEvaluations({ thesisId: id }),
      createdAt: text(thesisRow, "created_at"),
      updatedAt: text(thesisRow, "updated_at"),
    };
  }

  getThesisDetail(id: string): Thesis | null {
    return this.getThesis(id);
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
            proposed_weakening_conditions_json, review_status, review_note,
            model, created_at, reviewed_at
          ) VALUES (
            ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL, ?, ?, NULL
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
    if (
      evaluation.reviewStatus === "accepted" ||
      evaluation.reviewStatus === "rejected"
    ) {
      if (evaluation.reviewStatus === input.decision) {
        return evaluation;
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
      }
      this.database
        .prepare(`
          UPDATE thesis_evaluations
          SET review_status = ?, review_note = ?, reviewed_at = ?,
              accepted_version_id = ?
          WHERE id = ?
        `)
        .run(
          input.decision,
          reviewNote,
          reviewedAt,
          acceptedVersionId,
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
    };
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
    const insertUpdate = this.database.prepare(`
      INSERT INTO intelligence_updates (
        id, title, publisher, source_url, published_at, ingested_at, materiality,
        materiality_reason, novelty, sentiment, what_happened, why_it_matters,
        beneficiaries_json, threatened_json, watch_next_json, model
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        model = excluded.model
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
    const contentHash = createHash("sha256")
      .update(
        JSON.stringify({
          content: input.content.trim(),
          sourceUrl,
        }),
      )
      .digest("hex");
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

  markSourceDocumentError(documentId: string, message: string): void {
    this.database
      .prepare(`
        UPDATE source_documents
        SET analysis_status = 'error', error_message = ?
        WHERE id = ? AND suppressed_at IS NULL
      `)
      .run(sanitizeStoredError(message), documentId);
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
      reviewStatus: text(
        evaluationRow,
        "review_status",
      ) as ThesisEvaluation["reviewStatus"],
      reviewNote: nullableText(evaluationRow, "review_note"),
      model: nullableText(evaluationRow, "model"),
      createdAt: text(evaluationRow, "created_at"),
      reviewedAt: nullableText(evaluationRow, "reviewed_at"),
    };
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
    const includeDemoData =
      options.demoData ??
      (process.env.NODE_ENV === "test" ||
        process.env.RELAY_DEMO_DATA?.trim().toLowerCase() === "true");
    seedDatabase(repository, { includeDemoData });
    if (!includeDemoData) {
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
