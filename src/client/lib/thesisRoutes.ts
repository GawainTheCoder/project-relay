import type { SearchResult } from "../../shared/contracts";

export function companyThesisPath(ticker: string): string {
  const thesisId = `company-${ticker.trim().toLowerCase()}`;
  return `/theses/${encodeURIComponent(thesisId)}`;
}

export function normalizeSearchResultHref(
  result: Pick<SearchResult, "href" | "id" | "type">,
): string {
  if (result.type === "company") {
    return companyThesisPath(result.id);
  }
  if (result.href.startsWith("/updates")) {
    return result.href.replace("/updates", "/signals");
  }
  if (result.href.startsWith("/companies")) {
    return result.href.replace("/companies", "/theses");
  }
  if (result.href.startsWith("/beliefs")) {
    return result.href.replace("/beliefs", "/theses");
  }
  return result.href;
}
