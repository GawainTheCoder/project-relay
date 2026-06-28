import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { IntelligenceUpdate } from "../../shared/contracts.js";

import { createApp } from "../app.js";
import {
  createRelayRepository,
  type RelayRepository,
} from "../db/repository.js";

describe("Relay API", () => {
  let repository: RelayRepository;

  beforeEach(() => {
    repository = createRelayRepository(":memory:");
  });

  afterEach(() => {
    repository.close();
  });

  it("returns the seeded dashboard and company thesis", async () => {
    const app = createApp({ repository });

    const dashboardResponse = await app.request("/api/dashboard");
    expect(dashboardResponse.status).toBe(200);
    const dashboard = (await dashboardResponse.json()) as {
      companies: unknown[];
      updates: unknown[];
    };
    expect(dashboard.companies).toHaveLength(13);
    expect(dashboard.updates).toHaveLength(7);

    const companyResponse = await app.request("/api/companies/nvda");
    expect(companyResponse.status).toBe(200);
    await expect(companyResponse.json()).resolves.toMatchObject({
      ticker: "NVDA",
      confidence: "high",
    });
  });

  it("searches persisted intelligence and validates query bounds", async () => {
    const app = createApp({ repository });

    const response = await app.request("/api/search?q=backlog&limit=5");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      query: "backlog",
      results: expect.arrayContaining([
        expect.objectContaining({
          type: "update",
          id: "vrt-fy25-q4",
        }),
        expect.objectContaining({
          type: "evidence",
          id: "claim-vrt-backlog",
        }),
      ]),
    });

    const invalid = await app.request("/api/search?q=x");
    expect(invalid.status).toBe(400);
    await expect(invalid.json()).resolves.toMatchObject({
      error: { code: "VALIDATION_ERROR" },
    });

    const escapedWildcards = await app.request("/api/search?q=%25_%25");
    expect(escapedWildcards.status).toBe(200);
    await expect(escapedWildcards.json()).resolves.toMatchObject({
      results: [],
    });
  });

  it("records per-impact review feedback and exports the evaluation dataset", async () => {
    const app = createApp({ repository });
    const response = await app.request(
      "/api/impacts/impact-vrt-backlog/review",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          decision: "accepted",
          reasonTags: ["useful-analysis"],
          note: "The conclusion is directly supported by backlog evidence.",
        }),
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      impactId: "impact-vrt-backlog",
      decision: "accepted",
      reasonTags: ["useful-analysis"],
    });
    expect(
      repository.getUpdate("vrt-fy25-q4")?.thesisImpacts[0]?.review,
    ).toMatchObject({ decision: "accepted" });

    const summary = await app.request("/api/reviews/summary");
    await expect(summary.json()).resolves.toMatchObject({
      total: 1,
      byDecision: { accepted: 1, rejected: 0, deferred: 0 },
    });

    const exported = await app.request("/api/reviews/export");
    expect(exported.headers.get("content-disposition")).toContain(
      "relay-evaluations-",
    );
    await expect(exported.json()).resolves.toMatchObject({
      schemaVersion: 1,
      summary: { total: 1 },
      reviews: [
        expect.objectContaining({
          impactId: "impact-vrt-backlog",
          snapshot: expect.objectContaining({
            update: expect.objectContaining({ id: "vrt-fy25-q4" }),
          }),
        }),
      ],
    });
  });

  it("imports local research files and makes their content searchable", async () => {
    const app = createApp({ repository });
    const formData = new FormData();
    formData.set(
      "file",
      new File(
        [
          "Optics qualification schedules point to tighter laser supply and longer lead times.",
        ],
        "optics-note.txt",
        { type: "text/plain" },
      ),
    );
    formData.set("title", "Personal optics note");
    formData.set("publisher", "Private research");
    formData.set("publishedAt", "");
    formData.set("sourceKind", "other");

    const response = await app.request("/api/sources/file", {
      method: "POST",
      body: formData,
    });
    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({
      duplicate: false,
      status: "pending",
    });

    const search = await app.request("/api/search?q=qualification%20schedules");
    await expect(search.json()).resolves.toMatchObject({
      results: expect.arrayContaining([
        expect.objectContaining({
          type: "document",
          title: "Personal optics note",
          matchedField: "source content",
        }),
      ]),
    });
  });

  it("rejects malformed PDFs and oversized multipart file imports", async () => {
    const app = createApp({ repository });
    const invalidPdf = new FormData();
    invalidPdf.set(
      "file",
      new File(["not a pdf"], "filing.pdf", {
        type: "application/pdf",
      }),
    );
    invalidPdf.set("title", "Invalid filing");
    invalidPdf.set("publisher", "Local QA");
    invalidPdf.set("publishedAt", "");
    invalidPdf.set("sourceKind", "sec-filing");

    const malformedResponse = await app.request("/api/sources/file", {
      method: "POST",
      body: invalidPdf,
    });
    expect(malformedResponse.status).toBe(400);
    await expect(malformedResponse.json()).resolves.toMatchObject({
      error: { code: "FILE_EXTRACTION_FAILED" },
    });

    const oversized = new FormData();
    oversized.set(
      "file",
      new File([new Uint8Array(10 * 1024 * 1024 + 200_000)], "large.txt", {
        type: "text/plain",
      }),
    );
    oversized.set("title", "Oversized research");
    oversized.set("publisher", "Local QA");
    oversized.set("publishedAt", "");
    oversized.set("sourceKind", "other");

    const oversizedResponse = await app.request("/api/sources/file", {
      method: "POST",
      body: oversized,
    });
    expect(oversizedResponse.status).toBe(413);
    await expect(oversizedResponse.json()).resolves.toMatchObject({
      error: { code: "PAYLOAD_TOO_LARGE" },
    });
  });

  it("persists and analyzes a manual import through the service hook", async () => {
    const baseUpdate = repository.getUpdate("nvda-dynamo-1");
    if (!baseUpdate) {
      throw new Error("Seed update missing");
    }
    const analyzedUpdate: IntelligenceUpdate = {
      ...baseUpdate,
      id: "analyzed-import",
      title: "Imported analysis",
      claims: baseUpdate.claims.map((claim) => ({
        ...claim,
        id: `import-${claim.id}`,
      })),
      thesisImpacts: baseUpdate.thesisImpacts.map((impact) => ({
        ...impact,
        id: `import-${impact.id}`,
      })),
    };
    const analyzeImportedSource = vi.fn().mockResolvedValue(analyzedUpdate);
    const app = createApp({
      repository,
      services: { analyzeImportedSource },
    });

    const response = await app.request("/api/sources/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Imported source",
        publisher: "Personal research",
        content:
          "A complete research note with enough content for Relay to analyze and persist safely.",
      }),
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      status: "analyzed",
      duplicate: false,
      update: { id: "analyzed-import" },
    });
    expect(analyzeImportedSource).toHaveBeenCalledOnce();
    expect(repository.getUpdate("analyzed-import")).not.toBeNull();
  });

  it("saves imports as pending when analysis is unavailable", async () => {
    const app = createApp({ repository });
    const response = await app.request("/api/sources/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Queued source",
        publisher: "Personal research",
        content:
          "A complete source document that should remain queued until analysis is configured.",
      }),
    });

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({
      status: "pending",
      duplicate: false,
    });
  });

  it("returns consistent JSON errors for missing resources and routes", async () => {
    const app = createApp({ repository });

    const missingCompany = await app.request("/api/companies/UNKNOWN");
    expect(missingCompany.status).toBe(404);
    await expect(missingCompany.json()).resolves.toEqual({
      error: {
        code: "COMPANY_NOT_FOUND",
        message: "The requested company does not exist.",
      },
    });

    const missingRoute = await app.request("/api/not-a-route");
    expect(missingRoute.status).toBe(404);
    await expect(missingRoute.json()).resolves.toMatchObject({
      error: { code: "ROUTE_NOT_FOUND" },
    });
  });

  it("rejects cross-site writes and untrusted request hosts", async () => {
    const app = createApp({ repository });

    const crossSite = await app.request(
      "/api/impacts/impact-vrt-backlog/review",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://attacker.example",
          "sec-fetch-site": "cross-site",
        },
        body: JSON.stringify({
          decision: "accepted",
          reasonTags: ["useful-analysis"],
        }),
      },
    );
    expect(crossSite.status).toBe(403);
    await expect(crossSite.json()).resolves.toMatchObject({
      error: { code: "CROSS_SITE_REQUEST" },
    });

    const untrustedHost = await app.request(
      "http://relay.attacker.example/api/dashboard",
    );
    expect(untrustedHost.status).toBe(403);
    await expect(untrustedHost.json()).resolves.toMatchObject({
      error: { code: "HOST_NOT_ALLOWED" },
    });

    const localDevOrigin = await app.request(
      "http://127.0.0.1:8787/api/impacts/impact-vrt-backlog/review",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://127.0.0.1:5173",
          "sec-fetch-site": "same-origin",
        },
        body: JSON.stringify({
          decision: "accepted",
          reasonTags: ["useful-analysis"],
        }),
      },
    );
    expect(localDevOrigin.status).toBe(200);
  });

  it("limits API bodies before JSON parsing", async () => {
    const app = createApp({ repository });
    const response = await app.request("/api/sources/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Oversized",
        publisher: "Personal research",
        content: "x".repeat(1_200_000),
      }),
    });

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "PAYLOAD_TOO_LARGE" },
    });
  });

  it("accepts only credential-free HTTP source URLs", async () => {
    const app = createApp({ repository });
    const response = await app.request("/api/sources/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Unsafe URL",
        publisher: "Personal research",
        sourceUrl: "https://user:password@example.com/report",
      }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "VALIDATION_ERROR" },
    });
  });

  it("coalesces concurrent source refresh requests", async () => {
    let releaseRefresh: ((value: {
      imported: number;
      analyzed: number;
      errors: string[];
    }) => void) | undefined;
    const refreshSources = vi.fn(
      () =>
        new Promise<{
          imported: number;
          analyzed: number;
          errors: string[];
        }>((resolve) => {
          releaseRefresh = resolve;
        }),
    );
    const app = createApp({
      repository,
      services: { refreshSources },
    });

    const firstRequest = app.request("/api/sources/refresh", {
      method: "POST",
    });
    await vi.waitFor(() => {
      expect(refreshSources).toHaveBeenCalledOnce();
    });
    const secondResponse = await app.request("/api/sources/refresh", {
      method: "POST",
    });

    expect(secondResponse.status).toBe(409);
    await expect(secondResponse.json()).resolves.toMatchObject({
      error: { code: "OPERATION_IN_PROGRESS" },
    });
    releaseRefresh?.({ imported: 0, analyzed: 0, errors: [] });
    expect((await firstRequest).status).toBe(200);
  });
});
