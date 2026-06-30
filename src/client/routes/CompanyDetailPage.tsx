import {
  ArrowDownRight,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BookOpenCheck,
  CheckCircle2,
  Clock3,
  Gauge,
  LoaderCircle,
  Radar,
  Trash2,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { PageError, PageLoading } from "../components/ui/AsyncState";
import { Button } from "../components/ui/Button";
import { SentimentBadge } from "../components/ui/StatusBadge";
import { useDashboard } from "../context/useDashboard";
import { removeCompany } from "../lib/api";
import { formatDate, getLayerName, titleCase } from "../lib/format";
import { isThesisChangingImpact, isThesisChangingSignal } from "../lib/signals";

export function CompanyDetailPage() {
  const { ticker = "" } = useParams();
  const { data, error, isLoading, reload } = useDashboard();
  const navigate = useNavigate();
  const [isRemoveOpen, setIsRemoveOpen] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

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
            to="/theses"
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
            Back to theses
          </Link>
        </section>
      </div>
    );
  }

  const evidenceUpdates = data.updates
    .filter(
      (update) =>
        isThesisChangingSignal(update) &&
        update.thesisImpacts.some(
          (impact) =>
            impact.companyTicker === company.ticker &&
            isThesisChangingImpact(impact),
        ),
    )
    .sort(
      (left, right) =>
        new Date(right.publishedAt).getTime() -
        new Date(left.publishedAt).getTime(),
    );

  const removeFromWatchlist = async () => {
    setRemoveError(null);
    setIsRemoving(true);
    try {
      await removeCompany(company.ticker);
      await reload();
      navigate("/theses");
    } catch (caughtError) {
      setRemoveError(
        caughtError instanceof Error
          ? caughtError.message
          : "The company could not be removed.",
      );
      setIsRemoving(false);
    }
  };

  return (
    <div className="relay-enter min-h-screen">
      <header className="border-b border-relay-border px-5 py-5 sm:px-8 lg:px-10">
        <div className="mx-auto max-w-[1280px]">
          <Link
            className="inline-flex items-center gap-2 text-xs text-relay-muted hover:text-relay-text"
            to="/theses"
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
                  <span
                    className="font-mono text-[10px] uppercase tracking-[0.08em] text-relay-accent"
                    key={layerId}
                  >
                    {getLayerName(layerId)}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
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
              <Button onClick={() => setIsRemoveOpen(true)} variant="quiet">
                <Trash2 aria-hidden="true" className="size-3.5" />
                Remove
              </Button>
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
              {evidenceUpdates.length} signals
            </span>
          </div>
          {evidenceUpdates.length ? (
            <div className="divide-y divide-relay-border">
              {evidenceUpdates.map((update) => {
                const impact = update.thesisImpacts.find(
                  (candidate) =>
                    candidate.companyTicker === company.ticker &&
                    isThesisChangingImpact(candidate),
                );
                return (
                  <Link
                    className="group grid gap-3 py-5 sm:grid-cols-[120px_minmax(0,1fr)_auto]"
                    key={update.id}
                    to={`/signals?update=${encodeURIComponent(update.id)}`}
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
            <div className="border-b border-relay-border py-6">
              <div className="rounded-md border border-relay-border bg-relay-surface">
                <div className="flex items-start gap-3 border-b border-relay-border px-5 py-4">
                  <BookOpenCheck
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0 text-relay-accent"
                  />
                  <div>
                    <h3 className="text-sm font-semibold">
                      Baseline thesis checklist
                    </h3>
                    <p className="mt-1 max-w-3xl text-xs leading-5 text-relay-muted">
                      No source-backed signal has been linked yet. These are the
                      starting criteria defined by the thesis—not external
                      evidence or confirmed developments.
                    </p>
                  </div>
                </div>
                <div className="grid gap-px bg-relay-border lg:grid-cols-3">
                  <BaselineChecklist
                    items={company.provesRight}
                    label="Confirmation criteria"
                    tone="positive"
                  />
                  <BaselineChecklist
                    items={company.breaksThesis}
                    label="Disconfirming criteria"
                    tone="negative"
                  />
                  <BaselineChecklist
                    items={company.watchMetrics}
                    label="Metrics to monitor"
                    tone="accent"
                  />
                </div>
              </div>
            </div>
          )}
        </section>
      </main>

      {isRemoveOpen ? (
        <div
          aria-labelledby="remove-company-title"
          aria-modal="true"
          className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target && !isRemoving) {
              setIsRemoveOpen(false);
            }
          }}
          role="dialog"
        >
          <section className="w-full max-w-md rounded-lg border border-relay-border-strong bg-relay-surface shadow-2xl shadow-black/60">
            <div className="p-5">
              <h2
                className="text-lg font-semibold tracking-tight"
                id="remove-company-title"
              >
                Remove {company.ticker}?
              </h2>
              <p className="mt-2 text-sm leading-6 text-relay-muted">
                This removes the company and its thesis from your watchlist.
                Imported signals remain in Relay.
              </p>
              {removeError ? (
                <p
                  className="mt-4 rounded-md border border-relay-negative/35 bg-relay-negative/8 px-3 py-2.5 text-xs leading-5 text-relay-negative"
                  role="alert"
                >
                  {removeError}
                </p>
              ) : null}
            </div>
            <footer className="flex items-center justify-end gap-2 border-t border-relay-border px-5 py-4">
              <Button
                disabled={isRemoving}
                onClick={() => setIsRemoveOpen(false)}
                variant="quiet"
              >
                Cancel
              </Button>
              <Button
                disabled={isRemoving}
                onClick={() => void removeFromWatchlist()}
                variant="danger"
              >
                {isRemoving ? (
                  <LoaderCircle
                    aria-hidden="true"
                    className="size-3.5 animate-spin"
                  />
                ) : (
                  <Trash2 aria-hidden="true" className="size-3.5" />
                )}
                {isRemoving ? "Removing" : "Remove from watchlist"}
              </Button>
            </footer>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function BaselineChecklist({
  items,
  label,
  tone,
}: {
  items: string[];
  label: string;
  tone: "accent" | "negative" | "positive";
}) {
  const toneClass = {
    accent: "bg-relay-accent",
    negative: "bg-relay-negative",
    positive: "bg-relay-positive",
  }[tone];

  return (
    <section className="bg-relay-surface px-5 py-4">
      <h4 className="font-mono text-[10px] uppercase tracking-[0.08em] text-relay-subtle">
        {label}
      </h4>
      <ul className="mt-3 space-y-2.5">
        {items.map((item) => (
          <li
            className="flex gap-2.5 text-xs leading-5 text-relay-muted"
            key={item}
          >
            <span
              aria-hidden="true"
              className={`mt-2 size-1.5 shrink-0 rounded-full ${toneClass}`}
            />
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}
