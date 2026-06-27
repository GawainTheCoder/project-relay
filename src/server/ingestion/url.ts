import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";

import type { ImportSourceInput } from "../../shared/contracts.js";
import {
  normalizeManualDocument,
  type NormalizeDocumentOptions,
} from "./normalize.js";
import {
  secureFetchText,
  type SecureFetchOptions,
} from "./network.js";
import type { NormalizedDocument } from "./types.js";

export interface UrlIngestionInput {
  url: string;
  title?: string;
  publisher?: string;
  publishedAt?: string;
}

export interface UrlIngestionOptions
  extends SecureFetchOptions,
    NormalizeDocumentOptions {}

export async function ingestUrl(
  input: UrlIngestionInput,
  options: UrlIngestionOptions = {},
): Promise<NormalizedDocument> {
  const result = await secureFetchText(input.url, options);
  let extractedTitle = input.title?.trim() ?? "";
  let content = result.body;

  if (result.contentType !== "text/plain") {
    const { document } = parseHTML(result.body);
    const article = new Readability(
      document as unknown as Document,
      { charThreshold: 20 },
    ).parse();
    extractedTitle ||= article?.title?.trim() ?? document.title.trim();
    content = article?.textContent?.trim() ?? document.body.textContent.trim();
  }

  if (!content.trim()) {
    throw new Error("No readable source content was found.");
  }

  const publisher =
    input.publisher?.trim() || new URL(result.finalUrl).hostname.replace(/^www\./, "");
  const manualInput: ImportSourceInput = {
    title: extractedTitle || result.finalUrl,
    publisher,
    sourceUrl: result.finalUrl,
    content,
    ...(input.publishedAt ? { publishedAt: input.publishedAt } : {}),
  };
  return normalizeManualDocument(manualInput, {
    ...options,
    sourceType: options.sourceType ?? "manual",
  });
}
