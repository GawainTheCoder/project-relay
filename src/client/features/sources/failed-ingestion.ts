import {
  type FailedSourceDocument,
  type RetryFailedSourceDocumentInput,
} from "../../lib/api";

const blockedRetrievalPattern =
  /(?:source_retrieval_blocked|publisher blocked|automated retrieval|http\s*(?:401|403)|captcha|are you a robot)/i;

export function failedIngestionMessage(errorMessage: string): string {
  if (blockedRetrievalPattern.test(errorMessage)) {
    return "Publisher blocked automated retrieval—paste an excerpt.";
  }
  return errorMessage.trim() || "Relay could not analyze this source.";
}

export function formatFailedDocumentDate(value: string | null): string {
  if (!value) {
    return "Unknown";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  }).format(parsed);
}

export function retryInputFor(
  document: FailedSourceDocument,
  content?: string,
): RetryFailedSourceDocumentInput {
  return {
    title: document.title,
    publisher: document.publisher,
    ...(document.sourceUrl ? { sourceUrl: document.sourceUrl } : {}),
    ...(document.publishedAt ? { publishedAt: document.publishedAt } : {}),
    sourceKind: document.sourceKind,
    ...(content ? { content } : {}),
  };
}
