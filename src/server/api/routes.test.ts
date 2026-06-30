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

  it("lists active beliefs and returns their versioned detail", async () => {
    const app = createApp({ repository });

    const listResponse = await app.request("/api/theses?kind=macro");
    expect(listResponse.status).toBe(200);
    const payload = (await listResponse.json()) as {
      theses: Array<{ id: string; kind: string }>;
    };
    expect(payload.theses.length).toBeGreaterThan(0);
    expect(payload.theses.every((thesis) => thesis.kind === "macro")).toBe(
      true,
    );

    const detailResponse = await app.request(
      `/api/theses/${payload.theses[0]?.id}`,
    );
    expect(detailResponse.status).toBe(200);
    await expect(detailResponse.json()).resolves.toMatchObject({
      id: payload.theses[0]?.id,
      kind: "macro",
      currentVersion: {
        id: expect.any(String),
        belief: expect.any(String),
        confidenceScore: expect.any(Number),
      },
      versions: expect.any(Array),
      evidence: expect.any(Array),
      evaluations: expect.any(Array),
    });
  });

  it("reviews a thesis evaluation and advances the accepted belief", async () => {
    const thesis = repository
      .listTheses()
      .find((candidate) => candidate.currentVersion.confidenceScore < 100);
    const update = repository.getUpdate("vrt-fy25-q4");
    if (!thesis || !update?.claims[0]) {
      throw new Error("Expected seeded thesis and evidence fixtures.");
    }
    const evaluation = repository.persistThesisEvaluation({
      id: "route-thesis-evaluation",
      thesisId: thesis.id,
      outcome: "reinforced",
      summary: "Independent evidence reinforces the current belief.",
      rationale: "The cited operating result supports the current belief.",
      proposedBelief: thesis.currentVersion.belief,
      proposedConfidenceScore:
        thesis.currentVersion.confidenceScore + 1,
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
          rationale: "The claim directly supports the belief.",
        },
      ],
      model: "mock-evaluation-model",
    });
    const app = createApp({ repository });

    const response = await app.request(
      `/api/thesis-evaluations/${evaluation.id}/review`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          decision: "accepted",
          note: "The cited evidence clears the confidence threshold.",
        }),
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      id: evaluation.id,
      reviewStatus: "accepted",
      acceptedVersionId: expect.any(String),
    });
    expect(
      repository.getThesis(thesis.id)?.currentVersion.confidenceScore,
    ).toBe(thesis.currentVersion.confidenceScore + 1);
    expect(repository.listThesisEvidence(thesis.id)).toEqual([
      expect.objectContaining({
        claimId: update.claims[0].id,
        stance: "supports",
        linkedByEvaluationId: evaluation.id,
      }),
    ]);
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

  it("records lightweight per-impact review feedback", async () => {
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
  });

  it("does not expose document-vault or evaluation-export routes", async () => {
    const app = createApp({ repository });
    const fileResponse = await app.request("/api/sources/file", {
      method: "POST",
    });
    expect(fileResponse.status).toBe(404);
    expect((await app.request("/api/reviews/export")).status).toBe(404);
    expect((await app.request("/api/reviews/summary")).status).toBe(404);
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
      items: [];
    }) => void) | undefined;
    const refreshSources = vi.fn(
      () =>
        new Promise<{
          imported: number;
          analyzed: number;
          errors: string[];
          items: [];
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
    releaseRefresh?.({ imported: 0, analyzed: 0, errors: [], items: [] });
    expect((await firstRequest).status).toBe(200);
  });

  it("coalesces concurrent thesis evaluation requests", async () => {
    let releaseEvaluation:
      | ((value: {
          evaluatedAt: string;
          model: string;
          evaluations: [];
        }) => void)
      | undefined;
    const evaluateTheses = vi.fn(
      () =>
        new Promise<{
          evaluatedAt: string;
          model: string;
          evaluations: [];
        }>((resolve) => {
          releaseEvaluation = resolve;
        }),
    );
    const app = createApp({
      repository,
      services: { evaluateTheses },
    });

    const firstRequest = app.request("/api/theses/evaluate", {
      method: "POST",
    });
    await vi.waitFor(() => {
      expect(evaluateTheses).toHaveBeenCalledOnce();
    });
    const secondResponse = await app.request("/api/theses/evaluate", {
      method: "POST",
    });

    expect(secondResponse.status).toBe(409);
    await expect(secondResponse.json()).resolves.toMatchObject({
      error: { code: "OPERATION_IN_PROGRESS" },
    });
    releaseEvaluation?.({
      evaluatedAt: "2026-06-30T08:00:00.000Z",
      model: "mock-evaluation-model",
      evaluations: [],
    });
    const firstResponse = await firstRequest;
    expect(firstResponse.status).toBe(201);
    await expect(firstResponse.json()).resolves.toEqual({
      evaluatedAt: "2026-06-30T08:00:00.000Z",
      model: "mock-evaluation-model",
      evaluations: [],
    });
  });

  it("adds and archives a watchlist company thesis", async () => {
    const app = createApp({ repository });
    const created = await app.request("/api/companies", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ticker: "CRDO",
        name: "Credo Technology",
        layerIds: ["networking"],
        thesis:
          "High-speed connectivity demand can sustain durable AI infrastructure growth.",
        confidence: "medium",
        provesRight: ["AI connectivity revenue grows faster than the market."],
        watchMetrics: ["AI connectivity revenue"],
      }),
    });

    expect(created.status).toBe(201);
    await expect(created.json()).resolves.toMatchObject({
      ticker: "CRDO",
      layerIds: ["networking"],
      confidence: "medium",
    });
    expect((await app.request("/api/companies/CRDO")).status).toBe(200);

    const archived = await app.request("/api/companies/CRDO", {
      method: "DELETE",
    });
    expect(archived.status).toBe(204);
    expect((await app.request("/api/companies/CRDO")).status).toBe(404);
  });

  it("adds and archives a refreshable research source", async () => {
    const app = createApp({ repository });
    const created = await app.request("/api/sources", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Custom systems feed",
        type: "rss",
        url: "https://example.com/systems.xml",
        layerIds: ["serving", "networking"],
        companyTickers: ["NVDA"],
      }),
    });

    expect(created.status).toBe(201);
    const source = (await created.json()) as { id: string };
    await expect(
      (await app.request(`/api/sources/${source.id}`)).json(),
    ).resolves.toMatchObject({
      name: "Custom systems feed",
      userAdded: true,
      enabled: true,
      layerIds: ["serving", "networking"],
      companyTickers: ["NVDA"],
    });

    expect(
      (
        await app.request(`/api/sources/${source.id}`, {
          method: "DELETE",
        })
      ).status,
    ).toBe(204);
    expect((await app.request(`/api/sources/${source.id}`)).status).toBe(404);
  });

  it("lists prior briefs and retrieves a selected brief", async () => {
    const app = createApp({ repository });
    const response = await app.request("/api/briefs?limit=5");
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      briefs: Array<{ id: string }>;
    };
    expect(payload.briefs.length).toBeGreaterThan(0);

    const brief = await app.request(`/api/briefs/${payload.briefs[0]?.id}`);
    expect(brief.status).toBe(200);
    await expect(brief.json()).resolves.toMatchObject({
      id: payload.briefs[0]?.id,
      updateIds: expect.any(Array),
    });
  });
});
