import {
  BookOpenText,
  Building2,
  LoaderCircle,
  Quote,
  Radar,
  Search,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import type {
  SearchResult as PersistedSearchResult,
  SearchResultType,
} from "../../shared/contracts";
import { useDashboard } from "../context/useDashboard";
import { searchRelay } from "../lib/api";

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

type PaletteResult = {
  description: string;
  href: string;
  icon: typeof Search;
  key: string;
  label: string;
  meta?: string;
};

const supportedResultTypes = new Set<SearchResultType>([
  "brief",
  "company",
  "evidence",
  "update",
]);

function getPersistedIcon(type: SearchResultType) {
  switch (type) {
    case "brief":
      return BookOpenText;
    case "company":
      return Building2;
    case "evidence":
      return Quote;
    case "update":
      return Radar;
    default:
      return Search;
  }
}

function normalizeResultHref(href: string) {
  if (href.startsWith("/updates")) {
    return href.replace("/updates", "/signals");
  }
  if (href.startsWith("/companies")) {
    return href.replace("/companies", "/theses");
  }
  return href;
}

export function CommandPalette({
  isOpen,
  onClose,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [remoteState, setRemoteState] = useState<{
    query: string;
    results: PersistedSearchResult[];
  }>({ query: "", results: [] });
  const [isSearching, setIsSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { data } = useDashboard();
  const cleanQuery = query.trim();

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      setQuery("");
      setRemoteState({ query: "", results: [] });
      inputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || cleanQuery.length < 2) {
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setIsSearching(true);
      void searchRelay(cleanQuery, {
        limit: 10,
        signal: controller.signal,
      })
        .then((response) =>
          setRemoteState({ query: cleanQuery, results: response.results }),
        )
        .catch((error: unknown) => {
          if (
            !(error instanceof DOMException && error.name === "AbortError")
          ) {
            setRemoteState({ query: cleanQuery, results: [] });
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setIsSearching(false);
          }
        });
    }, 160);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [cleanQuery, isOpen]);

  const localResults = useMemo(() => {
    if (!data) {
      return [];
    }
    const entries: PaletteResult[] = [
      ...data.companies.map((company) => ({
        key: `company-${company.ticker}`,
        label: `${company.ticker} · ${company.name}`,
        description: company.thesis,
        href: `/theses/${company.ticker}`,
        icon: Building2,
      })),
      ...data.updates.map((update) => ({
        key: `update-${update.id}`,
        label: update.title,
        description: `${update.publisher} · ${update.companyTickers.join(", ")}`,
        href: `/signals?update=${encodeURIComponent(update.id)}`,
        icon: Radar,
      })),
    ];
    return entries.slice(0, 8);
  }, [data]);

  const results: PaletteResult[] =
    cleanQuery.length >= 2
      ? (remoteState.query === cleanQuery ? remoteState.results : [])
          .filter((result) => supportedResultTypes.has(result.type))
          .map((result) => ({
            key: `${result.type}-${result.id}`,
            label: result.title,
            description: result.snippet || result.subtitle,
            href: normalizeResultHref(result.href),
            icon: getPersistedIcon(result.type),
            meta: result.matchedField,
          }))
      : localResults;

  if (!isOpen) {
    return null;
  }

  const choose = (href: string) => {
    navigate(href);
    onClose();
  };

  return (
    <div
      aria-label="Search Relay"
      aria-modal="true"
      className="fixed inset-0 z-50 bg-black/70 px-4 pt-[12vh]"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) {
          onClose();
        }
      }}
      role="dialog"
    >
      <div className="mx-auto w-full max-w-2xl overflow-hidden rounded-lg border border-relay-border-strong bg-relay-surface shadow-2xl shadow-black/50">
        <div className="flex items-center gap-3 border-b border-relay-border px-4">
          {cleanQuery.length >= 2 && isSearching ? (
            <LoaderCircle
              aria-hidden="true"
              className="size-4 shrink-0 animate-spin text-relay-accent"
            />
          ) : (
            <Search
              aria-hidden="true"
              className="size-4 shrink-0 text-relay-muted"
            />
          )}
          <input
            className="h-14 min-w-0 flex-1 bg-transparent text-sm text-relay-text placeholder:text-relay-subtle"
            maxLength={120}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                onClose();
              }
              if (event.key === "Enter") {
                if (results[0]) {
                  choose(results[0].href);
                } else if (cleanQuery.length >= 2) {
                  choose(`/search?q=${encodeURIComponent(cleanQuery)}`);
                }
              }
            }}
            placeholder="Search signals, evidence, briefs, and theses"
            ref={inputRef}
            value={query}
          />
          <button
            aria-label="Close search"
            className="rounded p-1.5 text-relay-muted transition-colors hover:bg-relay-raised hover:text-relay-text"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        </div>
        <div className="relay-scrollbar max-h-[55vh] overflow-y-auto p-2">
          {results.length ? (
            results.map((result) => {
              const Icon = result.icon;
              return (
                <button
                  className="group flex w-full items-start gap-3 rounded-md px-3 py-3 text-left transition-colors hover:bg-relay-raised"
                  key={result.key}
                  onClick={() => choose(result.href)}
                  type="button"
                >
                  <Icon
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0 text-relay-subtle group-hover:text-relay-accent"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-relay-text">
                      {result.label}
                    </span>
                    <span className="mt-1 block truncate text-xs text-relay-muted">
                      {result.description}
                    </span>
                  </span>
                  {result.meta ? (
                    <span className="font-mono text-[9px] uppercase text-relay-subtle">
                      {result.meta}
                    </span>
                  ) : null}
                </button>
              );
            })
          ) : (
            <p className="px-3 py-10 text-center text-sm text-relay-muted">
              {cleanQuery.length >= 2 && isSearching
                ? "Searching local intelligence…"
                : "No matches."}
            </p>
          )}
        </div>
        <div className="flex items-center justify-between border-t border-relay-border px-4 py-2 font-mono text-[10px] uppercase tracking-[0.08em] text-relay-subtle">
          <button
            className="text-relay-muted hover:text-relay-accent disabled:opacity-40"
            disabled={cleanQuery.length < 2}
            onClick={() =>
              choose(`/search?q=${encodeURIComponent(cleanQuery)}`)
            }
            type="button"
          >
            View all results
          </button>
          <span>Enter to open · Esc to close</span>
        </div>
      </div>
    </div>
  );
}
