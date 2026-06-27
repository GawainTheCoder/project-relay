import { createHash } from "node:crypto";

import { XMLParser } from "fast-xml-parser";
import { parseHTML } from "linkedom";

import { canonicalizeUrl } from "./normalize.js";
import {
  secureFetchText,
  type SecureFetchOptions,
} from "./network.js";
import type {
  PublicSourceDefinition,
  RssEntry,
} from "./types.js";

const RSS_CONTENT_TYPES = [
  "application/rss+xml",
  "application/atom+xml",
  "application/xml",
  "text/xml",
] as const;

export const PUBLIC_SOURCE_REGISTRY: readonly PublicSourceDefinition[] = [
  {
    id: "arxiv-distributed-systems",
    name: "arXiv — Distributed, Parallel, and Cluster Computing",
    type: "paper",
    url: "https://rss.arxiv.org/rss/cs.DC",
    enabledByDefault: true,
  },
  {
    id: "the-next-platform",
    name: "The Next Platform",
    type: "rss",
    url: "https://www.nextplatform.com/feed/",
    enabledByDefault: true,
  },
  {
    id: "cloudflare-technical-blog",
    name: "Cloudflare Technical Blog",
    type: "rss",
    url: "https://blog.cloudflare.com/rss/",
    enabledByDefault: false,
  },
  {
    id: "vllm-releases",
    name: "vLLM releases",
    type: "release",
    url: "https://github.com/vllm-project/vllm/releases.atom",
    enabledByDefault: true,
  },
  {
    id: "sglang-releases",
    name: "SGLang releases",
    type: "release",
    url: "https://github.com/sgl-project/sglang/releases.atom",
    enabledByDefault: true,
  },
] as const;

export async function fetchRssSource(
  source: PublicSourceDefinition,
  options: SecureFetchOptions = {},
): Promise<RssEntry[]> {
  const result = await secureFetchText(source.url, {
    ...options,
    acceptedContentTypes: RSS_CONTENT_TYPES,
  });
  return parseRssFeed(result.body, source.name, result.finalUrl);
}

export function parseRssFeed(
  xml: string,
  publisher: string,
  feedUrl: string,
): RssEntry[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "",
    trimValues: true,
  });
  const parsed = parser.parse(xml) as unknown;
  if (!isRecord(parsed)) {
    throw new Error("RSS feed is malformed.");
  }

  const candidates = extractCandidates(parsed);
  const entries: RssEntry[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (!isRecord(candidate)) {
      continue;
    }
    const title = textValue(candidate.title).trim();
    const rawLink = linkValue(candidate.link);
    if (!title || !rawLink) {
      continue;
    }

    let sourceUrl: string;
    try {
      sourceUrl = canonicalizeUrl(new URL(rawLink, feedUrl).toString());
    } catch {
      continue;
    }
    if (seen.has(sourceUrl)) {
      continue;
    }
    seen.add(sourceUrl);

    const rawContent =
      textValue(candidate["content:encoded"]) ||
      textValue(candidate.content) ||
      textValue(candidate.summary) ||
      textValue(candidate.description) ||
      title;
    const publishedValue =
      textValue(candidate.published) ||
      textValue(candidate.updated) ||
      textValue(candidate.pubDate) ||
      textValue(candidate.date);
    const parsedDate = new Date(publishedValue);
    const publishedAt = Number.isNaN(parsedDate.getTime())
      ? new Date(0).toISOString()
      : parsedDate.toISOString();
    const externalId =
      textValue(candidate.guid) ||
      textValue(candidate.id) ||
      stableId(sourceUrl, title);

    entries.push({
      externalId,
      title,
      publisher,
      sourceUrl,
      publishedAt,
      content: stripMarkup(rawContent),
    });
  }
  return entries;
}

export function deduplicateRssEntries(entries: RssEntry[]): RssEntry[] {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    const key = canonicalizeUrl(entry.sourceUrl);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function extractCandidates(parsed: Record<string, unknown>): unknown[] {
  const rss = parsed.rss;
  if (isRecord(rss) && isRecord(rss.channel)) {
    return arrayify(rss.channel.item);
  }
  const feed = parsed.feed;
  if (isRecord(feed)) {
    return arrayify(feed.entry);
  }
  throw new Error("Document is not a supported RSS or Atom feed.");
}

function textValue(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  if (isRecord(value)) {
    const directText = textValue(value["#text"]);
    if (directText) {
      return directText;
    }
    return Object.entries(value)
      .filter(([key]) => !["type", "rel", "href"].includes(key))
      .map(([, nested]) => textValue(nested))
      .filter(Boolean)
      .join(" ");
  }
  return "";
}

function linkValue(value: unknown): string {
  for (const candidate of arrayify(value)) {
    if (typeof candidate === "string") {
      return candidate;
    }
    if (isRecord(candidate)) {
      const rel = textValue(candidate.rel);
      const href = textValue(candidate.href);
      if (href && (!rel || rel === "alternate")) {
        return href;
      }
    }
  }
  return "";
}

function stripMarkup(value: string): string {
  if (!value.includes("<")) {
    return value.trim();
  }
  const { document } = parseHTML(
    `<!doctype html><html><body>${value}</body></html>`,
  );
  return document.body.textContent.replace(/\s+/g, " ").trim();
}

function arrayify(value: unknown): unknown[] {
  if (value === undefined || value === null) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stableId(...parts: string[]): string {
  return createHash("sha256")
    .update(parts.join("\u0000"))
    .digest("hex")
    .slice(0, 24);
}
