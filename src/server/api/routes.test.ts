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
      sourceCoverage: Array<{
        thesisId: string;
        status: string;
        sources: unknown[];
      }>;
    };
    expect(dashboard.companies).toHaveLength(13);
    expect(dashboard.updates).toHaveLength(7);
    expect(dashboard.sourceCoverage).toHaveLength(6);
    expect(dashboard.sourceCoverage.map((entry) => entry.thesisId)).toEqual([
      "macro-memory-bottleneck",
      "macro-networking-bottleneck",
      "macro-optics-supply",
      "macro-power-cooling",
      "macro-custom-silicon",
      "macro-inference-portability",
    ]);
    expect(
      dashboard.sourceCoverage.every((entry) =>
        ["automated", "manual-only", "missing"].includes(entry.status) &&
        Array.isArray(entry.sources),
      ),
    ).toBe(true);

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
    expect(
      repository.listRequeuedThesisEvaluationUpdates().map(
        (update) => update.id,
      ),
    ).toContain("vrt-fy25-q4");
  });

  it("invalidates pending evaluations when their signal is marked not material", async () => {
    const update = repository.getUpdate("vrt-fy25-q4");
    const companyThesis = repository.getThesis("company-vrt");
    const macroThesis = repository.getThesis("macro-power-cooling");
    if (!update?.claims[0] || !companyThesis || !macroThesis) {
      throw new Error("Expected review reconciliation fixtures.");
    }
    const persistEvaluation = (
      id: string,
      thesis: typeof companyThesis,
    ) =>
      repository.persistThesisEvaluation({
        id,
        thesisId: thesis.id,
        outcome: "reinforced",
        summary: "The signal reinforces the thesis.",
        rationale: "The exact claim supports a modest confidence increase.",
        proposedBelief: thesis.currentVersion.belief,
        proposedConfidenceScore:
          thesis.currentVersion.confidenceScore + 1,
        proposedUnknowns: thesis.currentVersion.unknowns,
        proposedStrengtheningConditions:
          thesis.currentVersion.strengtheningConditions,
        proposedWeakeningConditions:
          thesis.currentVersion.weakeningConditions,
        signalIds: [update.id],
        evidence: [{
          claimId: update.claims[0]!.id,
          stance: "supports",
          rationale: "Direct evidence.",
        }],
      });
    const companyEvaluation = persistEvaluation(
      "route-invalidated-company",
      companyThesis,
    );
    const macroEvaluation = persistEvaluation(
      "route-invalidated-macro",
      macroThesis,
    );
    const app = createApp({ repository });
    const response = await app.request(
      "/api/impacts/impact-vrt-backlog/review",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          decision: "rejected",
          reasonTags: ["overstated-materiality"],
        }),
      },
    );

    expect(response.status).toBe(200);
    expect(
      repository.getThesisEvaluation(companyEvaluation.id)?.reviewStatus,
    ).toBe("rejected");
    expect(
      repository.getThesisEvaluation(macroEvaluation.id)?.reviewStatus,
    ).toBe("rejected");
    expect(repository.listRequeuedThesisEvaluationUpdates()).toEqual([]);
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
    const sourceProfile = repository.addSourceProfile({
      name: "Trusted pasted research",
      domain: "trusted-research.example.com",
      publicUrl: "https://trusted-research.example.com",
      role: "primary",
      authorityTier: "specialist",
      layerIds: ["serving"],
    });
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
        sourceProfileId: sourceProfile.id,
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
    expect(analyzeImportedSource).toHaveBeenCalledWith(
      expect.objectContaining({ sourceProfileId: sourceProfile.id }),
    );
    expect(repository.getUpdate("analyzed-import")).not.toBeNull();
    expect(
      repository.getResearchSourceIdForUpdate("analyzed-import"),
    ).toBe(sourceProfile.id);
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

  it("attributes URL signals to built-in profiles and rejects invalid profile selections", async () => {
    const seed = repository.getUpdate("mu-hbm4-ramp");
    if (!seed) {
      throw new Error("Seed update missing");
    }
    const analyzedUpdate: IntelligenceUpdate = {
      ...seed,
      id: "profile-attributed-url",
      claims: seed.claims.map((claim) => ({
        ...claim,
        id: `profile-url-${claim.id}`,
      })),
      thesisImpacts: seed.thesisImpacts.map((impact) => ({
        ...impact,
        id: `profile-url-${impact.id}`,
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
        title: "Micron HBM update",
        publisher: "Micron",
        sourceUrl: "https://investors.micron.com/news/hbm",
        sourceProfileId: "micron-ir",
      }),
    });

    expect(response.status).toBe(201);
    expect(
      repository.getResearchSourceIdForUpdate(analyzedUpdate.id),
    ).toBe("micron-ir");
    expect(analyzeImportedSource).toHaveBeenCalledWith(
      expect.objectContaining({ sourceProfileId: "micron-ir" }),
    );

    const automatedFeed = await app.request("/api/sources/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Invalid feed attribution",
        publisher: "TrendForce",
        sourceUrl: "https://www.trendforce.com/report",
        sourceProfileId: "trendforce-semiconductors-feed",
      }),
    });
    expect(automatedFeed.status).toBe(400);
    await expect(automatedFeed.json()).resolves.toMatchObject({
      error: { code: "INVALID_SOURCE_PROFILE" },
    });

    const mismatchedDomain = await app.request("/api/sources/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Mismatched attribution",
        publisher: "Unknown",
        sourceUrl: "https://example.com/report",
        sourceProfileId: "micron-ir",
      }),
    });
    expect(mismatchedDomain.status).toBe(400);
    await expect(mismatchedDomain.json()).resolves.toMatchObject({
      error: { code: "INVALID_SOURCE_PROFILE" },
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

  it("registers a trusted website profile and includes it in thesis coverage", async () => {
    const app = createApp({ repository });
    const created = await app.request("/api/source-profiles", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Independent memory research",
        domain: "memory.example.com",
        publicUrl: "https://memory.example.com/research/",
        role: "primary",
        authorityTier: "specialist",
        layerIds: ["memory"],
        companyTickers: ["MU"],
        thesisIds: ["macro-memory-bottleneck"],
      }),
    });

    expect(created.status).toBe(201);
    const profile = (await created.json()) as { id: string };
    await expect(
      (await app.request(`/api/sources/${profile.id}`)).json(),
    ).resolves.toMatchObject({
      id: profile.id,
      type: "manual",
      domain: "memory.example.com",
      role: "primary",
      authorityTier: "specialist",
      enabled: false,
      thesisIds: ["macro-memory-bottleneck"],
    });
    const dashboard = (await (
      await app.request("/api/dashboard")
    ).json()) as {
      sourceCoverage: Array<{
        thesisId: string;
        sources: Array<{ id: string }>;
      }>;
    };
    expect(
      dashboard.sourceCoverage
        .find((entry) => entry.thesisId === "macro-memory-bottleneck")
        ?.sources,
    ).toContainEqual(expect.objectContaining({ id: profile.id }));
  });

  it("refreshes one automated source and rejects manual source profiles", async () => {
    const refreshSource = vi.fn().mockResolvedValue({
      imported: 1,
      analyzed: 1,
      errors: [],
      items: [],
    });
    const app = createApp({
      repository,
      services: { refreshSource },
    });

    const refreshed = await app.request(
      "/api/sources/the-next-platform/refresh",
      { method: "POST" },
    );
    expect(refreshed.status).toBe(200);
    expect(refreshSource).toHaveBeenCalledWith("the-next-platform");

    const profile = repository.addSourceProfile({
      name: "Manual specialist",
      domain: "specialist.example.com",
      publicUrl: "https://specialist.example.com/",
      role: "primary",
      authorityTier: "specialist",
    });
    const rejected = await app.request(
      `/api/sources/${profile.id}/refresh`,
      { method: "POST" },
    );
    expect(rejected.status).toBe(409);
    await expect(rejected.json()).resolves.toMatchObject({
      error: { code: "SOURCE_NOT_REFRESHABLE" },
    });
  });

  it("deletes an uncommitted signal but protects accepted thesis evidence", async () => {
    const app = createApp({ repository });

    expect(
      (
        await app.request("/api/updates/mu-hbm4-ramp", {
          method: "DELETE",
        })
      ).status,
    ).toBe(204);
    expect((await app.request("/api/updates/mu-hbm4-ramp")).status).toBe(404);

    const thesis = repository.getThesis("company-nvda");
    const update = repository.getUpdate("nvda-fy26-q4");
    if (!thesis || !update?.claims[0]) {
      throw new Error("Expected accepted-evidence fixtures.");
    }
    const evaluation = repository.persistThesisEvaluation({
      id: "route-protected-evaluation",
      thesisId: thesis.id,
      outcome: "reinforced",
      summary: "The signal reinforces the thesis.",
      rationale: "The exact claim supports a modest confidence increase.",
      proposedBelief: thesis.currentVersion.belief,
      proposedConfidenceScore: thesis.currentVersion.confidenceScore + 1,
      proposedUnknowns: thesis.currentVersion.unknowns,
      proposedStrengtheningConditions:
        thesis.currentVersion.strengtheningConditions,
      proposedWeakeningConditions:
        thesis.currentVersion.weakeningConditions,
      signalIds: [update.id],
      evidence: [{
        claimId: update.claims[0].id,
        stance: "supports",
        rationale: "Direct evidence.",
      }],
    });
    repository.reviewThesisEvaluation(evaluation.id, {
      decision: "accepted",
    });

    const protectedResponse = await app.request(
      "/api/updates/nvda-fy26-q4",
      { method: "DELETE" },
    );
    expect(protectedResponse.status).toBe(409);
    await expect(protectedResponse.json()).resolves.toMatchObject({
      error: { code: "UPDATE_IN_USE" },
    });
  });

  it("queues an eligible signal for thesis re-evaluation idempotently", async () => {
    const requeueSignalThesisEvaluation = vi
      .fn()
      .mockResolvedValueOnce({
        updateId: "nvda-fy26-q4",
        requestedAt: "2026-07-01T09:00:00.000Z",
        alreadyQueued: false,
        invalidatedEvaluationIds: ["older-proposal"],
        macroRouteCount: 3,
        routesClassified: true,
      })
      .mockResolvedValueOnce({
        updateId: "nvda-fy26-q4",
        requestedAt: "2026-07-01T09:00:00.000Z",
        alreadyQueued: true,
        invalidatedEvaluationIds: [],
        macroRouteCount: 3,
        routesClassified: false,
      });
    const app = createApp({
      repository,
      services: { requeueSignalThesisEvaluation },
    });

    const first = await app.request(
      "/api/updates/nvda-fy26-q4/requeue-thesis-evaluation",
      { method: "POST" },
    );
    expect(first.status).toBe(201);
    await expect(first.json()).resolves.toMatchObject({
      alreadyQueued: false,
      invalidatedEvaluationIds: ["older-proposal"],
      macroRouteCount: 3,
      routesClassified: true,
    });

    const repeated = await app.request(
      "/api/updates/nvda-fy26-q4/requeue-thesis-evaluation",
      { method: "POST" },
    );
    expect(repeated.status).toBe(200);
    await expect(repeated.json()).resolves.toMatchObject({
      alreadyQueued: true,
      invalidatedEvaluationIds: [],
      macroRouteCount: 3,
      routesClassified: false,
    });
    expect(requeueSignalThesisEvaluation).toHaveBeenCalledTimes(2);
  });

  it("keeps a deleted signal suppressed when the same document is imported again", async () => {
    const content =
      "Micron reported the same high-volume HBM production milestone.";
    const document = repository.persistSourceDocument({
      title: "Micron production update",
      publisher: "Micron",
      sourceUrl: "https://investors.micron.com/news/hbm4",
      content,
      researchSourceId: "micron-ir",
    });
    repository.markSourceDocumentAnalyzed(document.id, "mu-hbm4-ramp");
    const app = createApp({ repository });

    expect(
      (
        await app.request("/api/updates/mu-hbm4-ramp", {
          method: "DELETE",
        })
      ).status,
    ).toBe(204);
    const reimported = await app.request("/api/sources/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Micron production update",
        publisher: "Micron",
        sourceUrl: "https://investors.micron.com/news/hbm4",
        content,
      }),
    });

    expect(reimported.status).toBe(200);
    await expect(reimported.json()).resolves.toMatchObject({
      documentId: document.id,
      duplicate: true,
      status: "suppressed",
    });
    expect(repository.getUpdate("mu-hbm4-ramp")).toBeNull();
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
