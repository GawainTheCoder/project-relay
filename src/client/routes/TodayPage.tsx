import {
  ArrowRight,
  BookOpen,
  Building2,
  CalendarDays,
  ChevronRight,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Link, useSearchParams } from "react-router-dom";

import { EvidencePanel } from "../components/EvidencePanel";
import {
  EmptyState,
  PageError,
  PageLoading,
} from "../components/ui/AsyncState";
import type {
  DailyBrief,
  EvidenceClaim,
  IntelligenceUpdate,
} from "../../shared/contracts";
import { SentimentBadge } from "../components/ui/StatusBadge";
import { useDashboard } from "../context/useDashboard";
import { useBeliefs } from "../features/beliefs/useBeliefs";
import { listBriefs } from "../lib/api";
import { getSecondarySignalUpdate } from "../lib/briefs";
import {
  formatDate,
  formatRelativeTime,
  getLayerName,
} from "../lib/format";
import {
  isThesisChangingImpact,
  isThesisChangingSignal,
} from "../lib/signals";
import { companyThesisPath } from "../lib/thesisRoutes";

function DecisionQueue({
  awaitingEvaluationTotal,
  pendingReviewTotal,
}: {
  awaitingEvaluationTotal: number;
  pendingReviewTotal: number;
}) {
  const rows = [
    {
      count: pendingReviewTotal,
      label: "Thesis proposals to review",
      meta: "Accept, reject, or defer",
      to: "/theses?status=pending",
    },
    {
      count: awaitingEvaluationTotal,
      label: "Signals awaiting evaluation",
      meta: "Routed evidence not yet evaluated",
      to: "/theses?status=awaiting",
    },
  ].filter((row) => row.count > 0);

  return (
    <section aria-label="Needs your decision">
      <div className="border-b border-relay-border pb-3">
        <h2 className="text-sm font-semibold">Needs your decision</h2>
      </div>
      {rows.length ? (
        <ol className="divide-y divide-relay-border">
          {rows.map((row) => (
            <li key={row.to}>
              <Link className="group flex items-center gap-4 py-4" to={row.to}>
                <span className="w-8 shrink-0 font-mono text-xl font-semibold tracking-tight text-relay-accent">
                  {row.count}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-relay-text group-hover:text-relay-accent">
                    {row.label}
                  </span>
                  <span className="mt-0.5 block text-xs text-relay-subtle">
                    {row.meta}
                  </span>
                </span>
                <ChevronRight
                  aria-hidden="true"
                  className="size-4 shrink-0 text-relay-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-relay-accent"
                />
              </Link>
            </li>
          ))}
        </ol>
      ) : (
        <p className="py-5 text-sm leading-6 text-relay-muted">
          Review queue is clear. New proposals appear here after evidence is
          evaluated.
        </p>
      )}
    </section>
  );
}

function DecisionChips({
  awaitingEvaluationTotal,
  className,
  pendingReviewTotal,
}: {
  awaitingEvaluationTotal: number;
  className?: string;
  pendingReviewTotal: number;
}) {
  const chips = [
    {
      count: pendingReviewTotal,
      label: "proposals to review",
      to: "/theses?status=pending",
    },
    {
      count: awaitingEvaluationTotal,
      label: "awaiting evaluation",
      to: "/theses?status=awaiting",
    },
  ].filter((chip) => chip.count > 0);

  if (!chips.length) {
    return null;
  }
  return (
    <div className={`flex flex-wrap gap-2 ${className ?? ""}`}>
      {chips.map((chip) => (
        <Link
          className="inline-flex h-8 items-center gap-2 rounded-full border border-relay-border bg-relay-surface px-3 text-xs text-relay-muted transition-colors hover:border-relay-border-strong hover:text-relay-text"
          key={chip.to}
          to={chip.to}
        >
          <span className="font-mono font-semibold text-relay-accent">
            {chip.count}
          </span>
          {chip.label}
        </Link>
      ))}
    </div>
  );
}

export function BriefArchiveSection({
  briefs,
  error,
  evidenceItems,
  onRetry,
  selectedBriefId,
}: {
  briefs: DailyBrief[] | null;
  error: string | null;
  evidenceItems: Array<{ claim: EvidenceClaim; update: IntelligenceUpdate }>;
  onRetry: () => void;
  selectedBriefId: string | null;
}) {
  const selectedBrief =
    briefs?.find((brief) => brief.id === selectedBriefId) ?? null;

  return (
    <section className="mt-12" id="brief-archive">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-relay-border pb-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-relay-muted">
            Brief archive
          </p>
          <h2 className="mt-2 text-lg font-semibold tracking-tight">
            Prior daily readouts
          </h2>
        </div>
        <span className="font-mono text-[10px] text-relay-subtle">
          {briefs?.length ?? 0} stored
        </span>
      </div>
      {error ? (
        <div className="border-b border-relay-border py-6">
          <p className="text-sm text-relay-negative" role="alert">
            {error}
          </p>
          <button
            className="mt-3 text-sm text-relay-accent hover:text-white"
            onClick={onRetry}
            type="button"
          >
            Retry archive
          </button>
        </div>
      ) : !briefs ? (
        <p className="border-b border-relay-border py-6 text-sm text-relay-muted">
          Loading prior briefs.
        </p>
      ) : briefs.length ? (
        <>
          {selectedBrief ? (
            <article className="border-b border-relay-border py-6">
              <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-[0.08em] text-relay-subtle">
                <CalendarDays aria-hidden="true" className="size-3.5" />
                {formatDate(selectedBrief.date, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
                <span>{selectedBrief.updateIds.length} signals</span>
                <span>{selectedBrief.citationClaimIds.length} citations</span>
              </div>
              <h3 className="mt-3 text-xl font-semibold tracking-tight">
                {selectedBrief.title}
              </h3>
              {evidenceItems.length ? (
                <div className="mt-4">
                  <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-relay-muted">
                    Cited evidence
                  </p>
                  <ol className="mt-3 divide-y divide-relay-border border-y border-relay-border">
                  {evidenceItems.map(({ claim, update }, index) => (
                    <li className="py-4" key={claim.id}>
                      <blockquote className="text-sm leading-7 text-relay-text">
                        “{claim.quote}”
                      </blockquote>
                      <Link
                        className="mt-2 inline-flex items-center gap-1.5 text-xs text-relay-muted hover:text-relay-accent"
                        to={`/signals?update=${encodeURIComponent(update.id)}`}
                      >
                        [{index + 1}] {update.publisher} · {claim.locator}
                        <ArrowRight aria-hidden="true" className="size-3" />
                      </Link>
                    </li>
                  ))}
                  </ol>
                </div>
              ) : (
                <p className="mt-4 border-y border-relay-border py-4 text-sm text-relay-muted">
                  This brief contains no stored evidence citations.
                </p>
              )}
              <details className="mt-5 border-l border-relay-border pl-3">
                <summary className="cursor-pointer text-sm font-semibold text-relay-muted hover:text-relay-text">
                  Generated readout
                </summary>
                <p className="mt-3 max-w-3xl text-sm leading-7 text-relay-muted">
                  {selectedBrief.signal}
                </p>
                <p className="mt-3 max-w-3xl text-sm leading-7 text-relay-text/90">
                  {selectedBrief.summary}
                </p>
              </details>
            </article>
          ) : null}
          <ol className="divide-y divide-relay-border border-b border-relay-border">
            {briefs.map((brief) => (
              <li key={brief.id}>
                <Link
                  className="group grid gap-4 py-5 sm:grid-cols-[150px_minmax(0,1fr)_auto] sm:items-start"
                  to={`/today?archive=briefs&brief=${encodeURIComponent(brief.id)}`}
                >
                  <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.08em] text-relay-subtle">
                    <CalendarDays aria-hidden="true" className="size-3.5" />
                    {formatDate(brief.date, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold tracking-tight group-hover:text-relay-accent">
                      {brief.title}
                    </h3>
                    <p className="mt-2 line-clamp-2 text-sm leading-6 text-relay-muted">
                      {brief.signal}
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[9px] uppercase tracking-[0.08em] text-relay-subtle">
                      <span>
                        {brief.updateIds.length} signal
                        {brief.updateIds.length === 1 ? "" : "s"}
                      </span>
                      <span>{brief.citationClaimIds.length} citations</span>
                      <span>Generated {formatRelativeTime(brief.generatedAt)}</span>
                    </div>
                  </div>
                  <ArrowRight
                    aria-hidden="true"
                    className="size-4 text-relay-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-relay-accent"
                  />
                </Link>
              </li>
            ))}
          </ol>
        </>
      ) : (
        <EmptyState
          body="Daily readouts will appear here after Relay generates them."
          title="No prior briefs yet"
        />
      )}
    </section>
  );
}

export function TodayPage() {
  const { data, error, isLoading, regenerateBrief, reload } = useDashboard();
  const beliefs = useBeliefs(data);
  const [searchParams] = useSearchParams();
  const [selectedClaimId, setSelectedClaimId] = useState<string | null>(null);
  const [isGeneratingBrief, setIsGeneratingBrief] = useState(false);
  const [briefError, setBriefError] = useState<string | null>(null);
  const [briefArchive, setBriefArchive] = useState<DailyBrief[] | null>(
    null,
  );
  const [briefArchiveError, setBriefArchiveError] = useState<string | null>(
    null,
  );
  const showBriefArchive = searchParams.get("archive") === "briefs";
  const selectedBriefId = searchParams.get("brief");
  const selectedArchiveEvidenceItems = useMemo(() => {
    if (!data || !briefArchive || !selectedBriefId) {
      return [];
    }
    const selectedBrief = briefArchive.find(
      (brief) => brief.id === selectedBriefId,
    );
    if (!selectedBrief) {
      return [];
    }
    const claims = data.updates.flatMap((update) =>
      update.claims.map((claim) => ({ claim, update })),
    );
    return selectedBrief.citationClaimIds
      .map((claimId) =>
        claims.find(({ claim }) => claim.id === claimId),
      )
      .filter((item) => item !== undefined);
  }, [briefArchive, data, selectedBriefId]);

  const loadBriefArchive = useCallback(async (signal?: AbortSignal) => {
    setBriefArchiveError(null);
    try {
      setBriefArchive(await listBriefs(50, signal));
    } catch (caughtError) {
      if (
        caughtError instanceof DOMException &&
        caughtError.name === "AbortError"
      ) {
        return;
      }
      setBriefArchiveError(
        caughtError instanceof Error
          ? caughtError.message
          : "Relay could not load prior briefs.",
      );
    }
  }, []);

  useEffect(() => {
    if (!showBriefArchive) {
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void loadBriefArchive(controller.signal);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [loadBriefArchive, showBriefArchive]);

  const briefEvidenceItems = useMemo(() => {
    if (!data?.brief) {
      return [];
    }
    const claims = data.updates.flatMap((update) =>
      update.claims.map((claim) => ({ claim, update })),
    );
    return data.brief.citationClaimIds
      .map((claimId) =>
        claims.find(({ claim }) => claim.id === claimId),
      )
      .filter((item) => item !== undefined);
  }, [data]);
  const briefClaims = useMemo(
    () => briefEvidenceItems.map(({ claim }) => claim),
    [briefEvidenceItems],
  );

  const affectedImpacts = useMemo(() => {
    if (!data?.brief) {
      return [];
    }
    return data.brief.updateIds
      .flatMap(
        (updateId) =>
          data.updates.find((update) => update.id === updateId)
            ?.thesisImpacts ?? [],
      )
      .filter(isThesisChangingImpact)
      .filter(
        (impact, index, impacts) =>
          impacts.findIndex(
            (candidate) => candidate.companyTicker === impact.companyTicker,
          ) === index,
      )
      .slice(0, 6);
  }, [data]);
  const pendingReviewTotal = beliefs.reduce(
    (total, belief) => total + belief.pendingEvaluationCount,
    0,
  );
  const awaitingEvaluationTotal = beliefs.reduce(
    (total, belief) => total + belief.awaitingEvaluationCount,
    0,
  );

  if (isLoading) {
    return <PageLoading label="Updating today’s mental model" />;
  }
  if (error || !data) {
    return (
      <PageError
        error={error ?? "Dashboard data is unavailable."}
        onRetry={() => void reload()}
      />
    );
  }
  const brief = data.brief;
  const thesisChangingSignalCount = data.updates.filter(
    isThesisChangingSignal,
  ).length;
  const generateBrief = async () => {
    setIsGeneratingBrief(true);
    setBriefError(null);
    try {
      await regenerateBrief();
    } catch (caughtError) {
      setBriefError(
        caughtError instanceof Error
          ? caughtError.message
          : "Relay could not generate the brief.",
      );
    } finally {
      setIsGeneratingBrief(false);
    }
  };
  if (!brief) {
    return (
      <div className="relay-enter min-h-screen">
        <header className="border-b border-relay-border px-5 py-6 sm:px-8 lg:px-10">
          <div className="mx-auto max-w-[1100px]">
            <div className="flex flex-wrap items-center justify-between gap-3 font-mono text-[10px] uppercase tracking-[0.12em] text-relay-muted">
              <span>AI infrastructure thesis monitor</span>
              <span className="text-relay-subtle">
                {data.updates.length} evidence record
                {data.updates.length === 1 ? "" : "s"} monitored
              </span>
            </div>
            <div className="mt-6 max-w-3xl border-l-2 border-relay-accent pl-5 sm:pl-7">
              <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-relay-accent">
                <span className="size-1.5 rounded-full bg-relay-accent" />
                What changed in your understanding
              </p>
              <h1 className="mt-3 text-3xl font-semibold leading-[1.12] tracking-[-0.025em] sm:text-[2.5rem]">
                {thesisChangingSignalCount
                  ? "Thesis updates are ready"
                  : data.updates.length
                    ? "No meaningful change"
                    : "No evidence evaluated yet"}
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-8 text-relay-muted">
                {thesisChangingSignalCount
                  ? `Relay found ${thesisChangingSignalCount} signal${
                      thesisChangingSignalCount === 1 ? "" : "s"
                    } that may change an infrastructure thesis. Generate today’s readout for the concise synthesis.`
                  : data.updates.length
                    ? `Relay analyzed ${data.updates.length} signal${
                        data.updates.length === 1 ? "" : "s"
                      } without finding a warranted thesis change.`
                    : "Refresh trusted feeds or add a public article or permitted excerpt. A quiet day with no change in understanding is a valid result."}
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                {thesisChangingSignalCount ? (
                  <button
                    className="inline-flex h-10 items-center gap-2 rounded-md bg-relay-accent px-4 text-sm font-medium text-white hover:bg-[#3f7cf0] disabled:cursor-wait disabled:opacity-60"
                    disabled={isGeneratingBrief}
                    onClick={() => void generateBrief()}
                    type="button"
                  >
                    {isGeneratingBrief ? "Generating…" : "Generate understanding readout"}
                    <ArrowRight aria-hidden="true" className="size-3.5" />
                  </button>
                ) : (
                  <Link
                    className="inline-flex h-10 items-center gap-2 rounded-md bg-relay-accent px-4 text-sm font-medium text-white hover:bg-[#3f7cf0]"
                    to="/sources"
                  >
                    Sources
                    <ArrowRight aria-hidden="true" className="size-3.5" />
                  </Link>
                )}
                <Link
                  className="inline-flex h-10 items-center rounded-md border border-relay-border px-4 text-sm text-relay-muted hover:border-relay-border-strong hover:text-relay-text"
                  to="/today?archive=briefs"
                >
                  Brief archive
                </Link>
              </div>
              {briefError ? (
                <p className="mt-4 text-sm text-relay-negative" role="alert">
                  {briefError}
                </p>
              ) : null}
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-[1100px] px-5 py-8 sm:px-8 lg:px-10">
          <div className="max-w-md">
            <DecisionQueue
              awaitingEvaluationTotal={awaitingEvaluationTotal}
              pendingReviewTotal={pendingReviewTotal}
            />
          </div>
          {showBriefArchive ? (
            <BriefArchiveSection
              briefs={briefArchive}
              error={briefArchiveError}
              evidenceItems={selectedArchiveEvidenceItems}
              onRetry={() => void loadBriefArchive()}
              selectedBriefId={selectedBriefId}
            />
          ) : null}
        </main>
      </div>
    );
  }

  const primaryUpdate = data.updates.find(
    (update) => update.id === brief.updateIds[0],
  );
  const hasBriefSignals = brief.updateIds.length > 0;

  return (
    <div className="relay-enter min-h-screen">
      <header className="border-b border-relay-border px-5 py-6 sm:px-8 lg:px-10">
        <div className="mx-auto max-w-[1440px]">
          <div className="flex flex-wrap items-center justify-between gap-3 font-mono text-[10px] uppercase tracking-[0.12em] text-relay-muted">
            <span className="flex items-center gap-2">
              <CalendarDays aria-hidden="true" className="size-3.5" />
              {formatDate(brief.date, {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
            </span>
            <span className="text-relay-subtle">
              {data.updates.length} evidence records
              <span className="mx-2 text-relay-border-strong">·</span>
              {brief.model ?? "Seed example"}
            </span>
          </div>
          <div className="mt-6 max-w-4xl border-l-2 border-relay-accent pl-5 sm:pl-7">
            <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-relay-accent">
              <span className="size-1.5 rounded-full bg-relay-accent" />
              {hasBriefSignals ? "Largest thesis update" : "Daily conclusion"}
            </p>
            <h1 className="mt-3 text-3xl font-semibold leading-[1.12] tracking-[-0.025em] sm:text-[2.75rem]">
              {brief.title}
            </h1>
            <p className="mt-4 max-w-3xl text-base leading-8 text-relay-muted sm:text-lg">
              {brief.signal}
            </p>
            <DecisionChips
              awaitingEvaluationTotal={awaitingEvaluationTotal}
              className="mt-6 xl:hidden"
              pendingReviewTotal={pendingReviewTotal}
            />
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1440px] xl:grid-cols-[minmax(0,1fr)_340px]">
        <main className="min-w-0 px-5 py-8 sm:px-8 lg:px-10">
          <article className="max-w-3xl">
            <section>
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-relay-muted">
                Mental-model synthesis
              </p>
              <p className="mt-3 text-[15px] leading-7 text-relay-text/90">
                {brief.summary}
              </p>
            </section>

            {briefEvidenceItems.length ? (
              <section className="mt-10">
                <div className="flex items-end justify-between border-b border-relay-border pb-3">
                  <h2 className="text-sm font-semibold">Cited evidence</h2>
                  <span className="font-mono text-[10px] text-relay-subtle">
                    {briefEvidenceItems.length} quote
                    {briefEvidenceItems.length === 1 ? "" : "s"}
                  </span>
                </div>
                <ol className="divide-y divide-relay-border border-b border-relay-border">
                  {briefEvidenceItems.map(({ claim, update }, index) => (
                    <li key={claim.id}>
                      <button
                        className="group grid w-full grid-cols-[32px_minmax(0,1fr)] gap-3 py-5 text-left"
                        onClick={() => setSelectedClaimId(claim.id)}
                        type="button"
                      >
                        <span className="font-mono text-xs text-relay-accent">
                          [{index + 1}]
                        </span>
                        <span className="min-w-0">
                          <blockquote className="text-sm leading-7 text-relay-text">
                            “{claim.quote}”
                          </blockquote>
                          <span className="mt-2 block font-mono text-[10px] uppercase tracking-[0.08em] text-relay-subtle group-hover:text-relay-muted">
                            {update.publisher} · {claim.locator} ·{" "}
                            {formatDate(update.publishedAt, {
                              month: "short",
                              day: "numeric",
                            })}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ol>
              </section>
            ) : null}

            {primaryUpdate ? (
              <Link
                className="group mt-8 flex items-center justify-between gap-5 rounded-md border border-relay-border bg-relay-surface px-5 py-4 transition-colors hover:border-relay-border-strong hover:bg-relay-surface-2"
                to={`/signals?update=${encodeURIComponent(primaryUpdate.id)}`}
              >
                <div className="min-w-0">
                  <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-relay-muted">
                    Inspect the underlying signal
                  </span>
                  <p className="mt-1 truncate text-sm font-medium">
                    {primaryUpdate.title}
                  </p>
                </div>
                <ArrowRight
                  aria-hidden="true"
                  className="size-4 shrink-0 text-relay-accent transition-transform group-hover:translate-x-0.5"
                />
              </Link>
            ) : null}

            <section className="mt-12">
              <div className="flex items-end justify-between border-b border-relay-border pb-3">
                <div>
                  <h2 className="text-lg font-semibold tracking-tight">
                    Evidence without thesis change
                  </h2>
                  <p className="mt-1 text-sm text-relay-muted">
                    Reinforcement and context that did not warrant rewriting a
                    thesis.
                  </p>
                </div>
                <span className="font-mono text-[10px] text-relay-subtle">
                  {brief.secondarySignals.length}
                </span>
              </div>
              {brief.secondarySignals.length ? (
                <ol className="divide-y divide-relay-border">
                  {brief.secondarySignals.map((signal, index) => {
                    const relatedUpdate = getSecondarySignalUpdate(
                      brief,
                      data.updates,
                      signal,
                      index,
                    );
                    return (
                      <li
                        className="group grid grid-cols-[32px_1fr_auto] items-start gap-3 py-5"
                        key={signal}
                      >
                        <span className="font-mono text-xs text-relay-subtle">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <div>
                          <p className="text-sm leading-6 text-relay-text">
                            {signal}
                          </p>
                          {relatedUpdate ? (
                            <div className="mt-2 flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-[0.08em] text-relay-subtle">
                              {relatedUpdate.layerIds.map((layerId) => (
                                <span key={layerId}>
                                  {getLayerName(layerId)}
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </div>
                        {relatedUpdate ? (
                          <Link
                            aria-label={`Open ${relatedUpdate.title}`}
                            className="rounded p-1 text-relay-subtle hover:bg-relay-surface-2 hover:text-relay-accent"
                            to={`/signals?update=${encodeURIComponent(relatedUpdate.id)}`}
                          >
                            <ChevronRight
                              aria-hidden="true"
                              className="size-4"
                            />
                          </Link>
                        ) : null}
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <EmptyState
                  body="Relay found no additional evidence worth attaching to today’s readout."
                  title="No additional evidence today"
                />
              )}
            </section>
          </article>
          {showBriefArchive ? (
            <BriefArchiveSection
              briefs={briefArchive}
              error={briefArchiveError}
              evidenceItems={selectedArchiveEvidenceItems}
              onRetry={() => void loadBriefArchive()}
              selectedBriefId={selectedBriefId}
            />
          ) : null}
        </main>

        <aside className="border-t border-relay-border bg-relay-deep px-5 py-8 sm:px-8 xl:border-l xl:border-t-0 xl:px-6">
          <DecisionQueue
            awaitingEvaluationTotal={awaitingEvaluationTotal}
            pendingReviewTotal={pendingReviewTotal}
          />

          <section className="mt-10">
            <div className="flex items-center justify-between border-b border-relay-border pb-3">
              <div>
                <h2 className="text-sm font-semibold">Theses evaluated</h2>
                <p className="mt-1 text-xs text-relay-muted">
                  Proposed changes to review
                </p>
              </div>
              <Building2
                aria-hidden="true"
                className="size-4 text-relay-subtle"
              />
            </div>
            {affectedImpacts.length ? (
              <div className="divide-y divide-relay-border">
                {affectedImpacts.map((impact) => (
                  <Link
                    className="group block py-4"
                    key={impact.id}
                    to={companyThesisPath(impact.companyTicker)}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-mono text-sm font-semibold">
                        {impact.companyTicker}
                      </span>
                      <SentimentBadge sentiment={impact.direction} />
                    </div>
                    <p className="mt-2 text-xs leading-5 text-relay-muted group-hover:text-relay-text">
                      {impact.summary}
                    </p>
                    <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.08em] text-relay-subtle">
                      {impact.confidence} confidence · {impact.horizon}
                    </p>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="py-6 text-sm leading-6 text-relay-muted">
                Today’s evidence did not warrant a thesis change.
              </p>
            )}
          </section>

          <section className="mt-10 border-t border-relay-border pt-5">
            <Link
              className="group flex items-center justify-between gap-3 text-sm text-relay-muted hover:text-relay-text"
              to="/today?archive=briefs"
            >
              <span className="flex items-center gap-2.5">
                <BookOpen
                  aria-hidden="true"
                  className="size-4 text-relay-subtle"
                />
                Brief archive
              </span>
              <ArrowRight
                aria-hidden="true"
                className="size-3.5 text-relay-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-relay-accent"
              />
            </Link>
          </section>
        </aside>
      </div>

      {selectedClaimId ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/55">
          <button
            aria-label="Close evidence"
            className="absolute inset-0"
            onClick={() => setSelectedClaimId(null)}
            type="button"
          />
          <div className="relative h-full w-full max-w-[420px] shadow-2xl shadow-black">
            <EvidencePanel
              claims={briefClaims}
              onClose={() => setSelectedClaimId(null)}
              selectedClaimId={selectedClaimId}
              updates={data.updates}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
