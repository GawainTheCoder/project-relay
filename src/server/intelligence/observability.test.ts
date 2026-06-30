import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildOpenAIResponseMetadata,
  shouldStoreOpenAIResponses,
} from "./observability.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("OpenAI response observability", () => {
  it("stores Responses by default and supports an explicit privacy opt-out", () => {
    expect(shouldStoreOpenAIResponses(undefined)).toBe(true);
    expect(shouldStoreOpenAIResponses("true")).toBe(true);
    expect(shouldStoreOpenAIResponses("false")).toBe(false);
    expect(shouldStoreOpenAIResponses("OFF")).toBe(false);
  });

  it("builds dashboard-searchable metadata within API limits", () => {
    vi.stubEnv("NODE_ENV", "test");
    const metadata = buildOpenAIResponseMetadata("signal_analysis", {
      relay_source_id: `source\u0000${"x".repeat(600)}`,
      relay_update_id: "update_1",
    });

    expect(metadata).toMatchObject({
      relay_app: "project-relay",
      relay_environment: "test",
      relay_operation: "signal_analysis",
      relay_schema_version: "thesis-aware-v1",
      relay_update_id: "update_1",
    });
    expect(metadata.relay_source_id).not.toContain("\u0000");
    expect(metadata.relay_source_id).toHaveLength(512);
    expect(Object.keys(metadata)).toHaveLength(6);
  });
});
