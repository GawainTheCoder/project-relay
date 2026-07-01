import {
  BrainCircuit,
  Building2,
  Network,
  Plus,
  Search,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { PageError, PageLoading } from "../components/ui/AsyncState";
import { Button } from "../components/ui/Button";
import { useDashboard } from "../context/useDashboard";
import { AddCompanyDialog } from "../features/companies/AddCompanyDialog";
import { BeliefCard } from "../features/beliefs/BeliefCard";
import { useBeliefs } from "../features/beliefs/useBeliefs";
import type { BeliefKind } from "../lib/api";
import { companyThesisPath } from "../lib/thesisRoutes";

const beliefTabs: { icon: typeof Building2; id: BeliefKind; label: string }[] = [
  { icon: Building2, id: "company", label: "Company" },
  { icon: Network, id: "macro", label: "Macro" },
];

export function BeliefsPage() {
  const { data, error, isLoading, reload } = useDashboard();
  const beliefs = useBeliefs(data);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const requestedKind = searchParams.get("type");
  const kind: BeliefKind = requestedKind === "macro" ? "macro" : "company";

  const visibleBeliefs = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return beliefs.filter(
      (belief) =>
        belief.kind === kind &&
        (!normalizedQuery ||
          [
            belief.title,
            belief.statement,
            belief.companyTicker,
            ...belief.layerIds,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(normalizedQuery)),
    );
  }, [beliefs, kind, query]);
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
              Current theses, confidence, contradictory evidence, and the
              conditions that would change your mind.
            </p>
          </div>
          {kind === "company" ? (
            <Button
              className="h-10"
              onClick={() => setIsAddDialogOpen(true)}
              variant="primary"
            >
              <Plus aria-hidden="true" className="size-3.5" />
              Add company thesis
            </Button>
          ) : null}
        </div>
      </header>

      <main className="mx-auto max-w-[1280px] px-5 py-7 sm:px-8 lg:px-10">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-relay-border pb-4">
          <div
            aria-label="Thesis type"
            className="flex items-center rounded-md border border-relay-border bg-relay-deep p-1"
            role="tablist"
          >
            {beliefTabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = kind === tab.id;
              return (
                <button
                  aria-selected={isActive}
                  className={`inline-flex h-8 items-center gap-2 rounded px-3 text-xs transition-colors ${
                    isActive
                      ? "bg-relay-surface-2 text-relay-text"
                      : "text-relay-muted hover:text-relay-text"
                  }`}
                  key={tab.id}
                  onClick={() =>
                    setSearchParams(
                      tab.id === "macro" ? { type: "macro" } : {},
                    )
                  }
                  role="tab"
                  type="button"
                >
                  <Icon
                    aria-hidden="true"
                    className={`size-3.5 ${
                      isActive ? "text-relay-accent" : ""
                    }`}
                  />
                  {tab.label}
                </button>
              );
            })}
          </div>
          <label className="flex h-10 w-full items-center gap-2 rounded-md border border-relay-border bg-relay-surface px-3 sm:w-72">
            <Search
              aria-hidden="true"
              className="size-3.5 text-relay-subtle"
            />
            <span className="sr-only">Filter theses</span>
            <input
              className="min-w-0 flex-1 bg-transparent text-sm placeholder:text-relay-subtle"
              onChange={(event) => setQuery(event.target.value)}
              placeholder={`Filter ${kind} theses`}
              value={query}
            />
          </label>
        </div>

        <div className="flex items-center justify-between py-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-relay-muted">
            {kind} theses
          </p>
          <span className="font-mono text-[10px] text-relay-subtle">
            {visibleBeliefs.length} tracked
          </span>
        </div>

        {visibleBeliefs.length ? (
          <div className="border-t border-relay-border">
            {visibleBeliefs.map((belief) => (
              <BeliefCard
                belief={belief}
                key={belief.id}
                sourceCoverage={coverageByThesisId.get(belief.id)}
              />
            ))}
          </div>
        ) : (
          <section className="grid min-h-64 place-items-center border-y border-relay-border px-5 text-center">
            <div className="max-w-md">
              {kind === "macro" ? (
                <Network
                  aria-hidden="true"
                  className="mx-auto size-5 text-relay-subtle"
                />
              ) : (
                <Building2
                  aria-hidden="true"
                  className="mx-auto size-5 text-relay-subtle"
                />
              )}
              <h2 className="mt-4 text-sm font-semibold">
                {query
                  ? "No theses match this filter"
                  : `No ${kind} theses yet`}
              </h2>
              <p className="mt-2 text-sm leading-6 text-relay-muted">
                {kind === "macro"
                  ? "Macro theses appear here when Relay begins tracking stack-wide bottlenecks and structural shifts."
                  : "Add a company thesis to define what evidence should strengthen or weaken your view."}
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
