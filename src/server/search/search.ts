import type { DatabaseSync } from "node:sqlite";

export const MIN_SEARCH_QUERY_LENGTH = 2;
export const MAX_SEARCH_QUERY_LENGTH = 120;
export const DEFAULT_SEARCH_RESULT_LIMIT = 20;
export const MAX_SEARCH_RESULT_LIMIT = 50;

export type SearchResultType =
  | "brief"
  | "company"
  | "evidence"
  | "update";

export interface SearchResult {
  type: SearchResultType;
  id: string;
  title: string;
  subtitle: string;
  snippet: string;
  href: string;
  matchedField: string;
}

export interface SearchOptions {
  limit?: number;
}

interface RankedSearchResult extends SearchResult {
  score: number;
}

interface SearchField {
  label: string;
  value: string;
  weight: number;
}

type SqlValue = null | number | string;
type SqlRow = Record<string, SqlValue>;

const SEARCH_TOKEN_LIMIT = 8;
const CANDIDATE_LIMIT_MULTIPLIER = 8;
const MAX_SNIPPET_LENGTH = 180;

export class LocalSearchService {
  private readonly database: DatabaseSync;

  constructor(database: DatabaseSync) {
    this.database = database;
  }

  search(rawQuery: string, options: SearchOptions = {}): SearchResult[] {
    const query = normalizeSearchQuery(rawQuery);
    const limit = normalizeSearchLimit(options.limit);
    const tokens = tokenize(query);
    const candidateLimit = Math.min(
      limit * CANDIDATE_LIMIT_MULTIPLIER,
      MAX_SEARCH_RESULT_LIMIT * CANDIDATE_LIMIT_MULTIPLIER,
    );

    const candidates = [
      ...this.searchUpdates(query, tokens, candidateLimit),
      ...this.searchEvidence(query, tokens, candidateLimit),
      ...this.searchCompanies(query, tokens, candidateLimit),
      ...this.searchBriefs(query, tokens, candidateLimit),
    ];

    return deduplicate(candidates)
      .sort(
        (left, right) =>
          right.score - left.score ||
          left.type.localeCompare(right.type) ||
          left.title.localeCompare(right.title),
      )
      .slice(0, limit)
      .map(toSearchResult);
  }

  private searchUpdates(
    query: string,
    tokens: string[],
    limit: number,
  ): RankedSearchResult[] {
    const searchableExpression = `
      COALESCE(i.title, '') || ' ' ||
      COALESCE(i.publisher, '') || ' ' ||
      COALESCE(i.what_happened, '') || ' ' ||
      COALESCE(i.why_it_matters, '') || ' ' ||
      COALESCE(i.beneficiaries_json, '') || ' ' ||
      COALESCE(i.threatened_json, '') || ' ' ||
      COALESCE(i.watch_next_json, '') || ' ' ||
      COALESCE((
        SELECT GROUP_CONCAT(company_ticker, ' ')
        FROM update_companies
        WHERE update_id = i.id
      ), '') || ' ' ||
      COALESCE((
        SELECT GROUP_CONCAT(layer_id, ' ')
        FROM update_layers
        WHERE update_id = i.id
      ), '')
    `;
    const updateRows = this.queryRows(
      `
        SELECT
          i.id,
          i.title,
          i.publisher,
          i.what_happened,
          i.why_it_matters,
          i.beneficiaries_json,
          i.threatened_json,
          i.watch_next_json,
          COALESCE((
            SELECT GROUP_CONCAT(company_ticker, ' ')
            FROM update_companies
            WHERE update_id = i.id
          ), '') AS companies,
          COALESCE((
            SELECT GROUP_CONCAT(layer_id, ' ')
            FROM update_layers
            WHERE update_id = i.id
          ), '') AS layers
        FROM intelligence_updates i
        WHERE ${tokenWhere(searchableExpression, tokens)}
        ORDER BY i.published_at DESC, i.ingested_at DESC
        LIMIT ?
      `,
      [...toPatterns(tokens), limit],
    );

    return updateRows.map((updateRow) => {
      const fields: SearchField[] = [
        field("title", updateRow.title, 110),
        field("publisher", updateRow.publisher, 72),
        field("what happened", updateRow.what_happened, 88),
        field("why it matters", updateRow.why_it_matters, 86),
        field("companies", updateRow.companies, 80),
        field("stack layers", updateRow.layers, 74),
        field("beneficiaries", updateRow.beneficiaries_json, 64),
        field("threatened", updateRow.threatened_json, 64),
        field("watch next", updateRow.watch_next_json, 68),
      ];
      return buildResult({
        type: "update",
        id: requiredText(updateRow, "id"),
        title: requiredText(updateRow, "title"),
        subtitle: requiredText(updateRow, "publisher"),
        href: `/signals?update=${encodeURIComponent(requiredText(updateRow, "id"))}`,
        fields,
        query,
        tokens,
      });
    });
  }

  private searchEvidence(
    query: string,
    tokens: string[],
    limit: number,
  ): RankedSearchResult[] {
    const searchableExpression = `
      COALESCE(e.quote, '') || ' ' ||
      COALESCE(e.source_id, '') || ' ' ||
      COALESCE(e.locator, '') || ' ' ||
      COALESCE(i.title, '') || ' ' ||
      COALESCE(i.publisher, '')
    `;
    const evidenceRows = this.queryRows(
      `
        SELECT
          e.id,
          e.update_id,
          e.quote,
          e.source_id,
          e.locator,
          i.title AS update_title,
          i.publisher
        FROM evidence_claims e
        JOIN intelligence_updates i ON i.id = e.update_id
        WHERE ${tokenWhere(searchableExpression, tokens)}
        ORDER BY i.published_at DESC
        LIMIT ?
      `,
      [...toPatterns(tokens), limit],
    );

    return evidenceRows.map((evidenceRow) => {
      const fields: SearchField[] = [
        field("evidence quote", evidenceRow.quote, 112),
        field("source", evidenceRow.source_id, 70),
        field("locator", evidenceRow.locator, 66),
        field("update title", evidenceRow.update_title, 76),
        field("publisher", evidenceRow.publisher, 64),
      ];
      return buildResult({
        type: "evidence",
        id: requiredText(evidenceRow, "id"),
        title: `Evidence · ${requiredText(evidenceRow, "update_title")}`,
        subtitle: `${requiredText(evidenceRow, "publisher")} · ${requiredText(evidenceRow, "locator")}`,
        href: `/signals?update=${encodeURIComponent(requiredText(evidenceRow, "update_id"))}`,
        fields,
        query,
        tokens,
      });
    });
  }

  private searchCompanies(
    query: string,
    tokens: string[],
    limit: number,
  ): RankedSearchResult[] {
    const searchableExpression = `
      COALESCE(ticker, '') || ' ' ||
      COALESCE(name, '') || ' ' ||
      COALESCE(description, '') || ' ' ||
      COALESCE(thesis, '') || ' ' ||
      COALESCE(why_it_matters, '') || ' ' ||
      COALESCE(proves_right_json, '') || ' ' ||
      COALESCE(breaks_thesis_json, '') || ' ' ||
      COALESCE(watch_metrics_json, '')
    `;
    const companyRows = this.queryRows(
      `
        SELECT
          ticker,
          name,
          description,
          thesis,
          why_it_matters,
          proves_right_json,
          breaks_thesis_json,
          watch_metrics_json
        FROM companies
        WHERE ${tokenWhere(searchableExpression, tokens)}
        ORDER BY ticker
        LIMIT ?
      `,
      [...toPatterns(tokens), limit],
    );

    return companyRows.map((companyRow) => {
      const ticker = requiredText(companyRow, "ticker");
      const fields: SearchField[] = [
        field("ticker", companyRow.ticker, 130),
        field("company name", companyRow.name, 118),
        field("description", companyRow.description, 76),
        field("thesis", companyRow.thesis, 98),
        field("why it matters", companyRow.why_it_matters, 92),
        field("confirmation signals", companyRow.proves_right_json, 82),
        field("break conditions", companyRow.breaks_thesis_json, 82),
        field("watch metrics", companyRow.watch_metrics_json, 88),
      ];
      return buildResult({
        type: "company",
        id: ticker,
        title: `${ticker} · ${requiredText(companyRow, "name")}`,
        subtitle: "Company thesis",
        href: `/theses/${encodeURIComponent(ticker)}`,
        fields,
        query,
        tokens,
      });
    });
  }

  private searchBriefs(
    query: string,
    tokens: string[],
    limit: number,
  ): RankedSearchResult[] {
    const searchableExpression = `
      COALESCE(title, '') || ' ' ||
      COALESCE(summary, '') || ' ' ||
      COALESCE(signal, '') || ' ' ||
      COALESCE(secondary_signals_json, '')
    `;
    const briefRows = this.queryRows(
      `
        SELECT id, date, title, summary, signal, secondary_signals_json
        FROM daily_briefs
        WHERE ${tokenWhere(searchableExpression, tokens)}
        ORDER BY date DESC, generated_at DESC
        LIMIT ?
      `,
      [...toPatterns(tokens), limit],
    );

    return briefRows.map((briefRow) => {
      const fields: SearchField[] = [
        field("title", briefRow.title, 104),
        field("summary", briefRow.summary, 88),
        field("primary signal", briefRow.signal, 96),
        field("secondary signals", briefRow.secondary_signals_json, 78),
      ];
      const briefId = requiredText(briefRow, "id");
      return buildResult({
        type: "brief",
        id: briefId,
        title: requiredText(briefRow, "title"),
        subtitle: `Daily brief · ${requiredText(briefRow, "date")}`,
        href: `/?brief=${encodeURIComponent(briefId)}`,
        fields,
        query,
        tokens,
      });
    });
  }

  private queryRows(sql: string, values: Array<number | string>): SqlRow[] {
    return this.database.prepare(sql).all(...values) as SqlRow[];
  }
}

export function normalizeSearchQuery(rawQuery: string): string {
  const query = rawQuery.replace(/\s+/g, " ").trim();
  if (query.length < MIN_SEARCH_QUERY_LENGTH) {
    throw new RangeError(
      `Search queries must contain at least ${MIN_SEARCH_QUERY_LENGTH} characters.`,
    );
  }
  if (query.length > MAX_SEARCH_QUERY_LENGTH) {
    throw new RangeError(
      `Search queries must contain at most ${MAX_SEARCH_QUERY_LENGTH} characters.`,
    );
  }
  return query;
}

function normalizeSearchLimit(limit = DEFAULT_SEARCH_RESULT_LIMIT): number {
  if (
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > MAX_SEARCH_RESULT_LIMIT
  ) {
    throw new RangeError(
      `Search result limits must be integers from 1 to ${MAX_SEARCH_RESULT_LIMIT}.`,
    );
  }
  return limit;
}

function tokenize(query: string): string[] {
  const tokens = [
    ...new Set(
      query
        .toLocaleLowerCase()
        .split(/[^\p{L}\p{N}._-]+/u)
        .filter(Boolean),
    ),
  ].slice(0, SEARCH_TOKEN_LIMIT);
  return tokens.length > 0 ? tokens : [query.toLocaleLowerCase()];
}

function toPatterns(tokens: string[]): string[] {
  return tokens.map((token) => `%${escapeLike(token)}%`);
}

function tokenWhere(expression: string, tokens: string[]): string {
  return tokens
    .map(() => `LOWER(${expression}) LIKE ? ESCAPE '\\'`)
    .join(" AND ");
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

function field(
  label: string,
  value: SqlValue | undefined,
  weight: number,
): SearchField {
  return {
    label,
    value: optionalText(value) ?? "",
    weight,
  };
}

function optionalText(value: SqlValue | undefined): string | null {
  return typeof value === "string" ? value : null;
}

function requiredText(row: SqlRow, key: string): string {
  const value = optionalText(row[key]);
  if (value === null) {
    throw new TypeError(`Expected ${key} to be text.`);
  }
  return value;
}

function buildResult(input: {
  type: SearchResultType;
  id: string;
  title: string;
  subtitle: string;
  href: string;
  fields: SearchField[];
  query: string;
  tokens: string[];
}): RankedSearchResult {
  const match = bestFieldMatch(input.fields, input.query, input.tokens);
  return {
    type: input.type,
    id: input.id,
    title: input.title,
    subtitle: input.subtitle,
    snippet: buildSnippet(match.field.value, input.query, input.tokens),
    href: input.href,
    matchedField: match.field.label,
    score: match.score,
  };
}

function bestFieldMatch(
  fields: SearchField[],
  query: string,
  tokens: string[],
): { field: SearchField; score: number } {
  const normalizedQuery = query.toLocaleLowerCase();
  let best = { field: fields[0] ?? field("content", "", 0), score: 0 };

  for (const candidate of fields) {
    const value = normalizeDisplayText(candidate.value);
    const normalizedValue = value.toLocaleLowerCase();
    const tokenMatches = tokens.filter((token) =>
      normalizedValue.includes(token),
    ).length;
    if (tokenMatches === 0 && !normalizedValue.includes(normalizedQuery)) {
      continue;
    }

    let score = candidate.weight + tokenMatches * 8;
    if (normalizedValue === normalizedQuery) {
      score += 100;
    } else if (normalizedValue.startsWith(normalizedQuery)) {
      score += 60;
    } else if (normalizedValue.includes(normalizedQuery)) {
      score += 40;
    }
    if (tokenMatches === tokens.length) {
      score += 18;
    }

    if (score > best.score) {
      best = { field: candidate, score };
    }
  }

  return best;
}

function buildSnippet(
  value: string,
  query: string,
  tokens: string[],
): string {
  const displayValue = normalizeDisplayText(value);
  if (displayValue.length <= MAX_SNIPPET_LENGTH) {
    return displayValue;
  }

  const normalizedValue = displayValue.toLocaleLowerCase();
  const normalizedQuery = query.toLocaleLowerCase();
  let matchIndex = normalizedValue.indexOf(normalizedQuery);
  if (matchIndex < 0) {
    matchIndex = Math.min(
      ...tokens
        .map((token) => normalizedValue.indexOf(token))
        .filter((index) => index >= 0),
    );
  }
  if (!Number.isFinite(matchIndex)) {
    matchIndex = 0;
  }

  const start = Math.max(0, matchIndex - Math.floor(MAX_SNIPPET_LENGTH / 3));
  const end = Math.min(displayValue.length, start + MAX_SNIPPET_LENGTH);
  return `${start > 0 ? "…" : ""}${displayValue
    .slice(start, end)
    .trim()}${end < displayValue.length ? "…" : ""}`;
}

function normalizeDisplayText(value: string): string {
  return value
    .replaceAll("[", "")
    .replaceAll("]", "")
    .replaceAll('"', "")
    .replace(/\s+/g, " ")
    .trim();
}

function toSearchResult(candidate: RankedSearchResult): SearchResult {
  return {
    type: candidate.type,
    id: candidate.id,
    title: candidate.title,
    subtitle: candidate.subtitle,
    snippet: candidate.snippet,
    href: candidate.href,
    matchedField: candidate.matchedField,
  };
}

function deduplicate(
  candidates: RankedSearchResult[],
): RankedSearchResult[] {
  const byKey = new Map<string, RankedSearchResult>();
  for (const candidate of candidates) {
    const key = `${candidate.type}:${candidate.id}`;
    const current = byKey.get(key);
    if (!current || candidate.score > current.score) {
      byKey.set(key, candidate);
    }
  }
  return [...byKey.values()];
}
