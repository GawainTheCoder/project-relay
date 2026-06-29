import { createHash, randomUUID } from "node:crypto";
import { chmodSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

import type {
  Company,
  DailyBrief,
  DashboardPayload,
  ImpactReview,
  IntelligenceUpdate,
  ResearchSource,
  SourceKind,
  StackLayer,
} from "../../shared/contracts.js";

import {
  clearDemoData,
  demoBriefId,
  demoUpdateIds,
  seedDatabase,
} from "../seeds/index.js";
import { migrateDatabase } from "./schema.js";
import { canonicalizeUrl } from "../ingestion/normalize.js";

interface CatalogSeed {
  brief?: DailyBrief;
  companies: Company[];
  layers: StackLayer[];
  sources: ResearchSource[];
  updates: IntelligenceUpdate[];
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
  status: "pending" | "analyzed" | "error";
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
        archived
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        type = excluded.type,
        url = excluded.url,
        enabled = excluded.enabled,
        archived = 0
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
        );
      });
      this.database
        .prepare(`
          UPDATE research_sources
          SET archived = 1
          WHERE id NOT IN (${catalog.sources.map(() => "?").join(", ")})
        `)
        .run(...catalog.sources.map((source) => source.id));
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

  getDashboard(): DashboardPayload {
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
      this.database.prepare("SELECT * FROM companies ORDER BY ticker").all(),
    ).map((companyRow) => this.mapCompany(companyRow));
  }

  getCompany(ticker: string): Company | null {
    const companyRow = row(
      this.database
        .prepare("SELECT * FROM companies WHERE ticker = ?")
        .get(ticker.toUpperCase()),
    );
    return companyRow ? this.mapCompany(companyRow) : null;
  }

  listSources(): ResearchSource[] {
    return rows(
      this.database
        .prepare(
          "SELECT * FROM research_sources WHERE archived = 0 ORDER BY name",
        )
        .all(),
    ).map((sourceRow) => ({
      id: text(sourceRow, "id"),
      name: text(sourceRow, "name"),
      type: text(sourceRow, "type") as ResearchSource["type"],
      url: nullableText(sourceRow, "url"),
      enabled: sourceRow.enabled === 1,
      status: text(sourceRow, "status") as ResearchSource["status"],
      lastSyncedAt: nullableText(sourceRow, "last_synced_at"),
      documentCount:
        typeof sourceRow.document_count === "number"
          ? sourceRow.document_count
          : 0,
    }));
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
      model: nullableText(updateRow, "model"),
    };
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
      generatedAt: text(briefRow, "generated_at"),
      model: nullableText(briefRow, "model"),
    };
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
    const knownUpdate = this.database.prepare(
      "SELECT 1 FROM intelligence_updates WHERE id = ?",
    );
    const knownClaim = this.database.prepare(
      "SELECT 1 FROM evidence_claims WHERE id = ?",
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
          SELECT id, analysis_status, update_id, ingested_at
          FROM source_documents WHERE content_hash = ?
        `)
        .get(contentHash),
    );
    if (existing) {
      return {
        id: text(existing, "id"),
        status: text(
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
        WHERE id = ?
      `)
      .run(updateId, documentId);
  }

  markSourceDocumentError(documentId: string, message: string): void {
    this.database
      .prepare(`
        UPDATE source_documents
        SET analysis_status = 'error', error_message = ?
        WHERE id = ?
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
    update.thesisImpacts.length === 0 ||
    update.thesisImpacts.some(
      (impact) =>
        impact.direction === "not-material" ||
        !impact.thesisDelta.trim(),
    )
  ) {
    throw new TypeError(
      "Material signals must contain a concrete thesis delta.",
    );
  }
}
