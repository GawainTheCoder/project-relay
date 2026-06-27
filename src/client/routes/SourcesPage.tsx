import {
  AlertCircle,
  Check,
  Clock3,
  Database,
  FilePlus2,
  LoaderCircle,
  RefreshCw,
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
  rss: "RSS",
  "investor-relations": "Investor relations",
  filing: "Filing",
  paper: "Paper",
  release: "Release",
  manual: "Manual",
};

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
    return <PageLoading label="Checking source health" />;
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
          `Refresh complete: ${result.imported} imported, ${result.analyzed} analyzed${
            result.errors.length
              ? `, ${result.errors.length} error${result.errors.length === 1 ? "" : "s"}`
              : ""
          }.`,
        );
      } else {
        await regenerateBrief();
        setActionMessage("Today’s brief was regenerated from current evidence.");
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

  const totalDocuments = data.sources.reduce(
    (sum, source) => sum + source.documentCount,
    0,
  );
  const healthySources = data.sources.filter(
    (source) => source.enabled && source.status === "ready",
  ).length;
  const enabledSources = data.sources.filter((source) => source.enabled).length;

  return (
    <div className="relay-enter min-h-screen">
      <header className="border-b border-relay-border px-5 py-5 sm:px-8 lg:px-10">
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-relay-muted">
              Intake and provenance
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              Sources
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
              Refresh public feeds
            </Button>
            <Button
              className="flex-1 sm:flex-none"
              disabled={activeAction !== null}
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
              Import research
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

        <section className="grid gap-px overflow-hidden rounded-md border border-relay-border bg-relay-border sm:grid-cols-3">
          <div className="bg-relay-surface p-5">
            <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-relay-subtle">
              Connected
            </p>
            <p className="mt-2 text-2xl font-semibold">
              {data.sources.length}
            </p>
            <p className="mt-1 text-xs text-relay-muted">research sources</p>
          </div>
          <div className="bg-relay-surface p-5">
            <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-relay-subtle">
              Healthy
            </p>
            <p className="mt-2 text-2xl font-semibold text-relay-positive">
              {healthySources}/{enabledSources}
            </p>
            <p className="mt-1 text-xs text-relay-muted">
              enabled sources ready
            </p>
          </div>
          <div className="bg-relay-surface p-5">
            <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-relay-subtle">
              Corpus
            </p>
            <p className="mt-2 text-2xl font-semibold">{totalDocuments}</p>
            <p className="mt-1 text-xs text-relay-muted">source documents</p>
          </div>
        </section>

        <section className="mt-9">
          <div className="flex items-end justify-between border-b border-relay-border pb-3">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">
                Ingestion health
              </h2>
              <p className="mt-1 text-sm text-relay-muted">
                Public feeds and your manually imported research.
              </p>
            </div>
            <Database
              aria-hidden="true"
              className="size-4 text-relay-subtle"
            />
          </div>

          {data.sources.length ? (
            <div className="divide-y divide-relay-border">
              {data.sources.map((source) => (
                <article
                  className="grid gap-4 py-5 sm:grid-cols-[minmax(180px,1fr)_150px_120px_150px]"
                  key={source.id}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        aria-label={
                          source.enabled ? source.status : "not automated"
                        }
                        className={`size-2 rounded-full ${
                          !source.enabled
                            ? "bg-relay-subtle"
                            : source.status === "ready"
                            ? "bg-relay-positive"
                            : source.status === "syncing"
                              ? "animate-pulse bg-relay-warning"
                              : "bg-relay-negative"
                        }`}
                      />
                      <h3 className="truncate text-sm font-medium">
                        {source.name}
                      </h3>
                    </div>
                    {source.url ? (
                      <p className="mt-1 truncate pl-4 text-xs text-relay-subtle">
                        {source.url}
                      </p>
                    ) : null}
                    {!source.enabled ? (
                      <p className="mt-1 pl-4 font-mono text-[9px] uppercase tracking-[0.06em] text-relay-subtle">
                        Manual/planned · Not automated
                      </p>
                    ) : null}
                  </div>
                  <div>
                    <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-relay-subtle">
                      Type
                    </p>
                    <p className="mt-1 text-xs text-relay-muted">
                      {sourceTypeLabels[source.type]}
                    </p>
                  </div>
                  <div>
                    <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-relay-subtle">
                      Documents
                    </p>
                    <p className="mt-1 text-xs text-relay-muted">
                      {source.documentCount}
                    </p>
                  </div>
                  <div>
                    <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-relay-subtle">
                      Last sync
                    </p>
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-relay-muted">
                      <Clock3 aria-hidden="true" className="size-3" />
                      {!source.enabled
                        ? "Not automated"
                        : source.lastSyncedAt
                        ? formatRelativeTime(source.lastSyncedAt)
                        : "Not yet synced"}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="grid min-h-52 place-items-center border-b border-relay-border text-center">
              <p className="text-sm text-relay-muted">
                No sources are configured. Import research to begin.
              </p>
            </div>
          )}
        </section>

        <section className="mt-10 border-l border-relay-border-strong pl-5">
          <h2 className="text-sm font-semibold">Personal research boundary</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-relay-muted">
            Relay stores imported material locally for your analysis. Only add
            paid research you are licensed to access, and do not redistribute
            source content through the dashboard.
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
