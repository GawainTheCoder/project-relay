import { afterEach, describe, expect, it } from "vitest";

import {
  createRelayRepository,
  type RelayRepository,
} from "../db/repository.js";
import {
  LocalSearchService,
  MAX_SEARCH_QUERY_LENGTH,
  MAX_SEARCH_RESULT_LIMIT,
} from "./search.js";

describe("LocalSearchService", () => {
  let repository: RelayRepository | undefined;

  afterEach(() => {
    repository?.close();
    repository = undefined;
  });

  it("ranks and deduplicates matches across updates, evidence, companies, and briefs", () => {
    repository = createRelayRepository(":memory:");
    const search = new LocalSearchService(repository.database);

    const results = search.search("backlog");

    expect(results.length).toBeGreaterThan(2);
    expect(results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "update",
          id: "vrt-fy25-q4",
          matchedField: "title",
          href: "/updates?update=vrt-fy25-q4",
        }),
        expect.objectContaining({
          type: "evidence",
          id: "claim-vrt-backlog",
          matchedField: "evidence quote",
        }),
        expect.objectContaining({
          type: "company",
          id: "VRT",
          matchedField: "watch metrics",
        }),
        expect.objectContaining({
          type: "brief",
          id: "brief-2026-06-27",
        }),
      ]),
    );
    expect(new Set(results.map((result) => `${result.type}:${result.id}`))
      .size).toBe(results.length);
  });

  it("searches imported source titles, publishers, and full content", () => {
    repository = createRelayRepository(":memory:");
    const document = repository.persistSourceDocument({
      title: "Independent optics field note",
      publisher: "Personal research",
      content:
        "Laser qualification schedules point to tighter transceiver availability.",
    });
    const search = new LocalSearchService(repository.database);

    expect(search.search("laser qualification")).toContainEqual(
      expect.objectContaining({
        type: "document",
        id: document.id,
        title: "Independent optics field note",
        matchedField: "source content",
        href: `/sources?document=${document.id}`,
      }),
    );
  });

  it("finds company theses and watch metrics with an actionable company link", () => {
    repository = createRelayRepository(":memory:");
    const search = new LocalSearchService(repository.database);

    expect(search.search("CoWoS capacity")).toContainEqual(
      expect.objectContaining({
        type: "company",
        id: "TSM",
        href: "/companies/TSM",
        matchedField: "watch metrics",
      }),
    );
    expect(search.search("  TSM  ", { limit: 1 })).toEqual([
      expect.objectContaining({
        type: "company",
        id: "TSM",
        matchedField: "ticker",
      }),
    ]);
  });

  it("applies query and result-limit boundaries", () => {
    repository = createRelayRepository(":memory:");
    const search = new LocalSearchService(repository.database);

    expect(() => search.search(" ")).toThrow(
      "Search queries must contain at least 2 characters.",
    );
    expect(() => search.search("x".repeat(MAX_SEARCH_QUERY_LENGTH + 1))).toThrow(
      `Search queries must contain at most ${MAX_SEARCH_QUERY_LENGTH} characters.`,
    );
    expect(() =>
      search.search("power", { limit: MAX_SEARCH_RESULT_LIMIT + 1 }),
    ).toThrow(
      `Search result limits must be integers from 1 to ${MAX_SEARCH_RESULT_LIMIT}.`,
    );
    expect(search.search("power", { limit: 2 })).toHaveLength(2);
    expect(search.search("%_")).toEqual([]);
  });

  it("returns no results without failure in an empty personal workspace", () => {
    repository = createRelayRepository(":memory:", { seed: false });
    const search = new LocalSearchService(repository.database);

    expect(search.search("power")).toEqual([]);
  });
});
