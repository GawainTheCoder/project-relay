import { DatabaseSync } from "node:sqlite";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createImpactReviewRepository,
  type ImpactReviewRepository,
} from "./review-repository.js";
import { createRelayRepository } from "../db/repository.js";

function createFixtureDatabase(): DatabaseSync {
  const database = new DatabaseSync(":memory:");
  database.exec(`
    CREATE TABLE intelligence_updates (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      publisher TEXT NOT NULL,
      source_url TEXT,
      published_at TEXT NOT NULL,
      materiality TEXT NOT NULL,
      sentiment TEXT NOT NULL,
      what_happened TEXT NOT NULL,
      why_it_matters TEXT NOT NULL
    );

    CREATE TABLE thesis_impacts (
      id TEXT PRIMARY KEY,
      update_id TEXT NOT NULL,
      company_ticker TEXT NOT NULL,
      direction TEXT NOT NULL,
      summary TEXT NOT NULL,
      confidence TEXT NOT NULL,
      horizon TEXT NOT NULL
    );

    CREATE TABLE update_layers (
      update_id TEXT NOT NULL,
      layer_id TEXT NOT NULL
    );

    CREATE TABLE evidence_claims (
      id TEXT PRIMARY KEY,
      update_id TEXT NOT NULL,
      quote TEXT NOT NULL,
      source_id TEXT NOT NULL,
      locator TEXT NOT NULL
    );

    INSERT INTO intelligence_updates (
      id, title, publisher, source_url, published_at, materiality, sentiment,
      what_happened, why_it_matters
    ) VALUES (
      'update-optics', 'Optics capacity expands', 'Test Research',
      'https://example.com/optics', '2026-06-28T08:00:00.000Z', 'high',
      'bullish', 'A supplier entered volume production.',
      'The ramp adds capacity at a constrained layer.'
    );

    INSERT INTO thesis_impacts (
      id, update_id, company_ticker, direction, summary, confidence, horizon
    ) VALUES
      (
        'impact-cohr', 'update-optics', 'COHR', 'bullish',
        'The ramp supports the optics capacity thesis.', 'high', '6-12 months'
      ),
      (
        'impact-lite', 'update-optics', 'LITE', 'neutral',
        'Competitor capacity could affect pricing.', 'medium', '3-6 months'
      ),
      (
        'impact-glw', 'update-optics', 'GLW', 'bullish',
        'More links could support fiber demand.', 'low', '12-24 months'
      );

    INSERT INTO update_layers (update_id, layer_id) VALUES
      ('update-optics', 'networking'),
      ('update-optics', 'optics');

    INSERT INTO evidence_claims (
      id, update_id, quote, source_id, locator
    ) VALUES (
      'claim-volume', 'update-optics',
      'Volume production began during the quarter.',
      'manual-imports', 'paragraph 4'
    );
  `);
  return database;
}

describe("ImpactReviewRepository", () => {
  let database: DatabaseSync;
  let repository: ImpactReviewRepository;
  let currentTime: Date;

  beforeEach(() => {
    database = createFixtureDatabase();
    currentTime = new Date("2026-06-28T10:00:00.000Z");
    repository = createImpactReviewRepository(database, {
      now: () => currentTime,
    });
  });

  afterEach(() => {
    database.close();
  });

  it("creates its additive schema idempotently", () => {
    repository.ensureSchema();

    const table = database
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'impact_reviews'",
      )
      .get() as { name: string } | undefined;
    const indexes = database
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'impact_reviews'",
      )
      .all() as { name: string }[];

    expect(table?.name).toBe("impact_reviews");
    expect(indexes.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        "impact_reviews_updated_at_idx",
        "impact_reviews_company_idx",
        "impact_reviews_decision_idx",
      ]),
    );
  });

  it("stores one durable review per impact and preserves its creation time", () => {
    const first = repository.reviewImpact({
      impactId: "impact-cohr",
      decision: "accepted",
      reasonTags: ["useful-analysis", "useful-analysis"],
      note: "  Supported by the quoted production milestone.  ",
    });

    expect(first).toMatchObject({
      impactId: "impact-cohr",
      decision: "accepted",
      reasonTags: ["useful-analysis"],
      note: "Supported by the quoted production milestone.",
      createdAt: "2026-06-28T10:00:00.000Z",
      updatedAt: "2026-06-28T10:00:00.000Z",
    });
    expect(first.snapshot.update.layerIds).toEqual(["networking", "optics"]);
    expect(first.snapshot.claims[0]?.quote).toBe(
      "Volume production began during the quarter.",
    );

    currentTime = new Date("2026-06-28T11:00:00.000Z");
    const revised = repository.reviewImpact({
      impactId: "impact-cohr",
      decision: "deferred",
      reasonTags: ["missed-important-claim"],
    });

    expect(revised.createdAt).toBe("2026-06-28T10:00:00.000Z");
    expect(revised.updatedAt).toBe("2026-06-28T11:00:00.000Z");
    expect(revised.decision).toBe("deferred");
    expect(
      database.prepare("SELECT COUNT(*) AS count FROM impact_reviews").get(),
    ).toEqual({ count: 1 });
  });

  it("lists, filters, summarizes, and exports reviewed examples", () => {
    repository.reviewImpact({
      impactId: "impact-cohr",
      decision: "accepted",
      reasonTags: ["useful-analysis"],
    });
    repository.reviewImpact({
      impactId: "impact-lite",
      decision: "rejected",
      reasonTags: ["unsupported-conclusion", "overstated-materiality"],
    });
    repository.reviewImpact({
      impactId: "impact-glw",
      decision: "deferred",
      reasonTags: ["wrong-company"],
    });

    expect(
      repository.listReviews({ decision: "rejected" }).map(({ impactId }) => impactId),
    ).toEqual(["impact-lite"]);
    expect(
      repository
        .listReviews({ reasonTag: "wrong-company", companyTicker: "glw" })
        .map(({ impactId }) => impactId),
    ).toEqual(["impact-glw"]);
    expect(repository.getSummary()).toEqual({
      total: 3,
      byDecision: {
        accepted: 1,
        rejected: 1,
        deferred: 1,
      },
      byReason: {
        "wrong-company": 1,
        "wrong-layer": 0,
        "overstated-materiality": 1,
        "unsupported-conclusion": 1,
        "missed-important-claim": 0,
        "useful-analysis": 1,
        other: 0,
      },
      byCompany: {
        COHR: 1,
        GLW: 1,
        LITE: 1,
      },
    });

    const exported = repository.exportReviewedExamples();
    expect(exported).toMatchObject({
      schemaVersion: 1,
      exportedAt: "2026-06-28T10:00:00.000Z",
      summary: { total: 3 },
    });
    expect(exported.reviews).toHaveLength(3);
    expect(exported.reviews[0]?.snapshot.update.whatHappened).toBe(
      "A supplier entered volume production.",
    );
  });

  it("keeps the review snapshot stable when the analyzed update later changes", () => {
    repository.reviewImpact({
      impactId: "impact-cohr",
      decision: "accepted",
      reasonTags: ["useful-analysis"],
    });

    database
      .prepare(
        "UPDATE intelligence_updates SET what_happened = ? WHERE id = ?",
      )
      .run("A later analysis replaced the original.", "update-optics");

    expect(
      repository.getReview("impact-cohr")?.snapshot.update.whatHappened,
    ).toBe("A supplier entered volume production.");
  });

  it("rejects invalid or non-actionable review input", () => {
    expect(() =>
      repository.reviewImpact({
        impactId: "missing",
        decision: "accepted",
        reasonTags: ["useful-analysis"],
      }),
    ).toThrow("Unknown thesis impact");
    expect(() =>
      repository.reviewImpact({
        impactId: "impact-cohr",
        decision: "rejected",
        reasonTags: [],
      }),
    ).toThrow("At least one");
    expect(() =>
      repository.reviewImpact({
        impactId: "impact-cohr",
        decision: "rejected",
        reasonTags: ["other"],
      }),
    ).toThrow("A note is required");
  });
});

describe("integrated review durability", () => {
  it("preserves an evaluation snapshot when reanalysis replaces its impact", () => {
    const relay = createRelayRepository(":memory:");
    const reviews = createImpactReviewRepository(relay.database);

    try {
      const original = relay.getUpdate("vrt-fy25-q4");
      const originalImpact = original?.thesisImpacts[0];
      if (!original || !originalImpact) {
        throw new Error("Expected the seeded update and thesis impact.");
      }

      reviews.reviewImpact({
        impactId: originalImpact.id,
        decision: "accepted",
        reasonTags: ["useful-analysis"],
      });

      relay.persistAnalyzedUpdate({
        ...original,
        thesisImpacts: [
          {
            ...originalImpact,
            id: `${originalImpact.id}-reworded`,
            summary: `${originalImpact.summary} Reworded by a later analysis.`,
            decision: "proposed",
          },
        ],
      });

      expect(
        relay.getUpdate(original.id)?.thesisImpacts[0]?.review,
      ).toBeNull();
      expect(reviews.getReview(originalImpact.id)).toMatchObject({
        impactId: originalImpact.id,
        decision: "accepted",
        snapshot: {
          impact: {
            id: originalImpact.id,
            summary: originalImpact.summary,
          },
        },
      });
      expect(reviews.exportReviewedExamples().summary.total).toBe(1);
    } finally {
      relay.close();
    }
  });
});
