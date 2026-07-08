import {
  ArrowRight,
  BookOpen,
  Building2,
  CalendarDays,
  ChevronRight,
  Quote,
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

function CommandMetric({
  label,
  meta,
  to,
  value,
}: {
  label: string;
  meta: string;
  to: string;
  value: string;
}) {
  return (
    <Link
      className="group border border-relay-border bg-relay-surface px-4 py-3 transition-colors hover:border-relay-border-strong hover:bg-relay-surface-2"
      to={to}
    >
      <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-relay-muted">
        {label}
      </span>
      <span className="mt-2 block truncate text-sm font-semibold tracking-tight group-hover:text-relay-accent">
        {value}
      </span>
      <span className="mt-1 block text-xs text-relay-subtle">{meta}</span>
    </Link>
  );
}

function CommandCenterStrip({
  awaitingEvaluationTotal,
  biggestThesisChange,
  pendingReviewTotal,
}: {
  awaitingEvaluationTotal: number;
  biggestThesisChange: IntelligenceUpdate | null;
  pendingReviewTotal: number;
}) {
  return (
    <section className="grid gap-3 border-b border-relay-border py-5 sm:grid-cols-3">
      <CommandMetric
        label="Biggest thesis change"
        meta={
          biggestThesisChange
            ? biggestThesisChange.publisher
            : "No signal yet"
        }
        to={
          biggestThesisChange
            ? `/signals?update=${encodeURIComponent(biggestThesisChange.id)}`
            : "/signals"
        }
        value={biggestThesisChange?.title ?? "No thesis-changing signal"}
      />
      <CommandMetric
        label="Pending reviews"
        meta="Thesis proposals"
        to="/theses?status=pending"
        value={String(pendingReviewTotal)}
      />
      <CommandMetric
        label="Awaiting evaluation"
        meta="Routed evidence"
        to="/theses?status=awaiting"
        value={String(awaitingEvaluationTotal)}
      />
    </section>
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
                  to={`/?archive=briefs&brief=${encodeURIComponent(brief.id)}`}
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

function BriefEvidenceLead({
  items,
}: {
  items: Array<{ claim: EvidenceClaim; update: IntelligenceUpdate }>;
}) {
  if (!items.length) {
    return null;
  }

  return (
    <section className="mb-8 border-b border-relay-border pb-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">Cited evidence</h2>
        <span className="font-mono text-[10px] text-relay-subtle">
          {items.length} quotes
        </span>
      </div>
      <ol className="mt-3 divide-y divide-relay-border border-y border-relay-border">
        {items.slice(0, 3).map(({ claim, update }, index) => (
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
  const biggestThesisChange = useMemo(() => {
    if (!data) {
      return null;
    }
    const briefUpdate = data.brief?.updateIds
      .map((updateId) =>
        data.updates.find((update) => update.id === updateId),
      )
      .find((update) => update && isThesisChangingSignal(update));
    return (
      briefUpdate ??
      data.updates.find(isThesisChangingSignal) ??
      data.updates[0] ??
      null
    );
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
        <header className="border-b border-relay-border px-5 py-5 sm:px-8 lg:px-10">
          <div className="mx-auto max-w-[1100px]">
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-relay-muted">
              AI infrastructure thesis monitor
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              What changed in your understanding
            </h1>
          </div>
        </header>
        <main className="mx-auto max-w-[1100px] px-5 py-7 sm:px-8 lg:px-10">
          <CommandCenterStrip
            awaitingEvaluationTotal={awaitingEvaluationTotal}
            biggestThesisChange={biggestThesisChange}
            pendingReviewTotal={pendingReviewTotal}
          />
          <section className="max-w-2xl border-l border-relay-border-strong pl-6">
            <BookOpen
              aria-hidden="true"
              className="size-5 text-relay-subtle"
            />
            <h2 className="mt-5 text-2xl font-semibold tracking-tight">
              {thesisChangingSignalCount
                ? "Thesis updates are ready"
                : data.updates.length
                  ? "No meaningful change"
                  : "No evidence evaluated yet"}
            </h2>
            <p className="mt-3 text-sm leading-7 text-relay-muted">
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
                to="/?archive=briefs"
              >
                Brief archive
              </Link>
            </div>
            {briefError ? (
              <p className="mt-4 text-sm text-relay-negative" role="alert">
                {briefError}
              </p>
            ) : null}
          </section>
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
      <header className="border-b border-relay-border px-5 py-5 sm:px-8 lg:px-10">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-relay-muted">
              <CalendarDays aria-hidden="true" className="size-3.5" />
              {formatDate(brief.date, {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              What changed in your understanding
            </h1>
          </div>
          <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-relay-subtle">
            {data.updates.length} evidence records monitored
            <span className="mx-2 text-relay-border-strong">·</span>
            {brief.model ?? "Seed example"}
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1440px] xl:grid-cols-[minmax(0,1fr)_350px]">
        <main className="min-w-0 px-5 py-7 sm:px-8 lg:px-10 lg:py-10">
          <CommandCenterStrip
            awaitingEvaluationTotal={awaitingEvaluationTotal}
            biggestThesisChange={biggestThesisChange}
            pendingReviewTotal={pendingReviewTotal}
          />
          <BriefEvidenceLead items={briefEvidenceItems} />
          <article className="max-w-4xl">
            <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-relay-accent">
              <span className="size-1.5 rounded-full bg-relay-accent" />
              {hasBriefSignals ? "Largest thesis update" : "Daily conclusion"}
            </div>
            <h2 className="mt-4 max-w-3xl text-3xl font-semibold leading-[1.15] tracking-[-0.025em] sm:text-4xl">
              {brief.title}
            </h2>
            <p className="mt-5 max-w-3xl text-base leading-8 text-relay-muted sm:text-lg">
              {brief.signal}
            </p>

            <div className="mt-8 border-y border-relay-border py-7">
              <div className="flex items-start gap-4">
                <BookOpen
                  aria-hidden="true"
                  className="mt-1 size-5 shrink-0 text-relay-subtle"
                />
                <div>
                  <h3 className="text-sm font-semibold">
                    Mental-model synthesis
                  </h3>
                  <p className="mt-3 max-w-3xl text-[15px] leading-7 text-relay-text/90">
                    {brief.summary}
                  </p>
                </div>
              </div>
            </div>

            {primaryUpdate ? (
              <Link
                className="group mt-7 flex items-center justify-between gap-5 rounded-md border border-relay-border bg-relay-surface px-5 py-4 transition-colors hover:border-relay-border-strong hover:bg-relay-surface-2"
                to={`/signals?update=${encodeURIComponent(primaryUpdate.id)}`}
              >
                <div className="min-w-0">
                  <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-relay-muted">
                    Inspect the underlying evidence
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

            <section className="mt-11">
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

        <aside className="border-t border-relay-border bg-relay-deep px-5 py-7 sm:px-8 xl:border-l xl:border-t-0 xl:px-6 xl:py-10">
          <section>
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
              <p className="py-8 text-sm leading-6 text-relay-muted">
                Today’s evidence did not warrant a thesis change.
              </p>
            )}
          </section>

          <section className="mt-8">
            <button
              className="flex w-full items-center justify-between border-b border-relay-border pb-3 text-left"
              onClick={() =>
                setSelectedClaimId((current) =>
                  current ? null : (briefClaims[0]?.id ?? null),
                )
              }
              type="button"
            >
              <span>
                <span className="block text-sm font-semibold">
                  Supporting evidence
                </span>
                <span className="mt-1 block text-xs text-relay-muted">
                  {briefClaims.length} source quotes
                </span>
              </span>
              <Quote aria-hidden="true" className="size-4 text-relay-subtle" />
            </button>
            <div className="mt-3 space-y-2">
              {briefClaims.map((claim, index) => (
                <button
                  className={`flex w-full items-start gap-3 rounded-md border px-3 py-3 text-left transition-colors ${
                    selectedClaimId === claim.id
                      ? "border-relay-accent bg-relay-accent/8"
                      : "border-relay-border bg-relay-surface hover:border-relay-border-strong"
                  }`}
                  key={claim.id}
                  onClick={() => setSelectedClaimId(claim.id)}
                  type="button"
                >
                  <span className="font-mono text-[10px] text-relay-accent">
                    [{index + 1}]
                  </span>
                  <span className="line-clamp-2 text-xs leading-5 text-relay-muted">
                    {claim.quote}
                  </span>
                </button>
              ))}
            </div>
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
