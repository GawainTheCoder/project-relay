import { describe, expect, it } from "vitest";

import { normalizeTrustedWebsite } from "./source-profile";

describe("normalizeTrustedWebsite", () => {
  it("accepts a domain and creates a public HTTPS URL", () => {
    expect(normalizeTrustedWebsite("www.semianalysis.com")).toEqual({
      domain: "semianalysis.com",
      publicUrl: "https://www.semianalysis.com",
    });
  });

  it("keeps a publisher profile path while removing tracking details", () => {
    expect(
      normalizeTrustedWebsite(
        "https://example.com/research/?utm_source=relay#latest",
      ),
    ).toEqual({
      domain: "example.com",
      publicUrl: "https://example.com/research",
    });
  });

  it("rejects credentials and unsupported protocols", () => {
    expect(normalizeTrustedWebsite("https://user:pass@example.com")).toBeNull();
    expect(normalizeTrustedWebsite("file:///tmp/source")).toBeNull();
  });
});
