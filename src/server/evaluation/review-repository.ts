import type { DatabaseSync } from "node:sqlite";

export const IMPACT_REVIEW_DECISIONS = [
  "accepted",
  "rejected",
  "deferred",
] as const;

export type ImpactReviewDecision = (typeof IMPACT_REVIEW_DECISIONS)[number];

export const IMPACT_REVIEW_REASON_TAGS = [
  "wrong-company",
  "wrong-layer",
  "overstated-materiality",
  "unsupported-conclusion",
  "missed-important-claim",
  "useful-analysis",
  "other",
] as const;

export type ImpactReviewReasonTag =
  (typeof IMPACT_REVIEW_REASON_TAGS)[number];

export interface ImpactReviewInput {
  impactId: string;
  decision: ImpactReviewDecision;
  reasonTags: readonly ImpactReviewReasonTag[];
  note?: string | null;
}

export interface ImpactReviewClaimSnapshot {
  id: string;
  quote: string;
  sourceId: string;
  locator: string;
}

export interface ImpactReviewSnapshot {
  update: {
    id: string;
    title: string;
    publisher: string;
    sourceUrl: string | null;
    publishedAt: string;
    materiality: string;
    sentiment: string;
    whatHappened: string;
    whyItMatters: string;
    layerIds: string[];
  };
  impact: {
    id: string;
    companyTicker: string;
    direction: string;
    summary: string;
    confidence: string;
    horizon: string;
  };
  claims: ImpactReviewClaimSnapshot[];
}

export interface ImpactReviewRecord {
  impactId: string;
  updateId: string;
  companyTicker: string;
  decision: ImpactReviewDecision;
  reasonTags: ImpactReviewReasonTag[];
  note: string | null;
  createdAt: string;
  updatedAt: string;
  snapshot: ImpactReviewSnapshot;
}

export interface ImpactReviewFilters {
  decision?: ImpactReviewDecision;
  reasonTag?: ImpactReviewReasonTag;
  companyTicker?: string;
  updateId?: string;
  limit?: number;
  offset?: number;
}

export interface ImpactReviewSummary {
  total: number;
  byDecision: Record<ImpactReviewDecision, number>;
  byReason: Record<ImpactReviewReasonTag, number>;
  byCompany: Record<string, number>;
}

export interface ImpactReviewExport {
  schemaVersion: 1;
  exportedAt: string;
  summary: ImpactReviewSummary;
  reviews: ImpactReviewRecord[];
}

interface ImpactReviewRepositoryOptions {
  now?: () => Date;
}

type SqlValue = bigint | null | number | string | Uint8Array;
type SqlRow = Record<string, SqlValue>;

const decisionSet = new Set<string>(IMPACT_REVIEW_DECISIONS);
const reasonTagSet = new Set<string>(IMPACT_REVIEW_REASON_TAGS);

function row(value: unknown): SqlRow | undefined {
  return value as SqlRow | undefined;
}

function rows(value: unknown): SqlRow[] {
  return value as SqlRow[];
}

function text(value: SqlValue | undefined, field: string): string {
  if (typeof value !== "string") {
    throw new TypeError(`Expected ${field} to be text`);
  }
  return value;
}

function nullableText(value: SqlValue | undefined): string | null {
  return typeof value === "string" ? value : null;
}

function parseJson<T>(value: SqlValue | undefined, field: string): T {
  if (typeof value !== "string") {
    throw new TypeError(`Expected ${field} to be JSON text`);
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    throw new TypeError(`Expected ${field} to contain valid JSON`);
  }
}

function assertDecision(value: string): asserts value is ImpactReviewDecision {
  if (!decisionSet.has(value)) {
    throw new TypeError(`Unsupported impact review decision: ${value}`);
  }
}

function assertReasonTag(
  value: string,
): asserts value is ImpactReviewReasonTag {
  if (!reasonTagSet.has(value)) {
    throw new TypeError(`Unsupported impact review reason tag: ${value}`);
  }
}

function normalizeReasonTags(
  reasonTags: readonly ImpactReviewReasonTag[],
): ImpactReviewReasonTag[] {
  if (reasonTags.length === 0) {
    throw new TypeError("At least one impact review reason tag is required");
  }

  const normalized = new Set<ImpactReviewReasonTag>();
  reasonTags.forEach((reasonTag) => {
    assertReasonTag(reasonTag);
    normalized.add(reasonTag);
  });

  return IMPACT_REVIEW_REASON_TAGS.filter((reasonTag) =>
    normalized.has(reasonTag),
  );
}

function normalizeNote(note: string | null | undefined): string | null {
  if (note == null) {
    return null;
  }

  const normalized = note.trim();
  if (normalized.length === 0) {
    return null;
  }
  if (normalized.length > 2_000) {
    throw new TypeError("Impact review notes must be 2,000 characters or less");
  }
  return normalized;
}

function normalizeInteger(
  value: number | undefined,
  fallback: number,
  maximum: number,
): number {
  if (value === undefined) {
    return fallback;
  }
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError("Review list pagination values must be non-negative integers");
  }
  return Math.min(value, maximum);
}

function emptySummary(): ImpactReviewSummary {
  return {
    total: 0,
    byDecision: {
      accepted: 0,
      rejected: 0,
      deferred: 0,
    },
    byReason: {
      "wrong-company": 0,
      "wrong-layer": 0,
      "overstated-materiality": 0,
      "unsupported-conclusion": 0,
      "missed-important-claim": 0,
      "useful-analysis": 0,
      other: 0,
    },
    byCompany: {},
  };
}

function summarize(reviews: readonly ImpactReviewRecord[]): ImpactReviewSummary {
  const summary = emptySummary();
  reviews.forEach((review) => {
    summary.total += 1;
    summary.byDecision[review.decision] += 1;
    review.reasonTags.forEach((reasonTag) => {
      summary.byReason[reasonTag] += 1;
    });
    summary.byCompany[review.companyTicker] =
      (summary.byCompany[review.companyTicker] ?? 0) + 1;
  });
  return summary;
}

export class ImpactReviewRepository {
  readonly database: DatabaseSync;
  readonly now: () => Date;

  constructor(
    database: DatabaseSync,
    options: ImpactReviewRepositoryOptions = {},
  ) {
    this.database = database;
    this.now = options.now ?? (() => new Date());
    this.ensureSchema();
  }

  ensureSchema(): void {
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS impact_reviews (
        impact_id TEXT PRIMARY KEY,
        update_id TEXT NOT NULL,
        company_ticker TEXT NOT NULL,
        decision TEXT NOT NULL CHECK (
          decision IN ('accepted', 'rejected', 'deferred')
        ),
        reason_tags_json TEXT NOT NULL,
        note TEXT,
        snapshot_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS impact_reviews_updated_at_idx
        ON impact_reviews(updated_at DESC, impact_id);

      CREATE INDEX IF NOT EXISTS impact_reviews_company_idx
        ON impact_reviews(company_ticker, updated_at DESC);

      CREATE INDEX IF NOT EXISTS impact_reviews_decision_idx
        ON impact_reviews(decision, updated_at DESC);
    `);
  }

  reviewImpact(input: ImpactReviewInput): ImpactReviewRecord {
    const impactId = input.impactId.trim();
    if (impactId.length === 0) {
      throw new TypeError("An impact ID is required");
    }
    assertDecision(input.decision);

    const reasonTags = normalizeReasonTags(input.reasonTags);
    const note = normalizeNote(input.note);
    if (reasonTags.includes("other") && note === null) {
      throw new TypeError("A note is required when the review reason is other");
    }

    const snapshot = this.loadSnapshot(impactId);
    const timestamp = this.now().toISOString();
    this.database
      .prepare(`
        INSERT INTO impact_reviews (
          impact_id, update_id, company_ticker, decision, reason_tags_json,
          note, snapshot_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(impact_id) DO UPDATE SET
          update_id = excluded.update_id,
          company_ticker = excluded.company_ticker,
          decision = excluded.decision,
          reason_tags_json = excluded.reason_tags_json,
          note = excluded.note,
          snapshot_json = excluded.snapshot_json,
          updated_at = excluded.updated_at
      `)
      .run(
        impactId,
        snapshot.update.id,
        snapshot.impact.companyTicker,
        input.decision,
        JSON.stringify(reasonTags),
        note,
        JSON.stringify(snapshot),
        timestamp,
        timestamp,
      );

    const review = this.getReview(impactId);
    if (!review) {
      throw new Error(`Failed to reload impact review ${impactId}`);
    }
    return review;
  }

  getReview(impactId: string): ImpactReviewRecord | null {
    const reviewRow = row(
      this.database
        .prepare("SELECT * FROM impact_reviews WHERE impact_id = ?")
        .get(impactId),
    );
    return reviewRow ? this.toRecord(reviewRow) : null;
  }

  listReviews(filters: ImpactReviewFilters = {}): ImpactReviewRecord[] {
    const limit = normalizeInteger(filters.limit, 100, 1_000);
    const offset = normalizeInteger(filters.offset, 0, 1_000_000);
    if (filters.decision !== undefined) {
      assertDecision(filters.decision);
    }
    if (filters.reasonTag !== undefined) {
      assertReasonTag(filters.reasonTag);
    }

    const companyTicker = filters.companyTicker?.trim().toUpperCase();
    const updateId = filters.updateId?.trim();

    return this.readAll()
      .filter(
        (review) =>
          filters.decision === undefined ||
          review.decision === filters.decision,
      )
      .filter(
        (review) =>
          filters.reasonTag === undefined ||
          review.reasonTags.includes(filters.reasonTag),
      )
      .filter(
        (review) =>
          companyTicker === undefined ||
          review.companyTicker === companyTicker,
      )
      .filter(
        (review) => updateId === undefined || review.updateId === updateId,
      )
      .slice(offset, offset + limit);
  }

  getSummary(): ImpactReviewSummary {
    return summarize(this.readAll());
  }

  exportReviewedExamples(): ImpactReviewExport {
    const reviews = this.readAll();
    return {
      schemaVersion: 1,
      exportedAt: this.now().toISOString(),
      summary: summarize(reviews),
      reviews,
    };
  }

  private readAll(): ImpactReviewRecord[] {
    return rows(
      this.database
        .prepare(
          "SELECT * FROM impact_reviews ORDER BY updated_at DESC, impact_id ASC",
        )
        .all(),
    ).map((reviewRow) => this.toRecord(reviewRow));
  }

  private loadSnapshot(impactId: string): ImpactReviewSnapshot {
    const snapshotRow = row(
      this.database
        .prepare(`
          SELECT
            impact.id AS impact_id,
            impact.update_id,
            impact.company_ticker,
            impact.direction,
            impact.summary AS impact_summary,
            impact.confidence,
            impact.horizon,
            update_record.title,
            update_record.publisher,
            update_record.source_url,
            update_record.published_at,
            update_record.materiality,
            update_record.sentiment,
            update_record.what_happened,
            update_record.why_it_matters
          FROM thesis_impacts AS impact
          INNER JOIN intelligence_updates AS update_record
            ON update_record.id = impact.update_id
          WHERE impact.id = ?
        `)
        .get(impactId),
    );

    if (!snapshotRow) {
      throw new RangeError(`Unknown thesis impact: ${impactId}`);
    }

    const updateId = text(snapshotRow.update_id, "update_id");
    const layerIds = rows(
      this.database
        .prepare(
          "SELECT layer_id FROM update_layers WHERE update_id = ? ORDER BY layer_id",
        )
        .all(updateId),
    ).map((layerRow) => text(layerRow.layer_id, "layer_id"));
    const claims = rows(
      this.database
        .prepare(`
          SELECT id, quote, source_id, locator
          FROM evidence_claims
          WHERE update_id = ?
          ORDER BY rowid
        `)
        .all(updateId),
    ).map((claimRow) => ({
      id: text(claimRow.id, "claim.id"),
      quote: text(claimRow.quote, "claim.quote"),
      sourceId: text(claimRow.source_id, "claim.source_id"),
      locator: text(claimRow.locator, "claim.locator"),
    }));

    return {
      update: {
        id: updateId,
        title: text(snapshotRow.title, "title"),
        publisher: text(snapshotRow.publisher, "publisher"),
        sourceUrl: nullableText(snapshotRow.source_url),
        publishedAt: text(snapshotRow.published_at, "published_at"),
        materiality: text(snapshotRow.materiality, "materiality"),
        sentiment: text(snapshotRow.sentiment, "sentiment"),
        whatHappened: text(snapshotRow.what_happened, "what_happened"),
        whyItMatters: text(snapshotRow.why_it_matters, "why_it_matters"),
        layerIds,
      },
      impact: {
        id: text(snapshotRow.impact_id, "impact_id"),
        companyTicker: text(snapshotRow.company_ticker, "company_ticker"),
        direction: text(snapshotRow.direction, "direction"),
        summary: text(snapshotRow.impact_summary, "impact_summary"),
        confidence: text(snapshotRow.confidence, "confidence"),
        horizon: text(snapshotRow.horizon, "horizon"),
      },
      claims,
    };
  }

  private toRecord(reviewRow: SqlRow): ImpactReviewRecord {
    const decision = text(reviewRow.decision, "decision");
    assertDecision(decision);

    const storedReasonTags = parseJson<string[]>(
      reviewRow.reason_tags_json,
      "reason_tags_json",
    );
    const reasonTags = storedReasonTags.map((reasonTag) => {
      assertReasonTag(reasonTag);
      return reasonTag;
    });

    return {
      impactId: text(reviewRow.impact_id, "impact_id"),
      updateId: text(reviewRow.update_id, "update_id"),
      companyTicker: text(reviewRow.company_ticker, "company_ticker"),
      decision,
      reasonTags: [...new Set(reasonTags)],
      note: nullableText(reviewRow.note),
      createdAt: text(reviewRow.created_at, "created_at"),
      updatedAt: text(reviewRow.updated_at, "updated_at"),
      snapshot: parseJson<ImpactReviewSnapshot>(
        reviewRow.snapshot_json,
        "snapshot_json",
      ),
    };
  }
}

export function createImpactReviewRepository(
  database: DatabaseSync,
  options: ImpactReviewRepositoryOptions = {},
): ImpactReviewRepository {
  return new ImpactReviewRepository(database, options);
}
