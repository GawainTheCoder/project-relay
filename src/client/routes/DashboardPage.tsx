import { CalendarDays, Eye, Layers3 } from "lucide-react";

import { PageError, PageLoading } from "../components/ui/AsyncState";
import { useDashboard } from "../context/useDashboard";
import { useBeliefs } from "../features/beliefs/useBeliefs";
import { ExposureOverlapPanel } from "../features/investment/ExposureOverlapPanel";
import { PortfolioAllocationPanel } from "../features/investment/PortfolioAllocationPanel";
import { RecentEvidenceList } from "../features/investment/RecentEvidenceList";
import { ReviewAgenda } from "../features/investment/ReviewAgenda";
import { ThesisExposureList } from "../features/investment/ThesisExposureList";
import { useInvestmentWorkspace } from "../features/investment/useInvestmentWorkspace";
import { formatDate } from "../lib/format";

export function DashboardPage() {
  const { data, error, isLoading, reload } = useDashboard();
  const investment = useInvestmentWorkspace();
  const beliefWorkspace = useBeliefs(data);
  const beliefs = beliefWorkspace.beliefs;

  if (isLoading || beliefWorkspace.isLoading) {
    return <PageLoading label="Loading investment dashboard" />;
  }
  if (error || beliefWorkspace.error || !data) {
    return (
      <PageError
        error={
          error ?? beliefWorkspace.error ?? "Dashboard data is unavailable."
        }
        onRetry={() => {
          if (error || !data) {
            void reload();
          }
          if (beliefWorkspace.error) {
            beliefWorkspace.reload();
          }
        }}
      />
    );
  }

  const macroTheses = beliefs.filter((belief) => belief.kind === "macro");
  const reviewsDue = investment.reviews?.actionable.length ?? 0;
  const today = new Date().toISOString();

  return (
    <div className="relay-enter min-h-screen">
      <header className="border-b border-relay-border px-5 py-7 sm:px-8 lg:px-10">
        <div className="mx-auto max-w-[1360px]">
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-relay-muted">
            <p className="flex items-center gap-2 font-medium">
              <CalendarDays aria-hidden="true" className="size-4" />
              {formatDate(today, {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
            </p>
            {investment.portfolio?.allocationBasis === "illustrative-seed" ? (
              <span className="rounded-md border border-relay-warning/30 bg-relay-warning/5 px-2.5 py-1 text-relay-warning">
                Illustrative allocations
              </span>
            ) : null}
          </div>

          <div className="mt-7 grid gap-7 xl:grid-cols-[minmax(0,1fr)_520px] xl:items-end">
            <div>
              <p className="text-xs font-medium text-relay-accent">
                Investment notebook
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-[-0.025em] sm:text-4xl">
                Dashboard
              </h1>
              <p className="mt-3 max-w-2xl text-base leading-7 text-relay-muted">
                See where capital depends on the same assumptions, then review
                what changed before making a portfolio decision.
              </p>
            </div>
            <dl className="grid grid-cols-1 divide-y divide-relay-border rounded-xl border border-relay-border bg-relay-deep min-[380px]:grid-cols-3 min-[380px]:divide-x min-[380px]:divide-y-0">
              <div className="px-3 py-4 sm:px-5">
                <dt className="text-xs text-relay-muted">Holdings</dt>
                <dd className="mt-2 text-2xl font-semibold tracking-tight">
                  {investment.portfolio?.holdings.length ?? "—"}
                </dd>
              </div>
              <div className="px-3 py-4 sm:px-5">
                <dt className="text-xs text-relay-muted">Macro theses</dt>
                <dd className="mt-2 text-2xl font-semibold tracking-tight">
                  {macroTheses.length}
                </dd>
              </div>
              <div className="px-3 py-4 sm:px-5">
                <dt className="text-xs text-relay-muted">Reviews due</dt>
                <dd className="mt-2 text-2xl font-semibold tracking-tight text-relay-accent">
                  {investment.isLoading ||
                  (investment.errors.reviews && !investment.reviews)
                    ? "—"
                    : reviewsDue}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1360px] px-5 py-7 sm:px-8 lg:px-10 lg:py-9">
        <section aria-labelledby="portfolio-overview-title">
          <div className="mb-5 flex items-center gap-2">
            <Eye aria-hidden="true" className="size-4 text-relay-accent" />
            <h2
              className="text-xs font-medium text-relay-muted"
              id="portfolio-overview-title"
            >
              Portfolio overview
            </h2>
          </div>
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.75fr)]">
            <PortfolioAllocationPanel
              error={investment.errors.portfolio}
              isLoading={investment.isLoading}
              onRetry={() => void investment.reload()}
              portfolio={investment.portfolio}
            />
            <ReviewAgenda
              beliefs={beliefs}
              error={investment.errors.reviews}
              isLoading={investment.isLoading}
              onRetry={() => void investment.reload()}
              reviews={investment.reviews}
            />
          </div>
        </section>

        <div className="mt-5">
          <ExposureOverlapPanel portfolio={investment.portfolio} />
        </div>

        <section
          aria-labelledby="thesis-map-title"
          className="mt-10 rounded-xl border border-relay-border bg-relay-surface px-5 py-6 sm:px-6"
        >
          <div className="sr-only" id="thesis-map-title">
            Thesis exposure map
          </div>
          <ThesisExposureList
            beliefs={beliefs}
            error={investment.errors.portfolio}
            isLoading={investment.isLoading}
            onRetry={() => void investment.reload()}
            portfolio={investment.portfolio}
          />
        </section>

        <section
          aria-labelledby="recent-evidence-title"
          className="mt-6 rounded-xl border border-relay-border bg-relay-surface px-5 py-6 sm:px-6"
        >
          <div className="sr-only" id="recent-evidence-title">
            Recent evidence
          </div>
          <RecentEvidenceList updates={data.updates} />
        </section>

        <footer className="mt-8 flex items-center gap-2 border-t border-relay-border pt-5 text-xs leading-5 text-relay-muted">
          <Layers3 aria-hidden="true" className="size-4 shrink-0" />
          Exposure links describe thesis dependency, not a forecast or price-risk
          score.
        </footer>
      </main>
    </div>
  );
}
