import { describe, expect, it } from "vitest";

import { app } from "./app";

describe("health endpoint", () => {
  it("reports that the service is healthy", async () => {
    const response = await app.request("/api/health");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-security-policy")).toContain(
      "default-src 'self'",
    );
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    await expect(response.json()).resolves.toEqual({
      service: "relay",
      status: "ok",
    });
  });
});
