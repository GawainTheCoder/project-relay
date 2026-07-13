import {
  ArrowRight,
  BrainCircuit,
  Building2,
  CalendarClock,
  ChevronDown,
  Layers3,
  Network,
  Plus,
  Search,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import type {
  DashboardPayload,
  LayerId,
  PortfolioReadModel,
  ThesisSourceCoverage,
} from "../../shared/contracts";
import { PageError, PageLoading } from "../components/ui/AsyncState";
import { Button } from "../components/ui/Button";
import { ThesisMomentumBadge } from "../components/ui/ThesisMomentumBadge";
import { useDashboard } from "../context/useDashboard";
import { useBeliefs } from "../features/beliefs/useBeliefs";
import { AddCompanyDialog } from "../features/companies/AddCompanyDialog";
import { useInvestmentWorkspace } from "../features/investment/useInvestmentWorkspace";
import { SourceCoverageBadge } from "../features/sources/SourceCoverageAudit";
import { StackContextSection } from "../features/stack/StackContextSection";
import type { BeliefSummary } from "../lib/api";
import { formatDate, getLayerName } from "../lib/format";
import { companyThesisPath } from "../lib/thesisRoutes";

type ThesisStatusFilter =
  | "all"
  | "strengthening"
  | "unchanged"
  | "weakening"
  | "review";

interface MacroThesisGroup {
  companies: BeliefSummary[];
  macro: BeliefSummary;
}

function normalizeSearch(value: string): string {
  return value.trim().toLowerCase();
}

function matchesStatus(
  belief: BeliefSummary,
  status: ThesisStatusFilter,
): boolean {
  if (status === "review") {
    return (
      belief.pendingEvaluationCount > 0 || belief.awaitingEvaluationCount > 0
    );
  }
  if (status !== "all") {
    return belief.momentum === status;
  }
  return true;
}

function matchesQuery(belief: BeliefSummary, query: string): boolean {
  if (!query) {
    return true;
  }
  return [
    belief.title,
    belief.statement,
    belief.companyTicker,
    ...belief.layerIds,
    ...belief.bottlenecks.map((bottleneck) => bottleneck.title),
    ...belief.captureMechanisms.map((capture) => capture.mechanism),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(query);
}

function getMacroCompanyTickers(
  macro: BeliefSummary,
  data: DashboardPayload,
): Set<string> {
  return new Set(
    data.layers
      .filter((layer) => macro.layerIds.includes(layer.id))
      .flatMap((layer) => layer.companyTickers),
  );
}

function isRelatedCompanyThesis(
  company: BeliefSummary,
  macro: BeliefSummary,
  data: DashboardPayload,
): boolean {
  const explicitCompanyTickers = new Set([
    ...macro.companyTickers,
    ...macro.captureMechanisms.map((capture) => capture.companyTicker),
  ]);
  if (explicitCompanyTickers.size > 0) {
    return Boolean(
      company.companyTicker &&
        explicitCompanyTickers.has(company.companyTicker),
    );
  }

  // Keep the layer inference only for older local data without explicit links.
  const macroCompanyTickers = getMacroCompanyTickers(macro, data);
  const sharesLayer = company.layerIds.some((layerId) =>
    macro.layerIds.includes(layerId),
  );
  return Boolean(
    sharesLayer ||
      (company.companyTicker &&
        macroCompanyTickers.has(company.companyTicker)),
  );
}

function filterBelief(
  belief: BeliefSummary,
  query: string,
  status: ThesisStatusFilter,
): boolean {
  return matchesStatus(belief, status) && matchesQuery(belief, query);
}

function buildMacroThesisGroups(
  beliefs: BeliefSummary[],
  data: DashboardPayload,
  query: string,
  status: ThesisStatusFilter,
): {
  groups: MacroThesisGroup[];
  orphanCompanies: BeliefSummary[];
} {
  const normalizedQuery = normalizeSearch(query);
  const macroTheses = beliefs.filter((belief) => belief.kind === "macro");
  const companyTheses = beliefs.filter((belief) => belief.kind === "company");
  const relatedCompanyIds = new Set<string>();
  const groups = macroTheses.flatMap((macro) => {
    const relatedCompanies = companyTheses.filter((company) =>
      isRelatedCompanyThesis(company, macro, data),
    );
    relatedCompanies.forEach((company) => relatedCompanyIds.add(company.id));
    const visibleCompanies = relatedCompanies.filter((company) =>
      filterBelief(company, normalizedQuery, status),
    );
    const macroMatches = filterBelief(macro, normalizedQuery, status);
    const queryMatchesMacro = matchesQuery(macro, normalizedQuery);
    const companies = queryMatchesMacro
      ? relatedCompanies.filter((company) => matchesStatus(company, status))
      : visibleCompanies;
    if (!macroMatches && companies.length === 0) {
      return [];
    }
    return [{ macro, companies }];
  });
  const orphanCompanies = companyTheses.filter(
    (company) =>
      !relatedCompanyIds.has(company.id) &&
      filterBelief(company, normalizedQuery, status),
  );

  return { groups, orphanCompanies };
}

function totalPending(group: MacroThesisGroup): number {
  return (
    group.macro.pendingEvaluationCount +
    group.companies.reduce(
      (total, company) => total + company.pendingEvaluationCount,
      0,
    )
  );
}

function linkedPortfolioItems(
  thesisId: string,
  portfolio: PortfolioReadModel | null,
) {
  return (portfolio?.items ?? []).filter((item) =>
    item.thesisExposures.some((exposure) => exposure.thesisId === thesisId),
  );
}

function ThesisMeta({ belief }: { belief: BeliefSummary }) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-relay-subtle">
      {belief.pendingEvaluationCount ? (
        <span className="text-relay-warning">
          {belief.pendingEvaluationCount} pending review
        </span>
      ) : null}
      {belief.awaitingEvaluationCount ? (
        <span className="text-relay-accent">
          {belief.awaitingEvaluationCount} awaiting evaluation
        </span>
      ) : null}
      <time dateTime={belief.updatedAt}>
        Updated{" "}
        {formatDate(belief.updatedAt, {
          month: "short",
          day: "numeric",
          year: "numeric",
        })}
      </time>
    </div>
  );
}

function CompanyThesisRow({
  belief,
  captureMechanism,
}: {
  belief: BeliefSummary;
  captureMechanism: string | null;
}) {
  return (
    <Link
      className="group grid gap-3 border-t border-relay-border px-4 py-4 transition-colors hover:bg-relay-surface sm:grid-cols-[minmax(0,1fr)_auto]"
      to={`/theses/${encodeURIComponent(belief.id)}`}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2 text-xs text-relay-subtle">
          <Building2 aria-hidden="true" className="size-3 text-relay-accent" />
          <span>{belief.companyTicker ?? "Company"}</span>
          {belief.layerIds.slice(0, 2).map((layerId) => (
            <span key={layerId}>{getLayerName(layerId as LayerId)}</span>
          ))}
        </div>
        <h3 className="mt-2 text-sm font-semibold tracking-tight group-hover:text-relay-accent">
          {belief.title}
        </h3>
        <p className="mt-1 line-clamp-2 text-sm leading-6 text-relay-muted">
          {captureMechanism ?? belief.statement}
        </p>
        <ThesisMeta belief={belief} />
      </div>
      <ArrowRight
        aria-hidden="true"
        className="mt-1 size-4 text-relay-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-relay-accent"
      />
    </Link>
  );
}

function MacroThesisSection({
  group,
  isExpanded,
  onToggle,
  portfolio,
  sourceCoverage,
}: {
  group: MacroThesisGroup;
  isExpanded: boolean;
  onToggle: () => void;
  portfolio: PortfolioReadModel | null;
  sourceCoverage: ThesisSourceCoverage | undefined;
}) {
  const companiesId = `macro-companies-${group.macro.id}`;
  const portfolioItems = linkedPortfolioItems(group.macro.id, portfolio);

  return (
    <section className="border-t border-relay-border">
      <button
        aria-controls={companiesId}
        aria-expanded={isExpanded}
        className="group grid w-full gap-5 px-3 py-6 text-left transition-colors hover:bg-relay-surface focus-visible:bg-relay-surface sm:grid-cols-[minmax(0,1fr)_220px] sm:px-5"
        onClick={onToggle}
        type="button"
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <Network
              aria-hidden="true"
              className="size-3.5 text-relay-accent"
            />
            <ThesisMomentumBadge momentum={group.macro.momentum} />
            <span className="text-xs text-relay-muted">
              {group.macro.confidence >= 75
                ? "High confidence"
                : group.macro.confidence >= 50
                  ? "Medium confidence"
                  : "Low confidence"}
            </span>
          </div>
          <h2 className="mt-3 text-lg font-semibold tracking-tight group-hover:text-relay-accent">
            {group.macro.title}
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-relay-muted">
            {group.macro.statement}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {group.macro.bottlenecks.slice(0, 3).map((bottleneck) => (
              <span
                className="rounded-md border border-relay-border px-2 py-1 text-xs text-relay-muted"
                key={bottleneck.key}
              >
                {bottleneck.title}
              </span>
            ))}
          </div>
        </div>
        <div className="flex items-start justify-between gap-4 sm:border-l sm:border-relay-border sm:pl-6">
          <div className="text-xs text-relay-muted">
            <div>
              {portfolioItems.length
                ? portfolioItems
                    .slice(0, 4)
                    .map((item) => item.symbol ?? item.name)
                    .join(" · ")
                : "No portfolio exposure"}
            </div>
            <div className="mt-2">{group.companies.length} companies</div>
            {totalPending(group) ? (
              <div className="mt-2 text-relay-warning">
                {totalPending(group)} pending
              </div>
            ) : null}
            {group.macro.nextReviewOn ? (
              <div className="mt-2 flex items-center gap-1.5">
                <CalendarClock aria-hidden="true" className="size-3.5" />
                Review {formatDate(group.macro.nextReviewOn)}
              </div>
            ) : null}
          </div>
          <ChevronDown
            aria-hidden="true"
            className={`size-4 shrink-0 text-relay-subtle transition-transform group-hover:text-relay-accent ${
              isExpanded ? "rotate-180" : ""
            }`}
          />
        </div>
      </button>
      <div className="flex items-center justify-between border-t border-relay-border px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-center gap-2 text-xs text-relay-muted">
          <span>
            {group.companies.length
              ? `${group.companies.length} related ${
                  group.companies.length === 1 ? "company" : "companies"
                }`
              : "No related companies"}
          </span>
          {sourceCoverage ? (
            <SourceCoverageBadge status={sourceCoverage.status} />
          ) : null}
        </div>
        <Link
          className="inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 text-xs text-relay-muted hover:text-relay-accent"
          to={`/theses/${encodeURIComponent(group.macro.id)}`}
        >
          Open macro thesis
          <ArrowRight aria-hidden="true" className="size-3.5" />
        </Link>
      </div>
      {isExpanded && group.companies.length ? (
        <div
          className="ml-4 border-l border-relay-border sm:ml-8"
          id={companiesId}
        >
          {group.companies.map((company) => (
            <CompanyThesisRow
              belief={company}
              captureMechanism={
                group.macro.captureMechanisms.find(
                  (capture) =>
                    capture.companyTicker === company.companyTicker,
                )?.mechanism ?? null
              }
              key={company.id}
            />
          ))}
        </div>
      ) : (
        <div hidden id={companiesId} />
      )}
    </section>
  );
}

function normalizeStatus(value: string | null): ThesisStatusFilter {
  if (value === "pending" || value === "awaiting" || value === "review") {
    return "review";
  }
  return value === "strengthening" ||
    value === "unchanged" ||
    value === "weakening"
    ? value
    : "all";
}

export function BeliefsPage() {
  const { data, error, isLoading, reload } = useDashboard();
  const investment = useInvestmentWorkspace();
  const beliefs = useBeliefs(data);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const [expandedMacroIds, setExpandedMacroIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const status = normalizeStatus(searchParams.get("status"));
  const showStackContext = searchParams.get("context") === "stack";

  const coverageByThesisId = useMemo(
    () =>
      new Map(
        (data?.sourceCoverage ?? []).map((coverage) => [
          coverage.thesisId,
          coverage,
        ]),
      ),
    [data?.sourceCoverage],
  );
  const grouped = useMemo(
    () =>
      data
        ? buildMacroThesisGroups(beliefs, data, query, status)
        : { groups: [], orphanCompanies: [] },
    [beliefs, data, query, status],
  );
  const reviewTotal = beliefs.reduce(
    (total, belief) =>
      total +
      (belief.pendingEvaluationCount > 0 ||
      belief.awaitingEvaluationCount > 0
        ? 1
        : 0),
    0,
  );

  if (isLoading) {
    return <PageLoading label="Loading theses" />;
  }
  if (error || !data) {
    return (
      <PageError
        error={error ?? "Thesis intelligence is unavailable."}
        onRetry={() => void reload()}
      />
    );
  }

  const setStatus = (nextStatus: ThesisStatusFilter) => {
    const next = new URLSearchParams(searchParams);
    if (nextStatus === "all") {
      next.delete("status");
    } else {
      next.set("status", nextStatus);
    }
    setSearchParams(next);
  };
  const openStackContext = () => {
    const next = new URLSearchParams(searchParams);
    next.set("context", "stack");
    setSearchParams(next);
  };
  const toggleMacroCompanies = (macroId: string) => {
    setExpandedMacroIds((current) => {
      const next = new Set(current);
      if (next.has(macroId)) {
        next.delete(macroId);
      } else {
        next.add(macroId);
      }
      return next;
    });
  };

  return (
    <div className="relay-enter min-h-screen">
      <header className="border-b border-relay-border px-5 py-7 sm:px-8 lg:px-10">
        <div className="mx-auto flex max-w-[1360px] flex-wrap items-end justify-between gap-5">
          <div>
            <p className="flex items-center gap-2 text-xs font-medium text-relay-accent">
              <BrainCircuit aria-hidden="true" className="size-3.5" />
              Macro thesis map
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.025em] sm:text-4xl">
              Theses
            </h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-relay-muted">
              Follow each belief from bottleneck to company capture, evidence,
              portfolio exposure, and its next review.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={openStackContext} variant="secondary">
              <Layers3 aria-hidden="true" className="size-3.5" />
              Stack context
            </Button>
            <Button
              onClick={() => setIsAddDialogOpen(true)}
              variant="primary"
            >
              <Plus aria-hidden="true" className="size-3.5" />
              Add company thesis
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1360px] px-5 py-7 sm:px-8 lg:px-10">
        <div className="grid gap-3 border-b border-relay-border pb-4 lg:grid-cols-[1fr_auto] lg:items-center">
          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                "all",
                "strengthening",
                "unchanged",
                "weakening",
                "review",
              ] as const
            ).map((item) => (
              <button
                className={`min-h-11 rounded-md border px-3 text-xs font-medium capitalize transition-colors ${
                  status === item
                    ? "border-relay-accent bg-relay-accent/10 text-relay-accent"
                    : "border-relay-control text-relay-muted hover:border-relay-accent/60 hover:text-relay-text"
                }`}
                key={item}
                onClick={() => setStatus(item)}
                type="button"
              >
                {item === "review" ? `Needs review ${reviewTotal}` : item}
              </button>
            ))}
          </div>
          <label className="flex min-h-11 w-full items-center gap-2 rounded-md border border-relay-control bg-relay-surface px-3 lg:w-80">
            <Search
              aria-hidden="true"
              className="size-3.5 text-relay-subtle"
            />
            <span className="sr-only">Filter theses</span>
            <input
              className="min-w-0 flex-1 bg-transparent text-sm placeholder:text-relay-subtle"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter theses"
              value={query}
            />
          </label>
        </div>

        {showStackContext ? (
          <div className="py-7">
            <StackContextSection data={data} />
          </div>
        ) : null}

        <div className="flex items-center justify-between py-4 text-xs text-relay-muted">
          <p className="font-medium">Macro thesis map</p>
          <span className="text-relay-subtle">
            {grouped.groups.length} macro ·{" "}
            {grouped.groups.reduce(
              (total, group) => total + group.companies.length,
              0,
            ) + grouped.orphanCompanies.length}{" "}
            company
          </span>
        </div>

        {grouped.groups.length || grouped.orphanCompanies.length ? (
          <div className="overflow-hidden rounded-xl border border-relay-border bg-relay-deep">
            {grouped.groups.map((group) => (
              <MacroThesisSection
                group={group}
                isExpanded={expandedMacroIds.has(group.macro.id)}
                key={group.macro.id}
                onToggle={() => toggleMacroCompanies(group.macro.id)}
                portfolio={investment.portfolio}
                sourceCoverage={coverageByThesisId.get(group.macro.id)}
              />
            ))}
            {grouped.orphanCompanies.length ? (
              <section className="border-t border-relay-border">
                <div className="px-2 py-5 sm:px-4">
                  <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.1em] text-relay-muted">
                    <Building2
                      aria-hidden="true"
                      className="size-3.5 text-relay-accent"
                    />
                    Company theses
                  </div>
                </div>
                <div className="ml-4 border-l border-relay-border sm:ml-8">
                  {grouped.orphanCompanies.map((company) => (
                    <CompanyThesisRow
                      belief={company}
                      captureMechanism={null}
                      key={company.id}
                    />
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        ) : (
          <section className="grid min-h-64 place-items-center border-y border-relay-border px-5 text-center">
            <div className="max-w-md">
              <Network
                aria-hidden="true"
                className="mx-auto size-5 text-relay-subtle"
              />
              <h2 className="mt-4 text-sm font-semibold">
                No theses match this view
              </h2>
              <p className="mt-2 text-sm leading-6 text-relay-muted">
                Clear the filter or add a company thesis to expand the model.
              </p>
            </div>
          </section>
        )}
      </main>

      <AddCompanyDialog
        isOpen={isAddDialogOpen}
        onClose={() => setIsAddDialogOpen(false)}
        onCreated={async (ticker) => {
          await reload();
          navigate(companyThesisPath(ticker));
        }}
      />
    </div>
  );
}
