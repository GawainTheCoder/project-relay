import {
  ArrowLeft,
  Building2,
  LoaderCircle,
  Network,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import type {
  LayerId,
  ThesisEvaluationReviewInput,
} from "../../shared/contracts";
import { PageError, PageLoading } from "../components/ui/AsyncState";
import { Button } from "../components/ui/Button";
import { useDashboard } from "../context/useDashboard";
import { BeliefConditions } from "../features/beliefs/BeliefConditions";
import { ConfidenceMeter } from "../features/beliefs/ConfidenceMeter";
import { EvidenceRail } from "../features/beliefs/EvidenceRail";
import { PendingEvaluations } from "../features/beliefs/PendingEvaluations";
import { useBeliefDetail } from "../features/beliefs/useBeliefs";
import { VersionTimeline } from "../features/beliefs/VersionTimeline";
import { SourceCoverageBadge } from "../features/sources/SourceCoverageAudit";
import {
  removeCompany,
  reviewBeliefEvaluation,
} from "../lib/api";
import { formatDate, getLayerName } from "../lib/format";

export function BeliefDetailPage() {
  const { beliefId = "" } = useParams();
  const { data, error, isLoading, reload } = useDashboard();
  const [beliefRevision, setBeliefRevision] = useState(0);
  const { belief, isResolving } = useBeliefDetail(
    data,
    beliefId,
    beliefRevision,
  );
  const navigate = useNavigate();
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
  const reviewEvaluation = async (
    evaluationId: string,
    decision: ThesisEvaluationReviewInput["decision"],
  ) => {
    await reviewBeliefEvaluation(evaluationId, { decision });
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

          <BeliefConditions
            strengthening={belief.strengtheningConditions}
            unknowns={belief.unknowns}
            weakening={belief.weakeningConditions}
          />
          <VersionTimeline versions={belief.versions} />
          <PendingEvaluations
            evaluations={belief.pendingEvaluations}
            onReview={reviewEvaluation}
          />
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
