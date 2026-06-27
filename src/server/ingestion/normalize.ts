import { createHash } from "node:crypto";

import type { ImportSourceInput, ResearchSource } from "../../shared/contracts.js";
import type {
  NormalizedDocument,
  RssEntry,
  SourceParagraph,
} from "./types.js";

export const MAX_MANUAL_DOCUMENT_CHARS = 250_000;

export interface NormalizeDocumentOptions {
  sourceType?: ResearchSource["type"];
  now?: () => Date;
  sourceId?: string;
}

export function normalizeManualDocument(
  input: ImportSourceInput,
  options: NormalizeDocumentOptions = {},
): NormalizedDocument {
  const title = cleanSingleLine(input.title);
  const publisher = cleanSingleLine(input.publisher);
  const content = normalizeNewlines(input.content ?? "").trim();

  if (!title || !publisher) {
    throw new Error("A source title and publisher are required.");
  }
  if (!content) {
    throw new Error("Source content cannot be empty.");
  }
  if (content.length > MAX_MANUAL_DOCUMENT_CHARS) {
    throw new Error(
      `Source content exceeds the ${MAX_MANUAL_DOCUMENT_CHARS.toLocaleString()} character limit.`,
    );
  }

  const paragraphs = toParagraphs(content);
  const now = (options.now ?? (() => new Date()))();
  const sourceUrl = input.sourceUrl ? canonicalizeUrl(input.sourceUrl) : null;
  const publishedAt = normalizeDate(input.publishedAt, now);
  const normalizedContent = paragraphs.map((paragraph) => paragraph.text).join("\n\n");
  const id =
    options.sourceId ??
    stableId(
      "source",
      sourceUrl ?? publisher,
      title,
      publishedAt,
      normalizedContent,
    );

  return {
    id,
    sourceType: options.sourceType ?? "manual",
    title,
    publisher,
    sourceUrl,
    publishedAt,
    ingestedAt: now.toISOString(),
    content: normalizedContent,
    paragraphs,
  };
}

export function normalizeRssEntry(
  entry: RssEntry,
  options: NormalizeDocumentOptions = {},
): NormalizedDocument {
  return normalizeManualDocument(
    {
      title: entry.title,
      publisher: entry.publisher,
      sourceUrl: entry.sourceUrl,
      publishedAt: entry.publishedAt,
      content: entry.content,
    },
    {
      ...options,
      sourceType: options.sourceType ?? "rss",
      sourceId: options.sourceId ?? `source_${entry.externalId}`,
    },
  );
}

export function toParagraphs(content: string): SourceParagraph[] {
  return normalizeNewlines(content)
    .split(/\n\s*\n+/)
    .map((text) => text.trim())
    .filter(Boolean)
    .map((text, index) => ({ locator: `P${index + 1}`, text }));
}

export function canonicalizeUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only HTTP and HTTPS source URLs are allowed.");
  }
  url.hash = "";
  url.username = "";
  url.password = "";

  const trackingNames = new Set([
    "fbclid",
    "gclid",
    "mc_cid",
    "mc_eid",
    "ref_src",
  ]);
  for (const key of [...url.searchParams.keys()]) {
    if (key.toLowerCase().startsWith("utm_") || trackingNames.has(key.toLowerCase())) {
      url.searchParams.delete(key);
    }
  }
  url.searchParams.sort();

  if (
    (url.protocol === "https:" && url.port === "443") ||
    (url.protocol === "http:" && url.port === "80")
  ) {
    url.port = "";
  }
  if (url.pathname !== "/") {
    url.pathname = url.pathname.replace(/\/+$/, "");
  }
  return url.toString();
}

function normalizeDate(value: string | undefined, fallback: Date): string {
  if (!value) {
    return fallback.toISOString();
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Published date must be a valid date.");
  }
  return date.toISOString();
}

function cleanSingleLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeNewlines(value: string): string {
  return value.replace(/\r\n?/g, "\n");
}

function stableId(prefix: string, ...parts: string[]): string {
  return `${prefix}_${createHash("sha256")
    .update(parts.join("\u0000"))
    .digest("hex")
    .slice(0, 20)}`;
}
