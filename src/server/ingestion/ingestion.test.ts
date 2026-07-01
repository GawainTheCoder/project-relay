import { describe, expect, it, vi } from "vitest";
import { gzipSync } from "node:zlib";

import {
  canonicalizeUrl,
  normalizeManualDocument,
} from "./normalize.js";
import {
  decodeBoundedBodyBytes,
  isPrivateOrReservedIp,
  secureFetchText,
  validateRemoteUrl,
  type HostResolver,
} from "./network.js";
import {
  deduplicateRssEntries,
  parseRssFeed,
} from "./rss.js";
import { ingestUrl } from "./url.js";

const publicResolver: HostResolver = async () => [
  { address: "93.184.216.34", family: 4 },
];

describe("manual document normalization", () => {
  it("creates stable paragraphs and removes tracking parameters", () => {
    const document = normalizeManualDocument(
      {
        title: "  Infrastructure   update ",
        publisher: " Example ",
        sourceUrl:
          "https://example.com/report/?utm_source=email&b=2&a=1#section",
        content: "First exact paragraph.\r\n\r\nSecond exact paragraph.",
      },
      {
        sourceId: "source_1",
        now: () => new Date("2026-06-27T00:00:00.000Z"),
      },
    );

    expect(document.title).toBe("Infrastructure update");
    expect(document.sourceUrl).toBe("https://example.com/report?a=1&b=2");
    expect(document.paragraphs).toEqual([
      { locator: "P1", text: "First exact paragraph." },
      { locator: "P2", text: "Second exact paragraph." },
    ]);
  });

  it("rejects non-web source URLs", () => {
    expect(() => canonicalizeUrl("file:///etc/passwd")).toThrow(
      "Only HTTP and HTTPS",
    );
  });
});

describe("SSRF-safe source fetching", () => {
  it.each([
    "127.0.0.1",
    "10.0.0.8",
    "169.254.169.254",
    "172.16.0.1",
    "192.168.1.1",
    "198.51.100.3",
    "203.0.113.4",
    "::1",
    "fc00::1",
    "fe80::1",
    "fec0::1",
  ])("blocks private or reserved address %s", (address) => {
    expect(isPrivateOrReservedIp(address)).toBe(true);
  });

  it("permits a resolved public web URL", async () => {
    await expect(
      validateRemoteUrl("https://example.com/report", publicResolver),
    ).resolves.toBe("https://example.com/report");
  });

  it("rejects malformed resolver results and mixed public-private answers", async () => {
    await expect(
      validateRemoteUrl("https://example.com/report", async () => [
        { address: "93.184.216.34", family: 6 },
      ]),
    ).rejects.toThrow("invalid address");

    await expect(
      validateRemoteUrl("https://example.com/report", async () => [
        { address: "93.184.216.34", family: 4 },
        { address: "127.0.0.1", family: 4 },
      ]),
    ).rejects.toThrow("private or reserved");
  });

  it("blocks redirects to private hosts before the second request", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location: "http://metadata.internal/latest" },
      }),
    );
    const resolver: HostResolver = async (hostname) =>
      hostname === "example.com"
        ? [{ address: "93.184.216.34", family: 4 }]
        : [{ address: "169.254.169.254", family: 4 }];

    await expect(
      secureFetchText("https://example.com/start", {
        fetchImpl,
        resolveHost: resolver,
      }),
    ).rejects.toThrow("Private source hosts");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("cancels redirect response bodies before following", async () => {
    let redirectBodyCancelled = false;
    const redirectBody = new ReadableStream({
      cancel() {
        redirectBodyCancelled = true;
      },
    });
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(redirectBody, {
          status: 302,
          headers: { location: "/final" },
        }),
      )
      .mockResolvedValueOnce(
        new Response("Finished", {
          status: 200,
          headers: { "content-type": "text/plain" },
        }),
      );

    await expect(
      secureFetchText("https://example.com/start", {
        fetchImpl,
        resolveHost: publicResolver,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        body: "Finished",
        finalUrl: "https://example.com/final",
      }),
    );
    expect(redirectBodyCancelled).toBe(true);
  });

  it("rejects oversized bodies from response metadata", async () => {
    let bodyCancelled = false;
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(new ReadableStream({
        cancel() {
          bodyCancelled = true;
        },
      }), {
        status: 200,
        headers: {
          "content-type": "text/plain",
          "content-length": "2001",
        },
      }),
    );

    await expect(
      secureFetchText("https://example.com/report", {
        fetchImpl,
        resolveHost: publicResolver,
        maxBodyBytes: 2000,
      }),
    ).rejects.toThrow("size limit");
    expect(bodyCancelled).toBe(true);
  });

  it("decodes compressed feed bodies with a decoded-size boundary", () => {
    const xml = "<?xml version=\"1.0\"?><rss><channel /></rss>";
    const compressed = gzipSync(xml);

    expect(
      decodeBoundedBodyBytes(compressed, "gzip", 1_000),
    ).toBe(xml);
    expect(() =>
      decodeBoundedBodyBytes(compressed, "gzip", 10)
    ).toThrow("safely decompressed");
    expect(() =>
      decodeBoundedBodyBytes(compressed, "compress", 1_000)
    ).toThrow("Unsupported source content encoding");
  });
});

describe("URL ingestion", () => {
  it("extracts readable HTML into a normalized document", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        `<!doctype html><html><head><title>Optics report</title></head>
        <body><article><h1>Optics report</h1>
        <p>Orders for optical components increased.</p>
        <p>Lead times remain elevated.</p></article></body></html>`,
        {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
        },
      ),
    );

    const document = await ingestUrl(
      { url: "https://example.com/optics", publisher: "Example" },
      {
        fetchImpl,
        resolveHost: publicResolver,
        now: () => new Date("2026-06-27T00:00:00.000Z"),
      },
    );

    expect(document.title).toBe("Optics report");
    expect(document.content).toContain("Orders for optical components increased.");
    expect(document.sourceUrl).toBe("https://example.com/optics");
  });
});

describe("RSS and Atom ingestion", () => {
  it("parses Atom releases and deduplicates normalized URLs", () => {
    const xml = `<?xml version="1.0"?>
      <feed xmlns="http://www.w3.org/2005/Atom">
        <entry>
          <id>tag:github.com,2008:Release/1</id>
          <title>v1.0</title>
          <link rel="alternate" href="https://github.com/example/repo/releases/tag/v1?utm_source=rss"/>
          <updated>2026-06-27T00:00:00Z</updated>
          <content type="html">&lt;p&gt;Faster serving.&lt;/p&gt;</content>
        </entry>
        <entry>
          <id>tag:github.com,2008:Release/2</id>
          <title>v1.0 duplicate</title>
          <link href="https://github.com/example/repo/releases/tag/v1"/>
          <updated>2026-06-27T01:00:00Z</updated>
        </entry>
      </feed>`;

    const entries = parseRssFeed(
      xml,
      "Example releases",
      "https://github.com/example/repo/releases.atom",
    );
    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual(
      expect.objectContaining({
        title: "v1.0",
        content: "Faster serving.",
      }),
    );
  });

  it("deduplicates entries from multiple feeds by canonical URL", () => {
    const entries = deduplicateRssEntries([
      {
        externalId: "1",
        title: "One",
        publisher: "A",
        sourceUrl: "https://example.com/post?utm_source=a",
        publishedAt: "2026-06-27T00:00:00.000Z",
        content: "One",
      },
      {
        externalId: "2",
        title: "Two",
        publisher: "B",
        sourceUrl: "https://example.com/post",
        publishedAt: "2026-06-27T00:00:00.000Z",
        content: "Two",
      },
    ]);
    expect(entries).toHaveLength(1);
  });
});
