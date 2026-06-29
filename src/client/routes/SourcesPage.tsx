import {
  AlertCircle,
  Check,
  Clock3,
  FilePlus2,
  LoaderCircle,
  RefreshCw,
  Rss,
  Sparkles,
} from "lucide-react";
import { useCallback, useState } from "react";

import type { ResearchSource } from "../../shared/contracts";
import { PageError, PageLoading } from "../components/ui/AsyncState";
import { Button } from "../components/ui/Button";
import { useDashboard } from "../context/useDashboard";
import { ImportSourceDialog } from "../features/sources/ImportSourceDialog";
import { formatRelativeTime } from "../lib/format";

type Action = "refresh" | "brief";

const sourceTypeLabels: Record<ResearchSource["type"], string> = {
  rss: "RSS feed",
  "investor-relations": "Official company",
  filing: "Company disclosure",
  paper: "Research feed",
  release: "Release feed",
  manual: "On-demand source",
};

function SourceStatus({ source }: { source: ResearchSource }) {
  const label = !source.enabled
    ? "On demand"
    : source.status === "ready"
      ? "Ready"
      : source.status === "syncing"
        ? "Refreshing"
        : "Needs attention";
  const color = !source.enabled
    ? "bg-relay-subtle"
    : source.status === "ready"
      ? "bg-relay-positive"
      : source.status === "syncing"
        ? "animate-pulse bg-relay-warning"
        : "bg-relay-negative";

  return (
    <span className="inline-flex items-center gap-2 text-xs text-relay-muted">
      <span aria-hidden="true" className={`size-2 rounded-full ${color}`} />
      {label}
    </span>
  );
}

export function SourcesPage() {
  const {
    data,
    error,
    isLoading,
    regenerateBrief,
    reload,
    refreshAllSources,
  } = useDashboard();
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [activeAction, setActiveAction] = useState<Action | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const closeImport = useCallback(() => setIsImportOpen(false), []);

  if (isLoading) {
    return <PageLoading label="Checking trusted sources" />;
  }
  if (error || !data) {
    return (
      <PageError
        error={error ?? "Source health is unavailable."}
        onRetry={() => void reload()}
      />
    );
  }

  const runAction = async (action: Action) => {
    setActiveAction(action);
    setActionError(null);
    setActionMessage(null);
    try {
      if (action === "refresh") {
        const result = await refreshAllSources();
        setActionMessage(
          `Refresh complete: ${result.imported} new, ${result.analyzed} analyzed${
            result.errors.length
              ? `, ${result.errors.length} source error${result.errors.length === 1 ? "" : "s"}`
              : ""
          }.`,
        );
      } else {
        await regenerateBrief();
        setActionMessage(
          "Today’s brief was generated from thesis-changing signals.",
        );
      }
    } catch (caughtError) {
      setActionError(
        caughtError instanceof Error
          ? caughtError.message
          : "The action could not be completed.",
      );
    } finally {
      setActiveAction(null);
    }
  };

  const enabledSources = data.sources.filter((source) => source.enabled);
  const healthySources = enabledSources.filter(
    (source) => source.status === "ready",
  ).length;
  const onDemandSources = data.sources.length - enabledSources.length;

  return (
    <div className="relay-enter min-h-screen">
      <header className="border-b border-relay-border px-5 py-5 sm:px-8 lg:px-10">
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-relay-muted">
              High-signal intake
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              Trusted sources
            </h1>
          </div>
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            <Button
              className="flex-1 sm:flex-none"
              disabled={activeAction !== null}
              onClick={() => void runAction("refresh")}
            >
              {activeAction === "refresh" ? (
                <LoaderCircle
                  aria-hidden="true"
                  className="size-3.5 animate-spin"
                />
              ) : (
                <RefreshCw aria-hidden="true" className="size-3.5" />
              )}
              Refresh
            </Button>
            <Button
              className="flex-1 sm:flex-none"
              disabled={activeAction !== null || data.updates.length === 0}
              onClick={() => void runAction("brief")}
            >
              {activeAction === "brief" ? (
                <LoaderCircle
                  aria-hidden="true"
                  className="size-3.5 animate-spin"
                />
              ) : (
                <Sparkles aria-hidden="true" className="size-3.5" />
              )}
              Generate brief
            </Button>
            <Button
              className="w-full sm:w-auto"
              onClick={() => setIsImportOpen(true)}
              variant="primary"
            >
              <FilePlus2 aria-hidden="true" className="size-3.5" />
              Add signal
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1280px] px-5 py-7 sm:px-8 lg:px-10 lg:py-10">
        {actionMessage ? (
          <div
            className="mb-5 flex items-center gap-2 rounded-md border border-relay-positive/30 bg-relay-positive/8 px-3 py-2.5 text-xs text-relay-positive"
            role="status"
          >
            <Check aria-hidden="true" className="size-3.5" />
            {actionMessage}
          </div>
        ) : null}
        {actionError ? (
          <div
            className="mb-5 flex items-center gap-2 rounded-md border border-relay-negative/30 bg-relay-negative/8 px-3 py-2.5 text-xs text-relay-negative"
            role="alert"
          >
            <AlertCircle aria-hidden="true" className="size-3.5" />
            {actionError}
          </div>
        ) : null}

        <section
          aria-label="Source health summary"
          className="grid gap-px overflow-hidden rounded-md border border-relay-border bg-relay-border sm:grid-cols-3"
        >
          <div className="bg-relay-surface p-5">
            <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-relay-subtle">
              Monitored
            </p>
            <p className="mt-2 text-2xl font-semibold">
              {enabledSources.length}
            </p>
            <p className="mt-1 text-xs text-relay-muted">automated feeds</p>
          </div>
          <div className="bg-relay-surface p-5">
            <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-relay-subtle">
              Ready
            </p>
            <p className="mt-2 text-2xl font-semibold text-relay-positive">
              {healthySources}/{enabledSources.length}
            </p>
            <p className="mt-1 text-xs text-relay-muted">feeds available</p>
          </div>
          <div className="bg-relay-surface p-5">
            <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-relay-subtle">
              On demand
            </p>
            <p className="mt-2 text-2xl font-semibold">{onDemandSources}</p>
            <p className="mt-1 text-xs text-relay-muted">
              URL or excerpt sources
            </p>
          </div>
        </section>

        <section className="mt-9">
          <div className="flex items-end justify-between border-b border-relay-border pb-3">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">
                Source health
              </h2>
              <p className="mt-1 text-sm text-relay-muted">
                Specialist feeds, official company channels, and manual context.
              </p>
            </div>
            <Rss aria-hidden="true" className="size-4 text-relay-subtle" />
          </div>

          {data.sources.length ? (
            <div className="divide-y divide-relay-border">
              {data.sources.map((source) => (
                <article
                  className="grid gap-4 py-5 sm:grid-cols-[minmax(220px,1fr)_150px_130px_150px]"
                  key={source.id}
                >
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-medium">
                      {source.name}
                    </h3>
                    {source.url ? (
                      <p className="mt-1 truncate text-xs text-relay-subtle">
                        {source.url}
                      </p>
                    ) : (
                      <p className="mt-1 text-xs text-relay-subtle">
                        Add excerpts manually when permitted.
                      </p>
                    )}
                  </div>
                  <div>
                    <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-relay-subtle">
                      Source
                    </p>
                    <p className="mt-1 text-xs text-relay-muted">
                      {sourceTypeLabels[source.type]}
                    </p>
                  </div>
                  <div>
                    <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-relay-subtle">
                      Status
                    </p>
                    <div className="mt-1">
                      <SourceStatus source={source} />
                    </div>
                  </div>
                  <div>
                    <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-relay-subtle">
                      Last checked
                    </p>
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-relay-muted">
                      <Clock3 aria-hidden="true" className="size-3" />
                      {!source.enabled
                        ? "On demand"
                        : source.lastSyncedAt
                          ? formatRelativeTime(source.lastSyncedAt)
                          : "Not yet checked"}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="grid min-h-52 place-items-center border-b border-relay-border text-center">
              <p className="text-sm text-relay-muted">
                No trusted sources are configured yet.
              </p>
            </div>
          )}
        </section>

        <section className="mt-10 border-l border-relay-border-strong pl-5">
          <h2 className="text-sm font-semibold">Manual context boundary</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-relay-muted">
            Paste only the excerpts you are authorized to process. Relay uses
            them as private context and keeps the supporting evidence local.
          </p>
        </section>
      </main>

      <ImportSourceDialog
        isOpen={isImportOpen}
        onClose={closeImport}
        onImported={reload}
      />
    </div>
  );
}
