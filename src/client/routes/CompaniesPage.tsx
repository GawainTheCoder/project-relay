import {
  ArrowRight,
  Building2,
  ChevronRight,
  Search,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { PageError, PageLoading } from "../components/ui/AsyncState";
import { useDashboard } from "../context/useDashboard";
import { ThesisCard } from "../features/companies/ThesisCard";
import { formatDate, getLayerName, titleCase } from "../lib/format";

export function CompaniesPage() {
  const { data, error, isLoading, reload } = useDashboard();
  const [query, setQuery] = useState("");
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);

  const companies = useMemo(() => {
    if (!data) {
      return [];
    }
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return data.companies;
    }
    return data.companies.filter((company) =>
      [
        company.ticker,
        company.name,
        company.thesis,
        ...company.layerIds.map(getLayerName),
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    );
  }, [data, query]);

  const selectedCompany =
    companies.find((company) => company.ticker === selectedTicker) ??
    companies[0] ??
    null;

  if (isLoading) {
    return <PageLoading label="Loading company theses" />;
  }
  if (error || !data) {
    return (
      <PageError
        error={error ?? "Company intelligence is unavailable."}
        onRetry={() => void reload()}
      />
    );
  }

  return (
    <div className="relay-enter min-h-screen">
      <header className="border-b border-relay-border px-5 py-5 sm:px-8 lg:px-10">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-relay-muted">
              Personal watchlist
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              Company theses
            </h1>
          </div>
          <label className="flex h-10 w-full items-center gap-2 rounded-md border border-relay-border bg-relay-surface px-3 sm:w-72">
            <Search
              aria-hidden="true"
              className="size-3.5 text-relay-subtle"
            />
            <span className="sr-only">Search companies</span>
            <input
              className="min-w-0 flex-1 bg-transparent text-sm placeholder:text-relay-subtle"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search watchlist"
              value={query}
            />
          </label>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1440px] xl:grid-cols-[minmax(0,1fr)_390px]">
        <main className="min-w-0 px-5 py-7 sm:px-8 lg:px-10">
          <div className="flex items-center justify-between border-b border-relay-border pb-3">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">
                Infrastructure exposure
              </h2>
              <p className="mt-1 text-sm text-relay-muted">
                Select a company to inspect its current thesis.
              </p>
            </div>
            <span className="font-mono text-[10px] text-relay-subtle">
              {companies.length} tracked
            </span>
          </div>

          {companies.length ? (
            <div className="divide-y divide-relay-border">
              {companies.map((company) => (
                <button
                  className={`group grid w-full grid-cols-[62px_minmax(0,1fr)_auto] items-center gap-3 px-2 py-4 text-left transition-colors sm:grid-cols-[72px_170px_minmax(0,1fr)_100px_auto] ${
                    selectedCompany?.ticker === company.ticker
                      ? "bg-relay-accent/6"
                      : "hover:bg-relay-surface"
                  }`}
                  key={company.ticker}
                  onClick={() => setSelectedTicker(company.ticker)}
                  type="button"
                >
                  <span
                    className={`font-mono text-sm font-semibold ${
                      selectedCompany?.ticker === company.ticker
                        ? "text-relay-accent"
                        : "text-relay-text"
                    }`}
                  >
                    {company.ticker}
                  </span>
                  <span className="hidden truncate text-sm sm:block">
                    {company.name}
                  </span>
                  <span className="min-w-0">
                    <span className="line-clamp-1 text-xs leading-5 text-relay-muted">
                      {company.thesis}
                    </span>
                    <span className="mt-1 flex flex-wrap gap-2 font-mono text-[9px] uppercase tracking-[0.06em] text-relay-subtle sm:hidden">
                      {company.layerIds.slice(0, 2).map((layerId) => (
                        <span key={layerId}>{getLayerName(layerId)}</span>
                      ))}
                    </span>
                  </span>
                  <span className="hidden font-mono text-[9px] uppercase tracking-[0.06em] text-relay-subtle sm:block">
                    {titleCase(company.confidence)}
                  </span>
                  <ChevronRight
                    aria-hidden="true"
                    className="size-4 text-relay-subtle group-hover:text-relay-accent"
                  />
                </button>
              ))}
            </div>
          ) : (
            <div className="grid min-h-56 place-items-center text-center">
              <div>
                <Building2
                  aria-hidden="true"
                  className="mx-auto size-5 text-relay-subtle"
                />
                <p className="mt-3 text-sm text-relay-muted">
                  No company matches “{query}”.
                </p>
              </div>
            </div>
          )}

          {selectedCompany ? (
            <div className="mt-6 flex items-center justify-between border-t border-relay-border pt-4 text-xs text-relay-muted">
              <span>
                Updated {formatDate(selectedCompany.updatedAt)}
              </span>
              <Link
                className="inline-flex items-center gap-1.5 font-medium text-relay-accent hover:text-white xl:hidden"
                to={`/companies/${selectedCompany.ticker}`}
              >
                View thesis
                <ArrowRight aria-hidden="true" className="size-3" />
              </Link>
            </div>
          ) : null}
        </main>

        {selectedCompany ? (
          <div className="hidden min-h-[calc(100vh-81px)] border-l border-relay-border xl:block">
            <ThesisCard company={selectedCompany} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
