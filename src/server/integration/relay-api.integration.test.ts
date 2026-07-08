import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  DailyBrief,
  ImportSourceInput,
  IntelligenceUpdate,
} from "../../shared/contracts.js";
import { createApp } from "../app.js";
import {
  createRelayRepository,
  type RelayRepository,
} from "../db/repository.js";

const JSON_HEADERS = { "content-type": "application/json" } as const;

describe("Relay API integration contracts", () => {
  let repository: RelayRepository;

  beforeEach(() => {
    repository = createRelayRepository(":memory:");
  });

  afterEach(() => {
    repository.close();
  });

  it("returns the complete seeded dashboard with security and cache headers", async () => {
    const response = await createApp({ repository }).request("/api/dashboard");

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-security-policy")).toContain(
      "default-src 'self'",
    );
    expect(response.headers.get("permissions-policy")).toContain("camera=()");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("strict-transport-security")).toContain(
      "max-age=31536000",
    );
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-frame-options")).toBe("DENY");

    await expect(response.json()).resolves.toMatchObject({
      brief: {
        id: expect.any(String),
        updateIds: expect.arrayContaining(["vrt-fy25-q4"]),
        citationClaimIds: expect.any(Array),
      },
      companies: expect.arrayContaining([
        expect.objectContaining({ ticker: "NVDA" }),
        expect.objectContaining({ ticker: "TSM" }),
      ]),
      layers: expect.arrayContaining([
        expect.objectContaining({ id: "accelerators" }),
        expect.objectContaining({ id: "power-cooling" }),
      ]),
      sources: expect.any(Array),
      updates: expect.arrayContaining([
        expect.objectContaining({
          id: "vrt-fy25-q4",
          claims: expect.any(Array),
          thesisImpacts: expect.any(Array),
        }),
      ]),
    });
  });

  it("canonicalizes, analyzes, persists, and deduplicates a URL-only import", async () => {
    const analyzeImportedSource = vi.fn(
      async (input: ImportSourceInput) =>
        makeAnalyzedUpdate(repository, "url-import", input.sourceUrl ?? null),
    );
    const app = createApp({
      repository,
      services: { analyzeImportedSource },
    });
    const payload = {
      title: "Optical capacity update",
      publisher: "Example Research",
      sourceUrl:
        "https://example.com/research/?utm_source=email&b=2&a=1#section",
    };

    const first = await app.request("/api/sources/import", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(payload),
    });
    const firstBody = (await first.json()) as {
      documentId: string;
      duplicate: boolean;
      status: string;
      update: IntelligenceUpdate;
    };

    expect(first.status).toBe(201);
    expect(firstBody).toMatchObject({
      duplicate: false,
      status: "analyzed",
      update: {
        id: "url-import",
        sourceUrl: "https://example.com/research?a=1&b=2",
      },
    });
    expect(analyzeImportedSource).toHaveBeenCalledWith({
      title: payload.title,
      publisher: payload.publisher,
      sourceUrl: "https://example.com/research?a=1&b=2",
    });
    expect(repository.getUpdate("url-import")).toEqual(firstBody.update);

    const duplicate = await app.request("/api/sources/import", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({
        ...payload,
        sourceUrl: "https://example.com/research?a=1&b=2",
      }),
    });

    expect(duplicate.status).toBe(200);
    await expect(duplicate.json()).resolves.toMatchObject({
      documentId: firstBody.documentId,
      duplicate: true,
      status: "analyzed",
      update: { id: "url-import" },
    });
    expect(analyzeImportedSource).toHaveBeenCalledOnce();
    expect(
      repository
        .listSources()
        .find((source) => source.id === "manual-imports")?.documentCount,
    ).toBe(1);
  });

  it("passes pasted text to analysis and preserves its evidence in storage", async () => {
    const analyzeImportedSource = vi.fn(
      async () => makeAnalyzedUpdate(repository, "pasted-import", null),
    );
    const app = createApp({
      repository,
      services: { analyzeImportedSource },
    });
    const content =
      "The supplier reported that advanced optical capacity entered volume production this quarter.";

    const response = await app.request("/api/sources/import", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({
        title: "Pasted analyst note",
        publisher: "Personal research",
        publishedAt: "2026-06-26T10:00:00.000Z",
        content,
      }),
    });

    expect(response.status).toBe(201);
    expect(analyzeImportedSource).toHaveBeenCalledWith({
      title: "Pasted analyst note",
      publisher: "Personal research",
      publishedAt: "2026-06-26T10:00:00.000Z",
      content,
    });
    await expect(response.json()).resolves.toMatchObject({
      status: "analyzed",
      update: {
        id: "pasted-import",
        claims: [
          expect.objectContaining({
            quote:
              "backlog increased to $15.0 billion, up 109% compared to the same period last year",
          }),
        ],
      },
    });
    expect(repository.getUpdate("pasted-import")?.claims).toHaveLength(1);
  });

  it("returns a stable public error when analysis fails and stores the failure state", async () => {
    const internalMessage =
      "provider rejected credential sk-project-secret-and-private-context";
    const app = createApp({
      repository,
      services: {
        analyzeImportedSource: vi
          .fn()
          .mockRejectedValue(new Error(internalMessage)),
      },
    });

    const response = await app.request("/api/sources/import", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({
        title: "Failed analysis",
        publisher: "Personal research",
        content:
          "This source contains enough content to pass request validation but its mocked analysis fails.",
      }),
    });
    const responseText = await response.text();

    expect(response.status).toBe(502);
    expect(responseText).not.toContain(internalMessage);
    expect(responseText).not.toContain("sk-project");
    expect(JSON.parse(responseText)).toEqual({
      error: {
        code: "ANALYSIS_FAILED",
        message: "The source was saved, but analysis failed.",
      },
    });
    const stored = repository.database
      .prepare(
        "SELECT analysis_status, error_message FROM source_documents WHERE title = ?",
      )
      .get("Failed analysis") as
      | { analysis_status: string; error_message: string }
      | undefined;
    expect(stored).toBeDefined();
    if (!stored) {
      throw new Error("Expected a stored failure record.");
    }
    expect(stored.analysis_status).toBe("error");
    expect(stored.error_message).not.toContain(internalMessage);
    expect(stored.error_message).not.toContain("sk-project");
  });

  it.each([401, 403])(
    "turns an upstream HTTP %i block into actionable excerpt guidance",
    async (statusCode) => {
      const app = createApp({
        repository,
        services: {
          analyzeImportedSource: vi
            .fn()
            .mockRejectedValue(
              new Error(`Source request failed with HTTP ${statusCode}.`),
            ),
        },
      });

      const response = await app.request("/api/sources/import", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({
          title: `Blocked publisher ${statusCode}`,
          publisher: "Example Publisher",
          sourceUrl: `https://example.com/blocked-${statusCode}`,
        }),
      });

      expect(response.status).toBe(502);
      await expect(response.json()).resolves.toEqual({
        error: {
          code: "SOURCE_RETRIEVAL_BLOCKED",
          message:
            "Publisher blocked automated retrieval—paste an excerpt.",
        },
      });
      expect(
        repository.database
          .prepare(
            "SELECT analysis_status, error_message FROM source_documents WHERE title = ?",
          )
          .get(`Blocked publisher ${statusCode}`),
      ).toEqual({
        analysis_status: "error",
        error_message: `Source request failed with HTTP ${statusCode}.`,
      });
    },
  );

  it("lists failed source documents and retries the stored URL in place", async () => {
    const document = repository.persistSourceDocument({
      title: "Blocked infrastructure article",
      publisher: "Example Publisher",
      sourceUrl:
        "https://example.com/infrastructure?utm_source=newsletter",
      publishedAt: "2026-07-01T12:00:00.000Z",
      content:
        "URL import queued for secure retrieval: https://example.com/infrastructure",
      sourceKind: "technical",
    });
    repository.markSourceDocumentError(
      document.id,
      "Source request failed with HTTP 403.",
    );
    const analyzeImportedSource = vi.fn(
      async (input: ImportSourceInput) =>
        makeAnalyzedUpdate(
          repository,
          "recovered-url-import",
          input.sourceUrl ?? null,
        ),
    );
    const app = createApp({
      repository,
      services: { analyzeImportedSource },
    });

    const failed = await app.request("/api/source-documents/failed");
    expect(failed.status).toBe(200);
    await expect(failed.json()).resolves.toEqual({
      documents: [
        expect.objectContaining({
          id: document.id,
          title: "Blocked infrastructure article",
          sourceUrl: "https://example.com/infrastructure",
          sourceKind: "technical",
          errorMessage: "Source request failed with HTTP 403.",
          attemptCount: 1,
          lastAttemptedAt: expect.any(String),
        }),
      ],
    });

    const retried = await app.request(
      `/api/source-documents/${document.id}/retry`,
      { method: "POST" },
    );

    expect(retried.status).toBe(201);
    await expect(retried.json()).resolves.toMatchObject({
      documentId: document.id,
      duplicate: false,
      status: "analyzed",
      update: { id: "recovered-url-import" },
    });
    expect(analyzeImportedSource).toHaveBeenCalledWith({
      title: "Blocked infrastructure article",
      publisher: "Example Publisher",
      sourceUrl: "https://example.com/infrastructure",
      publishedAt: "2026-07-01T12:00:00.000Z",
      sourceKind: "technical",
    });
    expect(
      repository.getSourceDocumentForRecovery(document.id),
    ).toMatchObject({
      id: document.id,
      status: "analyzed",
      updateId: "recovered-url-import",
      sourceUrl: "https://example.com/infrastructure",
      errorMessage: null,
      attemptCount: 2,
      lastAttemptedAt: expect.any(String),
    });
    await expect(
      (
        await app.request("/api/source-documents/failed")
      ).json(),
    ).resolves.toEqual({ documents: [] });
  });

  it("analyzes pasted recovery content directly and retains a failed queue item until success", async () => {
    const document = repository.persistSourceDocument({
      title: "Publisher-blocked article",
      publisher: "Example Publisher",
      sourceUrl: "https://example.com/blocked",
      content:
        "URL import queued for secure retrieval: https://example.com/blocked",
    });
    repository.markSourceDocumentError(
      document.id,
      "Source request failed with HTTP 403.",
    );
    const excerpt =
      "The publisher reported a material increase in data-center infrastructure spending and accelerator deployment.";
    const analyzeImportedSource = vi
      .fn()
      .mockRejectedValueOnce(
        new Error("Source request failed with HTTP 401."),
      )
      .mockResolvedValueOnce(
        makeAnalyzedUpdate(
          repository,
          "recovered-excerpt-import",
          "https://example.com/blocked",
        ),
      );
    const app = createApp({
      repository,
      services: { analyzeImportedSource },
    });
    const recoveryBody = {
      title: "Corrected publisher title",
      publisher: "Example News",
      sourceUrl: "https://example.com/blocked?utm_source=email",
      publishedAt: "2026-07-01T08:00:00.000Z",
      sourceKind: "other",
      content: excerpt,
    };

    const failedRetry = await app.request(
      `/api/source-documents/${document.id}/retry`,
      {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify(recoveryBody),
      },
    );

    expect(failedRetry.status).toBe(502);
    await expect(failedRetry.json()).resolves.toEqual({
      error: {
        code: "SOURCE_RETRIEVAL_BLOCKED",
        message:
          "Publisher blocked automated retrieval—paste an excerpt.",
      },
    });
    expect(analyzeImportedSource).toHaveBeenNthCalledWith(1, {
      title: "Corrected publisher title",
      publisher: "Example News",
      sourceUrl: "https://example.com/blocked",
      publishedAt: "2026-07-01T08:00:00.000Z",
      sourceKind: "other",
      content: excerpt,
    });
    await expect(
      (
        await app.request("/api/source-documents/failed")
      ).json(),
    ).resolves.toMatchObject({
      documents: [
        {
          id: document.id,
          title: "Corrected publisher title",
          publisher: "Example News",
          sourceUrl: "https://example.com/blocked",
          attemptCount: 2,
        },
      ],
    });

    const successfulRetry = await app.request(
      `/api/source-documents/${document.id}/retry`,
      {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ content: excerpt }),
      },
    );
    expect(successfulRetry.status).toBe(201);
    await expect(successfulRetry.json()).resolves.toMatchObject({
      documentId: document.id,
      status: "analyzed",
      update: { id: "recovered-excerpt-import" },
    });
    expect(analyzeImportedSource).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        content: excerpt,
        sourceUrl: "https://example.com/blocked",
      }),
    );
    expect(
      repository.getSourceDocumentForRecovery(document.id),
    ).toMatchObject({
      status: "analyzed",
      attemptCount: 3,
      lastAttemptedAt: expect.any(String),
    });
  });

  it("rejects unsafe or inapplicable source-document retries", async () => {
    const pending = repository.persistSourceDocument({
      title: "Pending document",
      publisher: "Personal research",
      content: "This document is still pending its first analysis attempt.",
    });
    const analyzed = repository.persistSourceDocument({
      title: "Analyzed document",
      publisher: "Personal research",
      content: "This document has already completed analysis.",
    });
    repository.markSourceDocumentAnalyzed(
      analyzed.id,
      "vrt-fy25-q4",
    );
    const suppressed = repository.persistSourceDocument({
      title: "Suppressed document",
      publisher: "Personal research",
      content: "This document was deleted and must remain suppressed.",
    });
    repository.markSourceDocumentError(
      suppressed.id,
      "Analysis failed.",
    );
    repository.database
      .prepare(
        "UPDATE source_documents SET suppressed_at = ? WHERE id = ?",
      )
      .run("2026-07-01T12:00:00.000Z", suppressed.id);
    const noUrl = repository.persistSourceDocument({
      title: "Failed pasted document",
      publisher: "Personal research",
      content: "This pasted document failed without a retrievable URL.",
    });
    repository.markSourceDocumentError(noUrl.id, "Analysis failed.");
    const app = createApp({
      repository,
      services: {
        analyzeImportedSource: vi.fn(),
      },
    });

    const cases = [
      {
        id: "document-does-not-exist",
        status: 404,
        code: "SOURCE_DOCUMENT_NOT_FOUND",
      },
      {
        id: pending.id,
        status: 409,
        code: "SOURCE_DOCUMENT_NOT_FAILED",
      },
      {
        id: analyzed.id,
        status: 409,
        code: "SOURCE_DOCUMENT_ALREADY_ANALYZED",
      },
      {
        id: suppressed.id,
        status: 409,
        code: "SOURCE_DOCUMENT_SUPPRESSED",
      },
      {
        id: noUrl.id,
        status: 409,
        code: "RECOVERY_CONTENT_REQUIRED",
      },
    ];
    for (const testCase of cases) {
      const response = await app.request(
        `/api/source-documents/${testCase.id}/retry`,
        { method: "POST" },
      );
      expect(response.status).toBe(testCase.status);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: testCase.code },
      });
    }
  });

  it("leaves a failed document queued when analysis is unavailable", async () => {
    const document = repository.persistSourceDocument({
      title: "Queued blocked article",
      publisher: "Example Publisher",
      sourceUrl: "https://example.com/queued",
      content:
        "URL import queued for secure retrieval: https://example.com/queued",
    });
    repository.markSourceDocumentError(
      document.id,
      "Source request failed with HTTP 403.",
    );

    const response = await createApp({ repository }).request(
      `/api/source-documents/${document.id}/retry`,
      { method: "POST" },
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "SERVICE_UNAVAILABLE" },
    });
    expect(
      repository.getSourceDocumentForRecovery(document.id),
    ).toMatchObject({
      status: "error",
      attemptCount: 1,
      errorMessage: "Source request failed with HTTP 403.",
    });
  });

  it("rejects recovery URL replacement and content collisions without mutating the failed document", async () => {
    const failed = repository.persistSourceDocument({
      title: "Failed article",
      publisher: "Example Publisher",
      sourceUrl: "https://example.com/article",
      content:
        "URL import queued for secure retrieval: https://example.com/article",
    });
    repository.markSourceDocumentError(
      failed.id,
      "Source request failed with HTTP 403.",
    );
    const existingContent =
      "This excerpt is already stored as a distinct source document and must not be merged.";
    repository.persistSourceDocument({
      title: "Existing source",
      publisher: "Example Publisher",
      sourceUrl: "https://example.com/article",
      content: existingContent,
    });
    const analyzeImportedSource = vi.fn();
    const app = createApp({
      repository,
      services: { analyzeImportedSource },
    });

    const mismatched = await app.request(
      `/api/source-documents/${failed.id}/retry`,
      {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({
          sourceUrl: "https://different.example.com/article",
        }),
      },
    );
    expect(mismatched.status).toBe(409);
    await expect(mismatched.json()).resolves.toMatchObject({
      error: { code: "SOURCE_URL_MISMATCH" },
    });

    const collision = await app.request(
      `/api/source-documents/${failed.id}/retry`,
      {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ content: existingContent }),
      },
    );
    expect(collision.status).toBe(409);
    await expect(collision.json()).resolves.toMatchObject({
      error: { code: "DUPLICATE_SOURCE_DOCUMENT" },
    });
    expect(analyzeImportedSource).not.toHaveBeenCalled();
    expect(
      repository.getSourceDocumentForRecovery(failed.id),
    ).toMatchObject({
      id: failed.id,
      title: "Failed article",
      sourceUrl: "https://example.com/article",
      status: "error",
      attemptCount: 1,
    });
  });

  it("persists impact reviews across a database reopen", async () => {
    repository.close();
    const directory = mkdtempSync(join(tmpdir(), "relay-integration-"));
    const databasePath = join(directory, "relay.sqlite");

    try {
      let fileRepository = createRelayRepository(databasePath);
      let app = createApp({ repository: fileRepository });

      const accepted = await app.request(
        "/api/impacts/impact-vrt-backlog/review",
        {
          method: "POST",
          headers: JSON_HEADERS,
          body: JSON.stringify({
            decision: "accepted",
            reasonTags: ["useful-analysis"],
          }),
        },
      );
      expect(accepted.status).toBe(200);
      await expect(accepted.json()).resolves.toMatchObject({
        impactId: "impact-vrt-backlog",
        decision: "accepted",
      });
      fileRepository.close();

      fileRepository = createRelayRepository(databasePath);
      app = createApp({ repository: fileRepository });
      const persisted = await app.request("/api/updates/vrt-fy25-q4");
      await expect(persisted.json()).resolves.toMatchObject({
        thesisImpacts: [
          expect.objectContaining({
            id: "impact-vrt-backlog",
            review: expect.objectContaining({ decision: "accepted" }),
          }),
        ],
      });

      const rejected = await app.request(
        "/api/impacts/impact-vrt-backlog/review",
        {
          method: "POST",
          headers: JSON_HEADERS,
          body: JSON.stringify({
            decision: "rejected",
            reasonTags: ["overstated-materiality"],
          }),
        },
      );
      expect(rejected.status).toBe(200);
      await expect(rejected.json()).resolves.toMatchObject({
        impactId: "impact-vrt-backlog",
        decision: "rejected",
      });
      fileRepository.close();
    } finally {
      rmSync(directory, { force: true, recursive: true });
      repository = createRelayRepository(":memory:");
    }
  });

  it("persists accepted belief changes and their evidence across a database reopen", async () => {
    repository.close();
    const directory = mkdtempSync(join(tmpdir(), "relay-belief-integration-"));
    const databasePath = join(directory, "relay.sqlite");

    try {
      let fileRepository = createRelayRepository(databasePath);
      const thesis = fileRepository
        .listTheses()
        .find((candidate) => candidate.currentVersion.confidenceScore < 100);
      const update = fileRepository.getUpdate("vrt-fy25-q4");
      if (!thesis || !update?.claims[0]) {
        throw new Error("Expected seeded thesis and evidence fixtures.");
      }
      const priorConfidence = thesis.currentVersion.confidenceScore;
      const evaluation = fileRepository.persistThesisEvaluation({
        id: "persistent-api-thesis-evaluation",
        thesisId: thesis.id,
        outcome: "reinforced",
        summary: "The evidence reinforces the current belief.",
        rationale: "The cited operating evidence supports higher confidence.",
        proposedBelief: thesis.currentVersion.belief,
        proposedConfidenceScore: priorConfidence + 1,
        proposedUnknowns: thesis.currentVersion.unknowns,
        proposedStrengtheningConditions:
          thesis.currentVersion.strengtheningConditions,
        proposedWeakeningConditions:
          thesis.currentVersion.weakeningConditions,
        signalIds: [update.id],
        evidence: [
          {
            claimId: update.claims[0].id,
            stance: "supports",
            rationale: "The exact claim supports the current belief.",
          },
        ],
        model: "mock-evaluation-model",
      });
      let app = createApp({ repository: fileRepository });

      const accepted = await app.request(
        `/api/thesis-evaluations/${evaluation.id}/review`,
        {
          method: "POST",
          headers: JSON_HEADERS,
          body: JSON.stringify({ decision: "accepted" }),
        },
      );
      expect(accepted.status).toBe(200);
      await expect(accepted.json()).resolves.toMatchObject({
        id: evaluation.id,
        reviewStatus: "accepted",
        acceptedVersionId: expect.any(String),
      });
      fileRepository.close();

      fileRepository = createRelayRepository(databasePath);
      app = createApp({ repository: fileRepository });
      const detail = await app.request(`/api/theses/${thesis.id}`);
      expect(detail.status).toBe(200);
      await expect(detail.json()).resolves.toMatchObject({
        id: thesis.id,
        currentVersion: {
          confidenceScore: priorConfidence + 1,
          createdByEvaluationId: evaluation.id,
        },
        evidence: [
          expect.objectContaining({
            claimId: update.claims[0].id,
            stance: "supports",
            linkedByEvaluationId: evaluation.id,
          }),
        ],
        evaluations: [
          expect.objectContaining({
            id: evaluation.id,
            reviewStatus: "accepted",
          }),
        ],
      });
      fileRepository.close();
    } finally {
      rmSync(directory, { force: true, recursive: true });
      repository = createRelayRepository(":memory:");
    }
  });

  it("persists a generated brief and returns it on the next dashboard read", async () => {
    const generatedBrief: DailyBrief = {
      id: "brief-integration-generated",
      date: "2099-01-01",
      title: "Power becomes the binding constraint",
      summary: "The strongest evidence points to power-delivery bottlenecks.",
      signal: "Power equipment lead times remain elevated.",
      secondarySignals: ["Optical capacity remains tight."],
      updateIds: ["vrt-fy25-q4"],
      citationClaimIds: ["claim-vrt-backlog"],
      generatedAt: "2099-01-01T08:00:00.000Z",
      model: "mock-synthesis-model",
    };
    const generateBrief = vi.fn().mockResolvedValue(generatedBrief);
    const app = createApp({
      repository,
      services: { generateBrief },
    });

    const generated = await app.request("/api/briefs/generate", {
      method: "POST",
    });
    expect(generated.status).toBe(201);
    await expect(generated.json()).resolves.toEqual(generatedBrief);
    expect(repository.getBrief(generatedBrief.id)).toEqual(generatedBrief);

    const dashboard = await app.request("/api/dashboard");
    await expect(dashboard.json()).resolves.toMatchObject({
      brief: generatedBrief,
    });
    expect(generateBrief).toHaveBeenCalledOnce();
  });

  it("returns the refresh service result without reshaping it", async () => {
    const result = {
      imported: 3,
      analyzed: 2,
      errors: ["arXiv: one source could not be parsed"],
      items: [
        {
          sourceId: "arxiv-distributed-systems",
          sourceName: "arXiv — AI infrastructure systems",
          title: "Distributed inference paper",
          sourceUrl: "https://arxiv.org/abs/2606.00001",
          isNew: true,
          status: "analyzed" as const,
          updateId: "paper-update",
          error: null,
        },
      ],
    };
    const refreshSources = vi.fn().mockResolvedValue(result);
    const app = createApp({
      repository,
      services: { refreshSources },
    });

    const response = await app.request("/api/sources/refresh", {
      method: "POST",
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(result);
    expect(refreshSources).toHaveBeenCalledOnce();
  });

  it("uses JSON errors for unknown API routes and plain 404s elsewhere", async () => {
    const app = createApp({ repository });

    const apiResponse = await app.request("/api/does-not-exist");
    expect(apiResponse.status).toBe(404);
    await expect(apiResponse.json()).resolves.toEqual({
      error: {
        code: "ROUTE_NOT_FOUND",
        message: "The requested API route does not exist.",
      },
    });

    const browserResponse = await app.request("/does-not-exist");
    expect(browserResponse.status).toBe(404);
    expect(await browserResponse.text()).toBe("Not found");
  });
});

function makeAnalyzedUpdate(
  repository: RelayRepository,
  id: string,
  sourceUrl: string | null,
): IntelligenceUpdate {
  const seed = repository.getUpdate("vrt-fy25-q4");
  if (!seed) {
    throw new Error("Expected the seeded update fixture.");
  }

  return {
    ...seed,
    id,
    title: `Integration update ${id}`,
    sourceUrl,
    ingestedAt: "2026-06-27T12:00:00.000Z",
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
