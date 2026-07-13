import {
  AlertCircle,
  ArrowRight,
  GitCompareArrows,
  RefreshCw,
} from "lucide-react";
import { Link } from "react-router-dom";

import type { PortfolioReadModel } from "../../../shared/contracts";
import { Button } from "../../components/ui/Button";
import { ThesisMomentumBadge } from "../../components/ui/ThesisMomentumBadge";
import type { BeliefSummary } from "../../lib/api";

function confidenceLabel(confidence: number): string {
  if (confidence >= 75) {
    return "High confidence";
  }
  if (confidence >= 50) {
    return "Medium confidence";
  }
  return "Low confidence";
}

function linkedHoldings(
  thesisId: string,
  portfolio: PortfolioReadModel | null,
) {
  return (portfolio?.holdings ?? []).filter((holding) =>
    holding.thesisExposures.some((exposure) => exposure.thesisId === thesisId),
  );
}

export function ThesisExposureList({
  beliefs,
  error,
  isLoading,
  onRetry,
  portfolio,
}: {
  beliefs: BeliefSummary[];
  error: string | null;
  isLoading: boolean;
  onRetry: () => void;
  portfolio: PortfolioReadModel | null;
}) {
  const macroTheses = beliefs
    .filter((belief) => belief.kind === "macro")
    .sort((left, right) => {
      const leftAllocation = linkedHoldings(left.id, portfolio).reduce(
        (total, item) => total + (item.allocationPercent ?? 0),
        0,
      );
      const rightAllocation = linkedHoldings(right.id, portfolio).reduce(
        (total, item) => total + (item.allocationPercent ?? 0),
        0,
      );
      return rightAllocation - leftAllocation;
    })
    .slice(0, 4);

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-relay-border pb-4">
        <div>
          <p className="flex items-center gap-2 text-xs font-medium text-relay-muted">
            <GitCompareArrows aria-hidden="true" className="size-4" />
            Assumptions behind the portfolio
          </p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight">
            Active macro theses
          </h2>
        </div>
        <Link
          className="inline-flex min-h-11 items-center gap-2 rounded-md px-2 text-sm text-relay-muted hover:text-relay-accent"
          to="/theses"
        >
          View all theses
          <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
      </div>

      {isLoading && !portfolio ? (
        <div aria-busy="true" className="py-7" role="status">
          <span className="sr-only">Loading linked portfolio allocations</span>
          <div className="space-y-4">
            {[0, 1, 2].map((item) => (
              <div
                className="h-20 animate-pulse rounded-lg bg-relay-deep"
                key={item}
              />
            ))}
          </div>
        </div>
      ) : error && !portfolio ? (
        <div className="py-8 text-center">
          <AlertCircle
            aria-hidden="true"
            className="mx-auto size-5 text-relay-negative"
          />
          <h3 className="mt-4 text-sm font-semibold">
            Portfolio exposure unavailable
          </h3>
          <p
            className="mt-2 text-sm leading-6 text-relay-muted"
            role="alert"
          >
            {error}
          </p>
          <Button className="mt-4" onClick={onRetry} variant="quiet">
            <RefreshCw aria-hidden="true" className="size-4" />
            Retry exposure
          </Button>
        </div>
      ) : macroTheses.length ? (
        <ol className="divide-y divide-relay-border">
          {macroTheses.map((thesis) => {
            const holdings = linkedHoldings(thesis.id, portfolio);
            const linkedAllocation = holdings.reduce(
              (total, holding) => total + (holding.allocationPercent ?? 0),
              0,
            );
            return (
              <li key={thesis.id}>
                <Link
                  className="group grid gap-4 py-5 sm:grid-cols-[minmax(0,1fr)_170px] sm:items-center"
                  to={`/theses/${encodeURIComponent(thesis.id)}`}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <ThesisMomentumBadge momentum={thesis.momentum} />
                      <span className="text-xs text-relay-muted">
                        {confidenceLabel(thesis.confidence)}
                      </span>
                    </div>
                    <h3 className="mt-3 text-base font-semibold tracking-tight group-hover:text-relay-accent">
                      {thesis.title}
                    </h3>
                    <p className="mt-2 line-clamp-2 text-sm leading-6 text-relay-muted">
                      {thesis.statement}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-relay-muted">
                      {thesis.bottlenecks.slice(0, 3).map((bottleneck) => (
                        <span
                          className="rounded-md border border-relay-border px-2 py-1"
                          key={bottleneck.key}
                        >
                          {bottleneck.title}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-4 sm:border-l sm:border-relay-border sm:pl-5">
                    <div>
                      <p className="text-xs text-relay-muted">
                        Linked allocation
                      </p>
                      <p className="mt-1 text-xl font-semibold tracking-tight">
                        {linkedAllocation.toFixed(0)}%
                      </p>
                      <p className="mt-2 text-xs text-relay-muted">
                        {holdings.map((holding) => holding.symbol ?? holding.name).join(" · ") ||
                          "No current holding"}
                      </p>
                    </div>
                    <ArrowRight
                      aria-hidden="true"
                      className="size-4 shrink-0 text-relay-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-relay-accent"
                    />
                  </div>
                </Link>
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="py-10 text-center">
          <h3 className="text-sm font-semibold">No active macro theses</h3>
          <p className="mt-2 text-sm leading-6 text-relay-muted">
            Create a macro thesis to connect evidence with portfolio decisions.
          </p>
        </div>
      )}
    </section>
  );
}
