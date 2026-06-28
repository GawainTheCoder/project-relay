import {
  mkdtempSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { DailyBrief, IntelligenceUpdate } from "../../shared/contracts.js";

import { createImpactReviewRepository } from "../evaluation/index.js";
import {
  createRelayRepository,
  type RelayRepository,
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
    expect(first.sources).toHaveLength(12);
    expect(first.brief?.updateIds.length).toBeGreaterThan(0);

    const secondRepositoryView = repository.getDashboard();
    expect(secondRepositoryView.companies).toHaveLength(13);
    expect(secondRepositoryView.updates).toHaveLength(7);
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
          decision: "proposed",
        },
      ],
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
