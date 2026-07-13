import { AlertCircle, ArrowRight, BriefcaseBusiness, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";

import type { PortfolioReadModel } from "../../../shared/contracts";
import { Button } from "../../components/ui/Button";

interface PortfolioAllocationPanelProps {
  error: string | null;
  isLoading: boolean;
  onRetry: () => void;
  portfolio: PortfolioReadModel | null;
}

function allocationLabel(value: number | null): string {
  return value === null ? "Not allocated" : `${value.toFixed(0)}%`;
}

export function PortfolioAllocationPanel({
  error,
  isLoading,
  onRetry,
  portfolio,
}: PortfolioAllocationPanelProps) {
  if (isLoading && !portfolio) {
    return (
      <section
        aria-busy="true"
        aria-label="Loading portfolio allocation"
        className="rounded-xl border border-relay-border bg-relay-surface p-5 sm:p-6"
      >
        <div className="h-4 w-32 animate-pulse rounded bg-relay-raised" />
        <div className="mt-6 h-3 animate-pulse rounded-full bg-relay-raised" />
        <div className="mt-6 space-y-3">
          {[0, 1, 2, 3].map((item) => (
            <div
              className="h-14 animate-pulse rounded-lg bg-relay-raised"
              key={item}
            />
          ))}
        </div>
      </section>
    );
  }

  if (error && !portfolio) {
    return (
      <section className="rounded-xl border border-relay-negative/35 bg-relay-negative/5 p-5 sm:p-6">
        <AlertCircle
          aria-hidden="true"
          className="size-5 text-relay-negative"
        />
        <h2 className="mt-4 text-lg font-semibold">Portfolio unavailable</h2>
        <p className="mt-2 text-sm leading-6 text-relay-muted">{error}</p>
        <Button className="mt-5" onClick={onRetry}>
          <RefreshCw aria-hidden="true" className="size-4" />
          Retry portfolio
        </Button>
      </section>
    );
  }

  const holdings = portfolio?.holdings ?? [];
  const allocationTotal = holdings.reduce(
    (total, holding) => total + (holding.allocationPercent ?? 0),
    0,
  );

  return (
    <section className="rounded-xl border border-relay-border bg-relay-surface p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-xs font-medium text-relay-muted">
            <BriefcaseBusiness aria-hidden="true" className="size-4" />
            Current portfolio
          </p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight">
            Holdings and allocation
          </h2>
        </div>
        <div className="text-right">
          <p className="text-2xl font-semibold tracking-tight">
            {allocationTotal.toFixed(0)}%
          </p>
          <p className="mt-1 text-xs text-relay-muted">allocated</p>
        </div>
      </div>

      {portfolio?.allocationNote ? (
        <p className="mt-4 rounded-md border border-relay-warning/25 bg-relay-warning/5 px-3 py-2 text-xs leading-5 text-relay-warning">
          {portfolio.allocationNote}
        </p>
      ) : null}

      {holdings.length ? (
        <>
          <div
            aria-hidden="true"
            className="mt-6 flex h-2 overflow-hidden rounded-full bg-relay-deep"
          >
            {holdings.map((holding, index) => (
              <span
                className="h-full border-r border-relay-bg/80 bg-relay-accent last:border-r-0"
                key={holding.id}
                style={{
                  opacity: Math.max(0.45, 1 - index * 0.14),
                  width: `${holding.allocationPercent ?? 0}%`,
                }}
              />
            ))}
          </div>

          <ol className="mt-5 divide-y divide-relay-border">
            {holdings.map((holding) => {
              const primaryThesis = holding.thesisExposures[0];
              return (
                <li key={holding.id}>
                  <Link
                    className="group grid min-h-[72px] grid-cols-[minmax(0,1fr)_auto] items-center gap-4 py-3"
                    to={
                      primaryThesis
                        ? `/theses/${encodeURIComponent(primaryThesis.thesisId)}`
                        : "/theses"
                    }
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <span className="text-base font-semibold tracking-tight group-hover:text-relay-accent">
                          {holding.symbol ?? holding.name}
                        </span>
                        {holding.symbol ? (
                          <span className="truncate text-xs text-relay-muted">
                            {holding.name}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-xs leading-5 text-relay-muted">
                        {holding.thesisExposures.length} linked macro thesis
                        {holding.thesisExposures.length === 1 ? "" : "es"}
                        {holding.latestDecision
                          ? ` · Last decision: ${holding.latestDecision.action}`
                          : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold">
                        {allocationLabel(holding.allocationPercent)}
                      </span>
                      <ArrowRight
                        aria-hidden="true"
                        className="size-4 text-relay-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-relay-accent"
                      />
                    </div>
                  </Link>
                </li>
              );
            })}
          </ol>
        </>
      ) : (
        <div className="mt-6 border-t border-relay-border py-8 text-center">
          <h3 className="text-sm font-semibold">No holdings yet</h3>
          <p className="mt-2 text-sm leading-6 text-relay-muted">
            Add holdings before using Relay to compare portfolio exposure.
          </p>
        </div>
      )}

      {portfolio?.watchlist.length ? (
        <div className="mt-5 flex items-center justify-between gap-4 border-t border-relay-border pt-4 text-sm">
          <span className="text-relay-muted">
            {portfolio.watchlist.length} future candidate
            {portfolio.watchlist.length === 1 ? "" : "s"}
          </span>
          <Link className="text-relay-accent hover:text-white" to="/theses">
            Compare in theses
          </Link>
        </div>
      ) : null}
    </section>
  );
}
