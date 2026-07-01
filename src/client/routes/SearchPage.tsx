import {
  BookOpenText,
  BrainCircuit,
  Database,
  LoaderCircle,
  Quote,
  Search,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import type {
  SearchResult,
  SearchResultType,
} from "../../shared/contracts";
import { searchRelay } from "../lib/api";
import { normalizeSearchResultHref } from "../lib/thesisRoutes";

const supportedResultTypes = new Set<SearchResultType>([
  "brief",
  "company",
  "evidence",
  "thesis",
  "update",
]);

function getResultPresentation(type: SearchResultType) {
  switch (type) {
    case "brief":
      return { Icon: BookOpenText, label: "Daily brief" };
    case "company":
      return { Icon: BrainCircuit, label: "Thesis" };
    case "evidence":
      return { Icon: Quote, label: "Evidence" };
    case "thesis":
      return { Icon: BrainCircuit, label: "Thesis" };
    case "update":
      return { Icon: Database, label: "Evidence record" };
    default:
      return { Icon: Search, label: "Signal" };
  }
}

export function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlQuery = searchParams.get("q") ?? "";
  const [query, setQuery] = useState(urlQuery);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [resultQuery, setResultQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const cleanQuery = query.trim();
    if (cleanQuery.length < 2) {
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setIsSearching(true);
      void searchRelay(cleanQuery, {
        limit: 40,
        signal: controller.signal,
      })
        .then((response) => {
          setResults(response.results);
          setResultQuery(cleanQuery);
          setError(null);
          setSearchParams({ q: cleanQuery }, { replace: true });
        })
        .catch((caughtError: unknown) => {
          if (
            caughtError instanceof DOMException &&
            caughtError.name === "AbortError"
          ) {
            return;
          }
          setError(
            caughtError instanceof Error
              ? caughtError.message
              : "Search is unavailable.",
          );
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setIsSearching(false);
          }
        });
    }, 180);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, setSearchParams]);

  const cleanQuery = query.trim();
  const visibleResults =
    cleanQuery.length >= 2 && resultQuery === cleanQuery
      ? results.filter((result) => supportedResultTypes.has(result.type))
      : [];

  return (
    <div className="relay-enter min-h-screen">
      <header className="border-b border-relay-border px-5 py-7 sm:px-8 lg:px-10">
        <div className="mx-auto max-w-[980px]">
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-relay-muted">
            Thesis-aware search
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
            Search Relay
          </h1>
          <div className="mt-6 flex h-12 items-center gap-3 border-b border-relay-border-strong">
            {cleanQuery.length >= 2 && isSearching ? (
              <LoaderCircle
                aria-hidden="true"
                className="size-4 animate-spin text-relay-accent"
              />
            ) : (
              <Search
                aria-hidden="true"
                className="size-4 text-relay-muted"
              />
            )}
            <input
              aria-label="Search Relay"
              autoFocus
              className="min-w-0 flex-1 bg-transparent text-base text-relay-text placeholder:text-relay-subtle"
              maxLength={120}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Company, claim, bottleneck, metric…"
              value={query}
            />
            {cleanQuery.length >= 2 ? (
              <span className="font-mono text-[10px] text-relay-subtle">
                {visibleResults.length} result
                {visibleResults.length === 1 ? "" : "s"}
              </span>
            ) : null}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[980px] px-5 py-7 sm:px-8 lg:px-10">
        {error ? (
          <p
            className="rounded-md border border-relay-negative/30 bg-relay-negative/8 px-4 py-3 text-sm text-relay-negative"
            role="alert"
          >
            {error}
          </p>
        ) : cleanQuery.length < 2 ? (
          <div className="border-l border-relay-border-strong py-2 pl-5">
            <h2 className="text-sm font-semibold">Start with two characters</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-relay-muted">
              Relay searches theses, source-backed evidence, watch conditions,
              and daily mental-model briefs stored on this machine.
            </p>
          </div>
        ) : !isSearching && !visibleResults.length ? (
          <div className="py-20 text-center">
            <Search
              aria-hidden="true"
              className="mx-auto size-5 text-relay-subtle"
            />
            <h2 className="mt-4 text-sm font-semibold">No matches</h2>
            <p className="mt-2 text-sm text-relay-muted">
              Try a ticker, supplier, metric, or shorter technical term.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-relay-border">
            {visibleResults.map((result) => {
              const { Icon, label } = getResultPresentation(result.type);
              return (
                <Link
                  className="group grid gap-3 py-5 sm:grid-cols-[120px_minmax(0,1fr)_160px]"
                  key={`${result.type}:${result.id}`}
                  to={normalizeSearchResultHref(result)}
                >
                  <span className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.08em] text-relay-subtle">
                    <Icon aria-hidden="true" className="size-3.5" />
                    {label}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium group-hover:text-relay-accent">
                      {result.title}
                    </span>
                    <span className="mt-1 block text-xs text-relay-muted">
                      {result.subtitle}
                    </span>
                    <span className="mt-2 line-clamp-2 block text-sm leading-6 text-relay-muted">
                      {result.snippet}
                    </span>
                  </span>
                  <span className="font-mono text-[9px] uppercase tracking-[0.06em] text-relay-subtle sm:text-right">
                    Matched {result.matchedField}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
