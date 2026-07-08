import {
  AlertCircle,
  ArrowRight,
  Check,
  Clock3,
  ExternalLink,
  FilePlus2,
  LoaderCircle,
  Plus,
  RefreshCw,
  Rss,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useState } from "react";
import { Link } from "react-router-dom";

import type { ResearchSource } from "../../shared/contracts";
import { PageError, PageLoading } from "../components/ui/AsyncState";
import { Button } from "../components/ui/Button";
import { useDashboard } from "../context/useDashboard";
import { AddAutomatedFeedDialog } from "../features/sources/AddAutomatedFeedDialog";
import { AddTrustedWebsiteDialog } from "../features/sources/AddTrustedWebsiteDialog";
import {
  ImportSourceDialog,
  type ImportSourceFeedback,
} from "../features/sources/ImportSourceDialog";
import { FailedIngestionSection } from "../features/sources/FailedIngestionSection";
import { SourceCoverageAudit } from "../features/sources/SourceCoverageAudit";
import { useFailedSourceDocuments } from "../features/sources/useFailedSourceDocuments";
import {
  refreshSource,
  removeResearchSource,
  retryFailedSourceDocument,
} from "../lib/api";
import { formatRelativeTime, getLayerName } from "../lib/format";

interface ActionFeedback {
  message: string;
  href?: string;
  linkLabel?: string;
}

interface RefreshItemView {
  sourceId: string;
  sourceName: string;
  title: string;
  status: "analyzed" | "duplicate" | "error";
  isNew: boolean;
  sourceUrl?: string;
  updateId?: string;
  error?: string;
}

function refreshItemsFrom(result: unknown): RefreshItemView[] {
  if (
    !result ||
    typeof result !== "object" ||
    !("items" in result) ||
    !Array.isArray(result.items)
  ) {
    return [];
  }

  return result.items.flatMap((candidate): RefreshItemView[] => {
    if (!candidate || typeof candidate !== "object") {
      return [];
    }
    const item = candidate as Record<string, unknown>;
    const status = item.status;
    if (
      typeof item.sourceId !== "string" ||
      typeof item.sourceName !== "string" ||
      typeof item.title !== "string" ||
      (status !== "analyzed" && status !== "duplicate" && status !== "error")
    ) {
      return [];
    }
    return [
      {
        sourceId: item.sourceId,
        sourceName: item.sourceName,
        title: item.title,
        status,
        isNew: item.isNew === true,
        ...(typeof item.sourceUrl === "string"
          ? { sourceUrl: item.sourceUrl }
          : {}),
        ...(typeof item.updateId === "string"
          ? { updateId: item.updateId }
          : {}),
        ...(typeof item.error === "string" ? { error: item.error } : {}),
      },
    ];
  });
}

const sourceTypeLabels: Record<ResearchSource["type"], string> = {
  rss: "RSS feed",
  "investor-relations": "Official company",
  filing: "Company disclosure",
  paper: "Research feed",
  release: "Release feed",
  manual: "Trusted website",
};

const authorityLabels: Record<ResearchSource["authorityTier"], string> = {
  "first-party": "First-party",
  specialist: "Specialist",
  context: "Context",
  unknown: "Unclassified",
};

function SourceStatus({ source }: { source: ResearchSource }) {
  const label = !source.enabled
    ? "Manual profile"
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
    reload,
    refreshAllSources,
  } = useDashboard();
  const failedSourceDocuments = useFailedSourceDocuments();
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [signalSourceProfileId, setSignalSourceProfileId] = useState<
    string | null
  >(null);
  const [isAddFeedOpen, setIsAddFeedOpen] = useState(false);
  const [isAddWebsiteOpen, setIsAddWebsiteOpen] = useState(false);
  const [isRefreshingAll, setIsRefreshingAll] = useState(false);
  const [actionMessage, setActionMessage] = useState<ActionFeedback | null>(
    null,
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const [refreshItems, setRefreshItems] = useState<RefreshItemView[]>([]);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [removingSourceId, setRemovingSourceId] = useState<string | null>(null);
  const [refreshingSourceId, setRefreshingSourceId] = useState<string | null>(
    null,
  );
  const closeImport = useCallback(() => {
    setIsImportOpen(false);
    setSignalSourceProfileId(null);
  }, []);
  const closeAddFeed = useCallback(() => setIsAddFeedOpen(false), []);
  const closeAddWebsite = useCallback(() => setIsAddWebsiteOpen(false), []);

  const openImport = (sourceProfileId?: string) => {
    setSignalSourceProfileId(sourceProfileId ?? null);
    setIsImportOpen(true);
  };

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

  const refreshAll = async () => {
    setIsRefreshingAll(true);
    setActionError(null);
    setActionMessage(null);
    setRefreshItems([]);
    try {
      const result = await refreshAllSources();
      setRefreshItems(refreshItemsFrom(result));
      setActionMessage({
        message: `Refresh complete: ${result.imported} new, ${result.analyzed} analyzed${
          result.errors.length
            ? `, ${result.errors.length} source error${result.errors.length === 1 ? "" : "s"}`
            : ""
        }.`,
      });
    } catch (caughtError) {
      setActionError(
        caughtError instanceof Error
          ? caughtError.message
          : "The feeds could not be refreshed.",
      );
    } finally {
      setIsRefreshingAll(false);
    }
  };

  const handleImportResult = (feedback: ImportSourceFeedback) => {
    setActionError(feedback.kind === "error" ? feedback.message : null);
    setActionMessage(
      feedback.kind === "success"
        ? {
            message: feedback.message,
            ...(feedback.updateId
              ? {
                  href: `/signals?update=${encodeURIComponent(feedback.updateId)}`,
                  linkLabel: "View signal",
                }
              : {}),
          }
        : null,
    );
  };

  const removeSource = async (source: ResearchSource) => {
    setRemovingSourceId(source.id);
    setActionMessage(null);
    setActionError(null);
    try {
      await removeResearchSource(source.id);
      await reload();
      setActionMessage({ message: `${source.name} was removed.` });
      setConfirmRemoveId(null);
    } catch (caughtError) {
      setActionError(
        caughtError instanceof Error
          ? caughtError.message
          : "The source could not be removed.",
      );
    } finally {
      setRemovingSourceId(null);
    }
  };

  const refreshOneSource = async (source: ResearchSource) => {
    setRefreshingSourceId(source.id);
    setActionMessage(null);
    setActionError(null);
    setRefreshItems([]);
    try {
      const result = await refreshSource(source.id);
      setRefreshItems(refreshItemsFrom(result));
      await reload();
      setActionMessage({
        message: `${source.name} refresh complete: ${result.imported} new, ${result.analyzed} analyzed${
          result.errors.length
            ? `, ${result.errors.length} error${result.errors.length === 1 ? "" : "s"}`
            : ""
        }.`,
      });
    } catch (caughtError) {
      setActionError(
        caughtError instanceof Error
          ? caughtError.message
          : `${source.name} could not be refreshed.`,
      );
    } finally {
      setRefreshingSourceId(null);
    }
  };

  const enabledSources = data.sources.filter((source) => source.enabled);
  const healthySources = enabledSources.filter(
    (source) => source.status === "ready",
  ).length;
  const onDemandSources = data.sources.length - enabledSources.length;
  const trustedSourceProfiles = data.sources.filter(
    (source) =>
      Boolean(source.domain) &&
      !["rss", "paper", "release"].includes(source.type),
  );

  return (
    <div className="relay-enter min-h-screen">
      <header className="border-b border-relay-border px-5 py-6 sm:px-8 lg:px-10">
        <div className="mx-auto max-w-[1280px]">
          <div className="flex flex-wrap items-center justify-between gap-3 font-mono text-[10px] uppercase tracking-[0.12em] text-relay-muted">
            <span>High-signal intake</span>
            <span className="text-relay-subtle">
              {enabledSources.length} automated feed
              {enabledSources.length === 1 ? "" : "s"}
              <span className="mx-2 text-relay-border-strong">·</span>
              {healthySources}/{enabledSources.length} ready
              <span className="mx-2 text-relay-border-strong">·</span>
              {onDemandSources} website profile
              {onDemandSources === 1 ? "" : "s"}
            </span>
          </div>
          <div className="mt-5 flex flex-wrap items-end justify-between gap-5">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                Trusted sources
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-relay-muted">
                Everything Relay is allowed to learn from: automated feeds,
                trusted publisher profiles, and manually added articles or
                excerpts.
              </p>
            </div>
            <div className="flex w-full flex-wrap gap-2 sm:w-auto">
              <Button
                className="flex-1 sm:flex-none"
                disabled={isRefreshingAll || refreshingSourceId !== null}
                onClick={() => void refreshAll()}
              >
                {isRefreshingAll ? (
                  <LoaderCircle
                    aria-hidden="true"
                    className="size-3.5 animate-spin"
                  />
                ) : (
                  <RefreshCw aria-hidden="true" className="size-3.5" />
                )}
                Refresh all
              </Button>
              <Button
                className="flex-1 sm:flex-none"
                onClick={() => setIsAddFeedOpen(true)}
                variant="quiet"
              >
                <Rss aria-hidden="true" className="size-3.5" />
                Add automated feed
              </Button>
              <Button
                className="flex-1 sm:flex-none"
                onClick={() => setIsAddWebsiteOpen(true)}
                variant="quiet"
              >
                <Plus aria-hidden="true" className="size-3.5" />
                Add trusted website
              </Button>
              <Button
                className="w-full sm:w-auto"
                onClick={() => openImport()}
                variant="primary"
              >
                <FilePlus2 aria-hidden="true" className="size-3.5" />
                Add signal
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1280px] px-5 py-7 sm:px-8 lg:px-10 lg:py-10">
        {actionMessage ? (
          <div
            className="mb-5 flex flex-wrap items-center gap-2 rounded-md border border-relay-positive/30 bg-relay-positive/8 px-3 py-2.5 text-xs text-relay-positive"
            role="status"
          >
            <Check aria-hidden="true" className="size-3.5" />
            <span>{actionMessage.message}</span>
            {actionMessage.href && actionMessage.linkLabel ? (
              <Link
                className="ml-auto inline-flex min-h-8 items-center gap-1.5 rounded-md border border-relay-positive/35 px-2.5 font-medium text-relay-accent hover:border-relay-accent hover:text-relay-text"
                to={actionMessage.href}
              >
                {actionMessage.linkLabel}
                <ArrowRight aria-hidden="true" className="size-3.5" />
              </Link>
            ) : null}
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

        {refreshItems.length ? (
          <section
            aria-labelledby="refresh-results-title"
            className="mt-7 overflow-hidden rounded-md border border-relay-border bg-relay-surface"
          >
            <header className="border-b border-relay-border px-4 py-3">
              <h2
                className="text-sm font-semibold"
                id="refresh-results-title"
              >
                Refresh results
              </h2>
              <p className="mt-1 text-xs text-relay-muted">
                Exact feed items handled in the latest refresh.
              </p>
            </header>
            <ul className="divide-y divide-relay-border">
              {refreshItems.map((item, index) => (
                <li
                  className="grid gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_120px_auto] sm:items-center"
                  key={`${item.sourceId}-${item.title}-${index}`}
                >
                  <div className="min-w-0">
                    {item.sourceUrl ? (
                      <a
                        className="inline-flex max-w-full items-center gap-1.5 text-sm font-medium hover:text-relay-accent"
                        href={item.sourceUrl}
                        rel="noreferrer"
                        target="_blank"
                      >
                        <span className="truncate">{item.title}</span>
                        <ExternalLink
                          aria-hidden="true"
                          className="size-3 shrink-0"
                        />
                      </a>
                    ) : (
                      <p className="truncate text-sm font-medium">
                        {item.title}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-relay-muted">
                      {item.sourceName}
                    </p>
                    {item.error ? (
                      <p className="mt-1 text-xs text-relay-negative">
                        {item.error}
                      </p>
                    ) : null}
                  </div>
                  <span
                    className="flex flex-wrap items-center gap-1.5"
                  >
                    {item.isNew ? (
                      <span className="rounded border border-relay-accent/35 bg-relay-accent/8 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.08em] text-relay-accent">
                        New
                      </span>
                    ) : null}
                    <span
                      className={`w-fit rounded border px-2 py-1 font-mono text-[9px] uppercase tracking-[0.08em] ${
                        item.status === "analyzed"
                          ? "border-relay-positive/30 text-relay-positive"
                          : item.status === "error"
                            ? "border-relay-negative/30 text-relay-negative"
                            : "border-relay-border text-relay-muted"
                      }`}
                    >
                      {item.status === "duplicate"
                        ? "Already tracked"
                        : item.status}
                    </span>
                  </span>
                  {item.updateId ? (
                    <Link
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-relay-accent hover:text-relay-text"
                      to={`/signals?update=${encodeURIComponent(item.updateId)}`}
                    >
                      View signal
                      <ArrowRight aria-hidden="true" className="size-3.5" />
                    </Link>
                  ) : (
                    <span className="text-xs text-relay-subtle">
                      {item.status === "error" ? "Not analyzed" : "No new analysis"}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <FailedIngestionSection
          documents={failedSourceDocuments.documents}
          error={failedSourceDocuments.error}
          isLoading={failedSourceDocuments.isLoading}
          onReload={failedSourceDocuments.reload}
          onRetry={retryFailedSourceDocument}
        />

        <section className="mt-7">
          <div className="flex items-end justify-between border-b border-relay-border pb-3">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">
                Source health
              </h2>
              <p className="mt-1 text-sm text-relay-muted">
                Refresh automated feeds; use trusted website profiles for
                attribution and coverage context.
              </p>
            </div>
            <span className="font-mono text-[10px] text-relay-subtle">
              {data.sources.length} tracked
            </span>
          </div>

          {data.sources.length ? (
            <div className="divide-y divide-relay-border">
              {data.sources.map((source) => (
                <article
                  className="grid gap-4 py-5 lg:grid-cols-[minmax(220px,1fr)_140px_120px_140px_190px]"
                  key={source.id}
                >
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-medium">
                      {source.name}
                    </h3>
                    {source.url ? (
                      <a
                        className="mt-1 inline-flex max-w-full items-center gap-1 text-xs text-relay-subtle hover:text-relay-accent"
                        href={source.url}
                        rel="noreferrer"
                        target="_blank"
                      >
                        <span className="truncate">{source.url}</span>
                        <ExternalLink
                          aria-hidden="true"
                          className="size-3 shrink-0"
                        />
                      </a>
                    ) : (
                      <p className="mt-1 text-xs text-relay-subtle">
                        Add excerpts manually when permitted.
                      </p>
                    )}
                    {source.layerIds.length ||
                    source.companyTickers.length ||
                    source.thesisIds.length ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {source.layerIds.map((layerId) => (
                          <span
                            className="rounded border border-relay-border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.06em] text-relay-subtle"
                            key={layerId}
                          >
                            {getLayerName(layerId)}
                          </span>
                        ))}
                        {source.companyTickers.length ? (
                          <span className="rounded border border-relay-border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.06em] text-relay-subtle">
                            {source.companyTickers.join(", ")}
                          </span>
                        ) : null}
                        {source.thesisIds.length ? (
                          <span className="rounded border border-relay-border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.06em] text-relay-subtle">
                            {source.thesisIds.length} macro{" "}
                            {source.thesisIds.length === 1 ? "thesis" : "theses"}
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  <div>
                    <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-relay-subtle">
                      Classification
                    </p>
                    <p className="mt-1 text-xs text-relay-muted">
                      {sourceTypeLabels[source.type]}
                    </p>
                    <p className="mt-1 text-[10px] text-relay-subtle">
                      {source.role === "primary"
                        ? "Primary evidence"
                        : "Context only"}{" "}
                      · {authorityLabels[source.authorityTier]}
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
                        ? "Not automated"
                        : source.lastSyncedAt
                          ? formatRelativeTime(source.lastSyncedAt)
                          : "Not yet checked"}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-1">
                    {source.enabled ? (
                      <Button
                        aria-label={`Refresh ${source.name}`}
                        disabled={
                          isRefreshingAll ||
                          refreshingSourceId !== null ||
                          removingSourceId !== null
                        }
                        onClick={() => void refreshOneSource(source)}
                        variant="quiet"
                      >
                        {refreshingSourceId === source.id ? (
                          <LoaderCircle
                            aria-hidden="true"
                            className="size-3.5 animate-spin"
                          />
                        ) : (
                          <RefreshCw
                            aria-hidden="true"
                            className="size-3.5"
                          />
                        )}
                        Refresh
                      </Button>
                    ) : (
                      <Button
                        aria-label={`Add a signal from ${source.name}`}
                        onClick={() => openImport(source.id)}
                        variant="quiet"
                      >
                        <FilePlus2 aria-hidden="true" className="size-3.5" />
                        Add signal
                      </Button>
                    )}
                    {confirmRemoveId === source.id ? (
                      <div className="flex items-center gap-1">
                        <Button
                          aria-label={`Confirm remove ${source.name}`}
                          disabled={removingSourceId !== null}
                          onClick={() => void removeSource(source)}
                          variant="danger"
                        >
                          {removingSourceId === source.id ? (
                            <LoaderCircle
                              aria-hidden="true"
                              className="size-3.5 animate-spin"
                            />
                          ) : (
                            <Trash2 aria-hidden="true" className="size-3.5" />
                          )}
                          Remove
                        </Button>
                        <button
                          aria-label={`Cancel removing ${source.name}`}
                          className="rounded p-2 text-relay-subtle hover:bg-relay-surface-2 hover:text-relay-text"
                          onClick={() => setConfirmRemoveId(null)}
                          type="button"
                        >
                          <X aria-hidden="true" className="size-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        aria-label={`Remove ${source.name}`}
                        className="rounded p-2 text-relay-subtle hover:bg-relay-negative/10 hover:text-relay-negative"
                        disabled={removingSourceId !== null}
                        onClick={() => setConfirmRemoveId(source.id)}
                        title="Remove source"
                        type="button"
                      >
                        <Trash2 aria-hidden="true" className="size-3.5" />
                      </button>
                    )}
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

        <div className="mt-10">
          <SourceCoverageAudit coverage={data.sourceCoverage} />
        </div>

        <section className="mt-10 border-l border-relay-border-strong pl-5">
          <h2 className="text-sm font-semibold">
            Websites are profiles; webpages are signals
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-relay-muted">
            Register a domain here when Relay should recognize the publisher.
            Use Add signal for an individual article or arbitrary public URL.
            Paste only excerpts you are authorized to process.
          </p>
        </section>
      </main>

      <ImportSourceDialog
        {...(signalSourceProfileId
          ? { initialSourceProfileId: signalSourceProfileId }
          : {})}
        isOpen={isImportOpen}
        key={signalSourceProfileId ?? "generic-signal-intake"}
        onClose={closeImport}
        onImported={async () => {
          setIsImportOpen(false);
          setSignalSourceProfileId(null);
          await reload();
        }}
        onResult={handleImportResult}
        sourceProfiles={trustedSourceProfiles}
      />
      <AddAutomatedFeedDialog
        isOpen={isAddFeedOpen}
        onClose={closeAddFeed}
        onCreated={async (source) => {
          await reload();
          setActionError(null);
          setActionMessage({
            message: `${source.name} was added as an automated feed.`,
          });
        }}
        onError={(message) => {
          setActionMessage(null);
          setActionError(message);
        }}
      />
      <AddTrustedWebsiteDialog
        companies={data.companies}
        isOpen={isAddWebsiteOpen}
        macroTheses={data.sourceCoverage}
        onClose={closeAddWebsite}
        onCreated={async (source) => {
          await reload();
          setActionError(null);
          setActionMessage({
            message: `${source.name} was added as a trusted website profile.`,
          });
        }}
        onError={(message) => {
          setActionMessage(null);
          setActionError(message);
        }}
      />
    </div>
  );
}
