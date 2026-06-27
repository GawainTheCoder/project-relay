import {
  ArrowDownRight,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  Gauge,
  Radar,
  XCircle,
} from "lucide-react";
import { Link, useParams } from "react-router-dom";

import { PageError, PageLoading } from "../components/ui/AsyncState";
import { SentimentBadge } from "../components/ui/StatusBadge";
import { useDashboard } from "../context/useDashboard";
import { formatDate, getLayerName, titleCase } from "../lib/format";

export function CompanyDetailPage() {
  const { ticker = "" } = useParams();
  const { data, error, isLoading, reload } = useDashboard();

  if (isLoading) {
    return <PageLoading label="Loading company thesis" />;
  }
  if (error || !data) {
    return (
      <PageError
        error={error ?? "Company intelligence is unavailable."}
        onRetry={() => void reload()}
      />
    );
  }

  const company = data.companies.find(
    (candidate) => candidate.ticker.toLowerCase() === ticker.toLowerCase(),
  );
  if (!company) {
    return (
      <div className="grid min-h-screen place-items-center px-6">
        <section className="max-w-md border-l border-relay-warning pl-5">
          <p className="font-mono text-xs uppercase tracking-[0.1em] text-relay-warning">
            Not tracked
          </p>
          <h1 className="mt-3 text-2xl font-semibold">
            {ticker.toUpperCase()} is not on this watchlist.
          </h1>
          <Link
            className="mt-5 inline-flex items-center gap-2 text-sm text-relay-accent hover:text-white"
            to="/companies"
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
            Back to companies
          </Link>
        </section>
      </div>
    );
  }

  const evidenceUpdates = data.updates
    .filter((update) => update.companyTickers.includes(company.ticker))
    .sort(
      (left, right) =>
        new Date(right.publishedAt).getTime() -
        new Date(left.publishedAt).getTime(),
    );

  return (
    <div className="relay-enter min-h-screen">
      <header className="border-b border-relay-border px-5 py-5 sm:px-8 lg:px-10">
        <div className="mx-auto max-w-[1280px]">
          <Link
            className="inline-flex items-center gap-2 text-xs text-relay-muted hover:text-relay-text"
            to="/companies"
          >
            <ArrowLeft aria-hidden="true" className="size-3.5" />
            Company theses
          </Link>
          <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="flex items-baseline gap-3">
                <h1 className="font-mono text-3xl font-semibold tracking-tight">
                  {company.ticker}
                </h1>
                <span className="text-base text-relay-muted">
                  {company.name}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                {company.layerIds.map((layerId) => (
                  <Link
                    className="font-mono text-[10px] uppercase tracking-[0.08em] text-relay-accent hover:text-white"
                    key={layerId}
                    to={`/stack?layer=${layerId}&company=${company.ticker}`}
                  >
                    {getLayerName(layerId)}
                  </Link>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-md border border-relay-border bg-relay-surface px-3 py-2">
              <Gauge aria-hidden="true" className="size-4 text-relay-accent" />
              <div>
                <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-relay-subtle">
                  Thesis confidence
                </p>
                <p className="mt-0.5 text-xs font-medium">
                  {titleCase(company.confidence)}
                </p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1280px] px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
        <section className="border-l-2 border-relay-accent pl-5 sm:pl-7">
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-relay-muted">
            Core thesis
          </p>
          <h2 className="mt-3 max-w-4xl text-2xl font-medium leading-9 tracking-tight sm:text-3xl sm:leading-10">
            {company.thesis}
          </h2>
          <p className="mt-5 max-w-3xl text-[15px] leading-7 text-relay-muted">
            {company.whyItMatters}
          </p>
        </section>

        <div className="mt-10 grid gap-px overflow-hidden rounded-md border border-relay-border bg-relay-border lg:grid-cols-3">
          <section className="bg-relay-surface p-5 sm:p-6">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <ArrowUpRight
                aria-hidden="true"
                className="size-4 text-relay-positive"
              />
              What proves it right
            </h2>
            <ul className="mt-5 space-y-4">
              {company.provesRight.map((item) => (
                <li
                  className="flex gap-3 text-sm leading-6 text-relay-muted"
                  key={item}
                >
                  <CheckCircle2
                    aria-hidden="true"
                    className="mt-1 size-3.5 shrink-0 text-relay-positive"
                  />
                  {item}
                </li>
              ))}
            </ul>
          </section>

          <section className="bg-relay-surface p-5 sm:p-6">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <ArrowDownRight
                aria-hidden="true"
                className="size-4 text-relay-negative"
              />
              What breaks the thesis
            </h2>
            <ul className="mt-5 space-y-4">
              {company.breaksThesis.map((item) => (
                <li
                  className="flex gap-3 text-sm leading-6 text-relay-muted"
                  key={item}
                >
                  <XCircle
                    aria-hidden="true"
                    className="mt-1 size-3.5 shrink-0 text-relay-negative"
                  />
                  {item}
                </li>
              ))}
            </ul>
          </section>

          <section className="bg-relay-surface p-5 sm:p-6">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Radar
                aria-hidden="true"
                className="size-4 text-relay-accent"
              />
              Metrics to watch
            </h2>
            <ul className="mt-5 space-y-4">
              {company.watchMetrics.map((metric) => (
                <li
                  className="flex gap-3 text-sm leading-6 text-relay-muted"
                  key={metric}
                >
                  <span className="mt-[11px] size-1 shrink-0 rounded-full bg-relay-accent" />
                  {metric}
                </li>
              ))}
            </ul>
          </section>
        </div>

        <section className="mt-11">
          <div className="flex items-end justify-between border-b border-relay-border pb-3">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">
                Evidence history
              </h2>
              <p className="mt-1 text-sm text-relay-muted">
                Source-backed developments affecting this thesis.
              </p>
            </div>
            <span className="font-mono text-[10px] text-relay-subtle">
              {evidenceUpdates.length} updates
            </span>
          </div>
          {evidenceUpdates.length ? (
            <div className="divide-y divide-relay-border">
              {evidenceUpdates.map((update) => {
                const impact = update.thesisImpacts.find(
                  (candidate) =>
                    candidate.companyTicker === company.ticker,
                );
                return (
                  <Link
                    className="group grid gap-3 py-5 sm:grid-cols-[120px_minmax(0,1fr)_auto]"
                    key={update.id}
                    to={`/updates?update=${encodeURIComponent(update.id)}`}
                  >
                    <time
                      className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.06em] text-relay-subtle"
                      dateTime={update.publishedAt}
                    >
                      <Clock3 aria-hidden="true" className="size-3" />
                      {formatDate(update.publishedAt, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </time>
                    <div>
                      <h3 className="text-sm font-medium group-hover:text-relay-accent">
                        {update.title}
                      </h3>
                      <p className="mt-2 line-clamp-2 text-xs leading-5 text-relay-muted">
                        {impact?.summary ?? update.whyItMatters}
                      </p>
                      <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.06em] text-relay-subtle">
                        {update.publisher} · {update.claims.length} source claims
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      {impact ? (
                        <SentimentBadge sentiment={impact.direction} />
                      ) : null}
                      <ArrowRight
                        aria-hidden="true"
                        className="size-4 text-relay-subtle group-hover:text-relay-accent"
                      />
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="grid min-h-52 place-items-center border-b border-relay-border text-center">
              <p className="text-sm text-relay-muted">
                No evidence has been linked to this thesis yet.
              </p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
