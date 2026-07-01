import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../app.js";
import {
  createRelayRepository,
  type RelayRepository,
} from "../db/repository.js";

describe("company thesis route compatibility", () => {
  let repository: RelayRepository;

  beforeEach(() => {
    repository = createRelayRepository(":memory:");
  });

  afterEach(() => {
    repository.close();
  });

  it("resolves a legacy ticker URL to the canonical active company thesis", async () => {
    const app = createApp({ repository });

    const canonicalResponse = await app.request(
      "/api/theses/company-nvda",
    );
    const uppercaseAliasResponse = await app.request("/api/theses/NVDA");
    const lowercaseAliasResponse = await app.request("/api/theses/nvda");

    expect(canonicalResponse.status).toBe(200);
    expect(uppercaseAliasResponse.status).toBe(200);
    expect(lowercaseAliasResponse.status).toBe(200);

    const canonicalThesis = await canonicalResponse.json();
    await expect(uppercaseAliasResponse.json()).resolves.toEqual(
      canonicalThesis,
    );
    await expect(lowercaseAliasResponse.json()).resolves.toEqual(
      canonicalThesis,
    );
    expect(canonicalThesis).toMatchObject({
      id: "company-nvda",
      kind: "company",
      companyTickers: ["NVDA"],
    });
  });

  it("prefers an exact thesis id before interpreting it as a ticker alias", async () => {
    repository.createThesis({
      id: "NVDA",
      kind: "company",
      title: "Exact-ID compatibility fixture",
      belief: "Exact thesis IDs must take precedence over ticker aliases.",
      confidenceScore: 50,
      unknowns: [],
      strengtheningConditions: ["The exact route returns this thesis."],
      weakeningConditions: [],
      companyTickers: ["AMD"],
      layerIds: ["accelerators"],
    });
    const app = createApp({ repository });

    const response = await app.request("/api/theses/NVDA");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      id: "NVDA",
      title: "Exact-ID compatibility fixture",
      companyTickers: ["AMD"],
    });
  });

  it("does not accept a source-impact id as a thesis-evaluation review id", async () => {
    const app = createApp({ repository });
    const seededUpdate = repository
      .listUpdates()
      .find((update) =>
        update.thesisImpacts.some(
          (impact) => impact.decision === "proposed",
        ),
      );
    const seededImpact = seededUpdate?.thesisImpacts.find(
      (impact) => impact.decision === "proposed",
    );
    if (!seededUpdate || !seededImpact) {
      throw new Error("Expected a seeded proposed company impact.");
    }

    const response = await app.request(
      `/api/thesis-evaluations/${seededImpact.id}/review`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision: "accepted" }),
      },
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "THESIS_EVALUATION_NOT_FOUND" },
    });
    expect(
      repository
        .getUpdate(seededUpdate.id)
        ?.thesisImpacts.find(
          (impact) => impact.id === seededImpact.id,
        )?.review,
    ).toBeFalsy();
  });
});
