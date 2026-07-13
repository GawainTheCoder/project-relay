import { describe, expect, it } from "vitest";

import { legacyDashboardRedirect } from "./navigation";

describe("legacy dashboard routes", () => {
  it("preserves old brief archive and direct-brief bookmarks", () => {
    expect(legacyDashboardRedirect("?archive=briefs")).toBe(
      "/today?archive=briefs",
    );
    expect(legacyDashboardRedirect("?brief=brief-2026-07-14")).toBe(
      "/today?brief=brief-2026-07-14",
    );
  });

  it("keeps ordinary root queries on the dashboard", () => {
    expect(legacyDashboardRedirect("?source=bookmark")).toBeNull();
  });
});
