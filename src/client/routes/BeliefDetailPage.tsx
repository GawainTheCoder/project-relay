import {
  ArrowLeft,
  ArrowUpRight,
  Building2,
  CalendarClock,
  ClipboardCheck,
  LoaderCircle,
  Network,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import type { LayerId } from "../../shared/contracts";
import { PageError, PageLoading } from "../components/ui/AsyncState";
import { Button } from "../components/ui/Button";
import { ThesisMomentumBadge } from "../components/ui/ThesisMomentumBadge";
import { useDashboard } from "../context/useDashboard";
import { BeliefConditions } from "../features/beliefs/BeliefConditions";
import { ConfidenceMeter } from "../features/beliefs/ConfidenceMeter";
import { EvidenceRail } from "../features/beliefs/EvidenceRail";
import { useBeliefDetail } from "../features/beliefs/useBeliefs";
import { VersionTimeline } from "../features/beliefs/VersionTimeline";
import { ThesisInvestmentChain } from "../features/investment/ThesisInvestmentChain";
import { useInvestmentWorkspace } from "../features/investment/useInvestmentWorkspace";
import { SourceCoverageBadge } from "../features/sources/SourceCoverageAudit";
import {
  type BeliefRoutedSignal,
  removeCompany,
} from "../lib/api";
import { formatDate, getLayerName } from "../lib/format";

function routedSignalPath(updateId: string): string {
  return `/signals?update=${encodeURIComponent(updateId)}`;
}

function routedSignalBadge(signal: BeliefRoutedSignal): string {
  return signal.relevance ?? signal.materiality ?? "routed";
}

function routedSignalBadgeClassName(signal: BeliefRoutedSignal): string {
  const badge = routedSignalBadge(signal);
  switch (badge) {
    case "primary":
    case "high":
      return "border-relay-warning/40 bg-relay-warning/10 text-relay-warning";
    case "secondary":
    case "medium":
      return "border-relay-accent/40 bg-relay-accent/10 text-relay-accent";
    case "context":
    case "low":
      return "border-relay-border-strong bg-relay-raised text-relay-muted";
    case "not-material":
    default:
      return "border-relay-border bg-relay-surface text-relay-subtle";
  }
}

function RoutedSignalRow({
  signal,
  subdued = false,
}: {
  signal: BeliefRoutedSignal;
  subdued?: boolean;
}) {
  return (
    <article
      className={`grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_auto] ${
        subdued ? "opacity-60" : ""
      }`}
    >
      <div className="min-w-0">
        <Link
          className="inline-flex max-w-full items-start gap-1.5 text-sm font-medium leading-6 text-relay-text hover:text-relay-accent"
          to={routedSignalPath(signal.updateId)}
        >
          <span className="line-clamp-2">{signal.title}</span>
          <ArrowUpRight
            aria-hidden="true"
            className="mt-1 size-3 shrink-0"
          />
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] leading-4 text-relay-muted">
          <span>{signal.publisher}</span>
          <time
            className="font-mono text-[9px] uppercase tracking-[0.05em] text-relay-subtle"
            dateTime={signal.publishedAt}
          >
            {formatDate(signal.publishedAt, {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </time>
        </div>
        <p className="mt-2 text-xs leading-5 text-relay-muted">
          {signal.rationale}
        </p>
      </div>
      <div className="flex items-start justify-start sm:justify-end">
        <span
          className={`rounded border px-2 py-1 font-mono text-[9px] uppercase tracking-[0.07em] ${routedSignalBadgeClassName(
            signal,
          )}`}
        >
          {routedSignalBadge(signal)}
        </span>
      </div>
    </article>
  );
}

export function RoutedSignalsSection({
  onEvaluate,
  routedSignals,
}: {
  onEvaluate: () => Promise<void>;
  routedSignals: BeliefRoutedSignal[];
}) {
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [evaluationError, setEvaluationError] = useState<string | null>(
    null,
  );
  const awaitingSignals = routedSignals.filter(
    (signal) => signal.evaluationState === "awaiting-evaluation",
  );
  const evaluatedSignals = routedSignals.filter(
    (signal) => signal.evaluationState === "evaluated",
  );

  const evaluate = async () => {
    setIsEvaluating(true);
    setEvaluationError(null);
    try {
      await onEvaluate();
    } catch (caughtError) {
      setEvaluationError(
        caughtError instanceof Error
          ? caughtError.message
          : "Relay could not evaluate theses.",
      );
    } finally {
      setIsEvaluating(false);
    }
  };

  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-relay-border pb-3">
        <div>
          <h2 className="text-sm font-semibold">Awaiting evaluation</h2>
          <p className="mt-1 text-xs leading-5 text-relay-muted">
            Routed signals are visible before they become thesis proposals.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] text-relay-subtle">
            {awaitingSignals.length}
          </span>
          <Button
            className="min-h-8 px-2.5 text-xs"
            disabled={isEvaluating || awaitingSignals.length === 0}
            onClick={() => void evaluate()}
            variant="secondary"
          >
            {isEvaluating ? (
              <LoaderCircle
                aria-hidden="true"
                className="size-3.5 animate-spin"
              />
            ) : null}
            {isEvaluating ? "Evaluating" : "Evaluate theses"}
          </Button>
        </div>
      </div>
      {evaluationError ? (
        <p
          className="mt-4 border-l border-relay-negative pl-3 text-xs leading-5 text-relay-negative"
          role="alert"
        >
          {evaluationError}
        </p>
      ) : null}
      {awaitingSignals.length ? (
        <div className="divide-y divide-relay-border">
          {awaitingSignals.map((signal) => (
            <RoutedSignalRow key={signal.updateId} signal={signal} />
          ))}
        </div>
      ) : (
        <p className="py-6 text-sm leading-6 text-relay-subtle">
          No routed signals are waiting for thesis evaluation.
        </p>
      )}
      {evaluatedSignals.length ? (
        <section className="mt-8">
          <div className="flex items-end justify-between border-b border-relay-border pb-3">
            <div>
              <h3 className="text-sm font-semibold">Evaluated</h3>
              <p className="mt-1 text-xs leading-5 text-relay-muted">
                These routed signals already fed a thesis evaluation.
              </p>
            </div>
            <span className="font-mono text-[10px] text-relay-subtle">
              {evaluatedSignals.length}
            </span>
          </div>
          <div className="divide-y divide-relay-border">
            {evaluatedSignals.map((signal) => (
              <RoutedSignalRow
                key={signal.updateId}
                signal={signal}
                subdued
              />
            ))}
          </div>
        </section>
      ) : null}
    </section>
  );
}

export function BeliefDetailPage() {
  const { beliefId = "" } = useParams();
  const {
    data,
    error,
    evaluateAllBeliefs,
    isLoading,
    reload,
  } = useDashboard();
  const [beliefRevision, setBeliefRevision] = useState(0);
  const { belief, isResolving } = useBeliefDetail(
    data,
    beliefId,
    beliefRevision,
  );
  const navigate = useNavigate();
  const investment = useInvestmentWorkspace();
  const [isRemoveOpen, setIsRemoveOpen] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  if (isLoading || isResolving) {
    return <PageLoading label="Loading thesis" />;
  }
  if (error || !data) {
    return (
      <PageError
        error={error ?? "Thesis intelligence is unavailable."}
        onRetry={() => void reload()}
      />
    );
  }
  if (!belief) {
    return (
      <div className="grid min-h-screen place-items-center px-6">
        <section className="max-w-md border-l border-relay-warning pl-5">
          <p className="font-mono text-xs uppercase tracking-[0.1em] text-relay-warning">
            Thesis not found
          </p>
          <h1 className="mt-3 text-2xl font-semibold">
            Relay is not tracking this thesis.
          </h1>
          <Link
            className="mt-5 inline-flex items-center gap-2 text-sm text-relay-accent hover:text-white"
            to="/theses"
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
            Back to theses
          </Link>
        </section>
      </div>
    );
  }

  const removeFromWatchlist = async () => {
    if (!belief.companyTicker) {
      return;
    }
    setRemoveError(null);
    setIsRemoving(true);
    try {
      await removeCompany(belief.companyTicker);
      await reload();
      navigate("/theses");
    } catch (caughtError) {
      setRemoveError(
        caughtError instanceof Error
          ? caughtError.message
          : "The company thesis could not be removed.",
      );
      setIsRemoving(false);
    }
  };
  const TypeIcon = belief.kind === "macro" ? Network : Building2;
  const sourceCoverage = data.sourceCoverage.find(
    (coverage) => coverage.thesisId === belief.id,
  );
  const evaluateRoutedSignals = async () => {
    await evaluateAllBeliefs();
    setBeliefRevision((current) => current + 1);
  };

  return (
    <div className="relay-enter min-h-screen">
      <header className="border-b border-relay-border px-5 py-5 sm:px-8 lg:px-10">
        <div className="mx-auto max-w-[1440px]">
          <Link
            className="inline-flex items-center gap-2 text-xs text-relay-muted hover:text-relay-text"
            to={`/theses${belief.kind === "macro" ? "?type=macro" : ""}`}
          >
            <ArrowLeft aria-hidden="true" className="size-3.5" />
            All theses
          </Link>
          <div className="mt-5 flex flex-wrap items-end justify-between gap-5">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3 font-mono text-[10px] uppercase tracking-[0.1em] text-relay-muted">
                <span className="inline-flex items-center gap-1.5 text-relay-accent">
                  <TypeIcon aria-hidden="true" className="size-3.5" />
                  {belief.kind} thesis
                </span>
                <ThesisMomentumBadge momentum={belief.momentum} />
                {sourceCoverage ? (
                  <Link to="/sources#macro-thesis-coverage">
                    <SourceCoverageBadge status={sourceCoverage.status} />
                  </Link>
                ) : null}
                {belief.layerIds.map((layerId) => (
                  <span key={layerId}>
                    {getLayerName(layerId as LayerId)}
                  </span>
                ))}
              </div>
              <h1 className="mt-3 max-w-4xl text-2xl font-semibold leading-tight tracking-[-0.02em] sm:text-4xl">
                {belief.title}
              </h1>
            </div>
            <div className="flex w-full items-end gap-3 sm:w-auto">
              <div className="min-w-52 flex-1">
                <ConfidenceMeter confidence={belief.confidence} />
              </div>
              {belief.companyTicker ? (
                <Button
                  aria-label={`Remove ${belief.companyTicker} thesis`}
                  onClick={() => setIsRemoveOpen(true)}
                  variant="quiet"
                >
                  <Trash2 aria-hidden="true" className="size-3.5" />
                  Remove
                </Button>
              ) : null}
              {belief.pendingEvaluations.length ? (
                <Link
                  className="inline-flex min-h-11 items-center gap-2 rounded-md border border-relay-accent bg-relay-accent/10 px-3 text-sm font-medium text-relay-accent hover:bg-relay-accent hover:text-relay-deep"
                  to={`/reviews?review=${encodeURIComponent(belief.pendingEvaluations[0]!.id)}`}
                >
                  <ClipboardCheck aria-hidden="true" className="size-4" />
                  Review proposal
                </Link>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1440px] xl:grid-cols-[minmax(0,1fr)_350px]">
        <main className="min-w-0 px-5 py-8 sm:px-8 lg:px-10">
          <section className="max-w-4xl border-l-2 border-relay-accent pl-5 sm:pl-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-relay-muted">
                Current thesis
              </p>
              <time
                className="font-mono text-[9px] uppercase tracking-[0.06em] text-relay-subtle"
                dateTime={belief.updatedAt}
              >
                Updated{" "}
                {formatDate(belief.updatedAt, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </time>
            </div>
            <h2 className="mt-4 text-xl font-medium leading-8 tracking-tight sm:text-3xl sm:leading-10">
              {belief.statement}
            </h2>
            {belief.nextReviewOn ? (
              <p className="mt-5 flex items-center gap-2 text-xs text-relay-muted">
                <CalendarClock aria-hidden="true" className="size-4" />
                Next review {formatDate(belief.nextReviewOn)}
              </p>
            ) : null}
            {belief.whyItMatters ? (
              <p className="mt-5 max-w-3xl text-[15px] leading-7 text-relay-muted">
                {belief.whyItMatters}
              </p>
            ) : null}
          </section>

          {belief.latestChange ? (
            <section className="mt-7 max-w-4xl border-y border-relay-border py-5">
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-relay-muted">
                What changed
              </p>
              <p className="mt-3 text-sm leading-7 text-relay-text/90">
                {belief.latestChange}
              </p>
            </section>
          ) : null}

          {belief.kind === "macro" ? (
            <ThesisInvestmentChain
              belief={belief}
              portfolio={investment.portfolio}
            />
          ) : null}

          <BeliefConditions
            strengthening={belief.strengtheningConditions}
            unknowns={belief.unknowns}
            weakening={belief.weakeningConditions}
          />
          <VersionTimeline versions={belief.versions} />
          <RoutedSignalsSection
            onEvaluate={evaluateRoutedSignals}
            routedSignals={belief.routedSignals}
          />
          <section className="mt-10 border-y border-relay-border py-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-sm font-semibold">Decision review</h2>
                <p className="mt-1 text-xs leading-5 text-relay-muted">
                  Review thesis direction, portfolio action, and the next
                  checkpoint together in the decision journal.
                </p>
              </div>
              {belief.pendingEvaluations.length ? (
                <Link
                  className="inline-flex min-h-11 items-center gap-2 rounded-md border border-relay-accent bg-relay-accent/10 px-3 text-sm font-medium text-relay-accent hover:bg-relay-accent hover:text-relay-deep"
                  to={`/reviews?review=${encodeURIComponent(belief.pendingEvaluations[0]!.id)}`}
                >
                  <ClipboardCheck aria-hidden="true" className="size-4" />
                  Open {belief.pendingEvaluations.length} review
                  {belief.pendingEvaluations.length === 1 ? "" : "s"}
                </Link>
              ) : (
                <span className="text-xs text-relay-subtle">
                  No proposal waiting
                </span>
              )}
            </div>
          </section>
        </main>

        <EvidenceRail
          contextual={belief.contextualEvidence}
          opposing={belief.opposingEvidence}
          supporting={belief.supportingEvidence}
        />
      </div>

      {isRemoveOpen ? (
        <div
          aria-labelledby="remove-belief-title"
          aria-modal="true"
          className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target && !isRemoving) {
              setIsRemoveOpen(false);
            }
          }}
          role="dialog"
        >
          <section className="w-full max-w-md rounded-lg border border-relay-border-strong bg-relay-surface shadow-2xl shadow-black/60">
            <div className="p-5">
              <h2
                className="text-lg font-semibold tracking-tight"
                id="remove-belief-title"
              >
                Remove {belief.companyTicker}?
              </h2>
              <p className="mt-2 text-sm leading-6 text-relay-muted">
                This removes the company thesis from your mental model. The
                immutable evidence ledger remains intact.
              </p>
              {removeError ? (
                <p
                  className="mt-4 rounded-md border border-relay-negative/35 bg-relay-negative/8 px-3 py-2.5 text-xs leading-5 text-relay-negative"
                  role="alert"
                >
                  {removeError}
                </p>
              ) : null}
            </div>
            <footer className="flex items-center justify-end gap-2 border-t border-relay-border px-5 py-4">
              <Button
                disabled={isRemoving}
                onClick={() => setIsRemoveOpen(false)}
                variant="quiet"
              >
                Cancel
              </Button>
              <Button
                disabled={isRemoving}
                onClick={() => void removeFromWatchlist()}
                variant="danger"
              >
                {isRemoving ? (
                  <LoaderCircle
                    aria-hidden="true"
                    className="size-3.5 animate-spin"
                  />
                ) : (
                  <Trash2 aria-hidden="true" className="size-3.5" />
                )}
                {isRemoving ? "Removing" : "Remove thesis"}
              </Button>
            </footer>
          </section>
        </div>
      ) : null}
    </div>
  );
}
