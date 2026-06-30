import {
  ArrowRight,
  BookOpen,
  Building2,
  CalendarDays,
  ChevronRight,
  Quote,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { EvidencePanel } from "../components/EvidencePanel";
import {
  EmptyState,
  PageError,
  PageLoading,
} from "../components/ui/AsyncState";
import { SentimentBadge } from "../components/ui/StatusBadge";
import { useDashboard } from "../context/useDashboard";
import { getSecondarySignalUpdate } from "../lib/briefs";
import { formatDate, getLayerName } from "../lib/format";
import {
  isThesisChangingImpact,
  isThesisChangingSignal,
} from "../lib/signals";

export function TodayPage() {
  const { data, error, isLoading, regenerateBrief, reload } = useDashboard();
  const [selectedClaimId, setSelectedClaimId] = useState<string | null>(null);
  const [isGeneratingBrief, setIsGeneratingBrief] = useState(false);
  const [briefError, setBriefError] = useState<string | null>(null);

  const briefClaims = useMemo(() => {
    if (!data?.brief) {
      return [];
    }
    const claims = data.updates.flatMap((update) => update.claims);
    return data.brief.citationClaimIds
      .map((claimId) => claims.find((claim) => claim.id === claimId))
      .filter((claim) => claim !== undefined);
  }, [data]);

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
        <main className="mx-auto max-w-[1100px] px-5 py-16 sm:px-8 lg:px-10 lg:py-24">
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
                to="/search"
              >
                Search evidence
              </Link>
            </div>
            {briefError ? (
              <p className="mt-4 text-sm text-relay-negative" role="alert">
                {briefError}
              </p>
            ) : null}
          </section>
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
                    to={`/theses/${impact.companyTicker}`}
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
