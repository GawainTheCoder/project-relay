import {
  ArrowRight,
  BrainCircuit,
  Building2,
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
  ThesisSourceCoverage,
} from "../../shared/contracts";
import { PageError, PageLoading } from "../components/ui/AsyncState";
import { Button } from "../components/ui/Button";
import { useDashboard } from "../context/useDashboard";
import { useBeliefs } from "../features/beliefs/useBeliefs";
import { AddCompanyDialog } from "../features/companies/AddCompanyDialog";
import { SourceCoverageBadge } from "../features/sources/SourceCoverageAudit";
import { StackContextSection } from "../features/stack/StackContextSection";
import type { BeliefSummary } from "../lib/api";
import { formatDate, getLayerName } from "../lib/format";
import { companyThesisPath } from "../lib/thesisRoutes";

type ThesisStatusFilter = "all" | "pending" | "awaiting";

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
  if (status === "pending") {
    return belief.pendingEvaluationCount > 0;
  }
  if (status === "awaiting") {
    return belief.awaitingEvaluationCount > 0;
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

function totalAwaiting(group: MacroThesisGroup): number {
  return (
    group.macro.awaitingEvaluationCount +
    group.companies.reduce(
      (total, company) => total + company.awaitingEvaluationCount,
      0,
    )
  );
}

function ThesisMeta({ belief }: { belief: BeliefSummary }) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-[9px] uppercase tracking-[0.06em] text-relay-subtle">
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

function CompanyThesisRow({ belief }: { belief: BeliefSummary }) {
  return (
    <Link
      className="group grid gap-3 border-t border-relay-border px-4 py-4 transition-colors hover:bg-relay-surface sm:grid-cols-[minmax(0,1fr)_auto]"
      to={`/theses/${encodeURIComponent(belief.id)}`}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2 font-mono text-[9px] uppercase tracking-[0.08em] text-relay-subtle">
          <Building2 aria-hidden="true" className="size-3 text-relay-accent" />
          <span>{belief.companyTicker ?? "Company"}</span>
          {belief.layerIds.slice(0, 2).map((layerId) => (
            <span key={layerId}>{getLayerName(layerId as LayerId)}</span>
          ))}
        </div>
        <h3 className="mt-2 text-sm font-semibold tracking-tight group-hover:text-relay-accent">
          {belief.title}
        </h3>
        <p className="mt-1 line-clamp-2 text-xs leading-5 text-relay-muted">
          {belief.statement}
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
  sourceCoverage,
}: {
  group: MacroThesisGroup;
  isExpanded: boolean;
  onToggle: () => void;
  sourceCoverage: ThesisSourceCoverage | undefined;
}) {
  const companiesId = `macro-companies-${group.macro.id}`;

  return (
    <section className="border-t border-relay-border">
      <button
        aria-controls={companiesId}
        aria-expanded={isExpanded}
        className="group grid w-full gap-5 px-2 py-6 text-left transition-colors hover:bg-relay-surface focus-visible:bg-relay-surface sm:grid-cols-[minmax(0,1fr)_220px] sm:px-4"
        onClick={onToggle}
        type="button"
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <Network
              aria-hidden="true"
              className="size-3.5 text-relay-accent"
            />
            <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-relay-muted">
              Macro thesis
            </span>
            {group.macro.layerIds.slice(0, 3).map((layerId) => (
              <span
                className="font-mono text-[9px] uppercase tracking-[0.08em] text-relay-subtle"
                key={layerId}
              >
                {getLayerName(layerId as LayerId)}
              </span>
            ))}
            {sourceCoverage ? (
              <SourceCoverageBadge status={sourceCoverage.status} />
            ) : null}
          </div>
          <h2 className="mt-3 text-lg font-semibold tracking-tight group-hover:text-relay-accent">
            {group.macro.title}
          </h2>
          <p className="mt-2 line-clamp-2 max-w-3xl text-sm leading-6 text-relay-muted">
            {group.macro.statement}
          </p>
          <ThesisMeta belief={group.macro} />
        </div>
        <div className="flex items-start justify-between gap-4 sm:border-l sm:border-relay-border sm:pl-6">
          <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-relay-subtle">
            <div>{group.companies.length} companies</div>
            {totalPending(group) ? (
              <div className="mt-2 text-relay-warning">
                {totalPending(group)} pending
              </div>
            ) : null}
            {totalAwaiting(group) ? (
              <div className="mt-2 text-relay-accent">
                {totalAwaiting(group)} awaiting
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
        <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-relay-subtle">
          {group.companies.length
            ? `${group.companies.length} related ${
                group.companies.length === 1 ? "company" : "companies"
              }`
            : "No related companies"}
        </span>
        <Link
          className="inline-flex items-center gap-1.5 text-xs text-relay-muted hover:text-relay-accent"
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
            <CompanyThesisRow belief={company} key={company.id} />
          ))}
        </div>
      ) : (
        <div hidden id={companiesId} />
      )}
    </section>
  );
}

function normalizeStatus(value: string | null): ThesisStatusFilter {
  return value === "pending" || value === "awaiting" ? value : "all";
}

export function BeliefsPage() {
  const { data, error, isLoading, reload } = useDashboard();
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
  const pendingTotal = beliefs.reduce(
    (total, belief) => total + belief.pendingEvaluationCount,
    0,
  );
  const awaitingTotal = beliefs.reduce(
    (total, belief) => total + belief.awaitingEvaluationCount,
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
      <header className="border-b border-relay-border px-5 py-5 sm:px-8 lg:px-10">
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-end justify-between gap-5">
          <div>
            <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-relay-muted">
              <BrainCircuit aria-hidden="true" className="size-3.5" />
              Living mental model
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              Theses
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-relay-muted">
              Macro structure first, with company views nested where evidence
              meets the stack.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              className="h-10"
              onClick={openStackContext}
              variant="secondary"
            >
              <Layers3 aria-hidden="true" className="size-3.5" />
              Stack context
            </Button>
            <Button
              className="h-10"
              onClick={() => setIsAddDialogOpen(true)}
              variant="primary"
            >
              <Plus aria-hidden="true" className="size-3.5" />
              Add company thesis
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1280px] px-5 py-7 sm:px-8 lg:px-10">
        <div className="grid gap-3 border-b border-relay-border pb-4 lg:grid-cols-[1fr_auto] lg:items-center">
          <div className="flex flex-wrap items-center gap-2">
            {(["all", "pending", "awaiting"] as const).map((item) => (
              <button
                className={`h-8 border px-3 font-mono text-[10px] uppercase tracking-[0.08em] transition-colors ${
                  status === item
                    ? "border-relay-accent bg-relay-accent/10 text-relay-accent"
                    : "border-relay-border text-relay-muted hover:border-relay-border-strong hover:text-relay-text"
                }`}
                key={item}
                onClick={() => setStatus(item)}
                type="button"
              >
                {item === "all"
                  ? "All"
                  : item === "pending"
                    ? `${pendingTotal} pending`
                    : `${awaitingTotal} awaiting`}
              </button>
            ))}
          </div>
          <label className="flex h-10 w-full items-center gap-2 border border-relay-border bg-relay-surface px-3 lg:w-80">
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

        <div className="flex items-center justify-between py-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-relay-muted">
            Macro spine
          </p>
          <span className="font-mono text-[10px] text-relay-subtle">
            {grouped.groups.length} macro ·{" "}
            {grouped.groups.reduce(
              (total, group) => total + group.companies.length,
              0,
            ) + grouped.orphanCompanies.length}{" "}
            company
          </span>
        </div>

        {grouped.groups.length || grouped.orphanCompanies.length ? (
          <div className="border-b border-relay-border">
            {grouped.groups.map((group) => (
              <MacroThesisSection
                group={group}
                isExpanded={expandedMacroIds.has(group.macro.id)}
                key={group.macro.id}
                onToggle={() => toggleMacroCompanies(group.macro.id)}
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
                    <CompanyThesisRow belief={company} key={company.id} />
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
