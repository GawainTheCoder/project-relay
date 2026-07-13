import {
  AlertCircle,
  ArrowRight,
  CalendarDays,
  Check,
  Clock3,
  ExternalLink,
  LoaderCircle,
  Pause,
  Quote,
  X,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import type {
  IntelligenceUpdate,
  PortfolioDecisionInput,
  ThesisEvaluationReviewInput,
  ThesisReview,
} from "../../../shared/contracts";
import { Button } from "../../components/ui/Button";
import { ThesisMomentumBadge } from "../../components/ui/ThesisMomentumBadge";
import { reviewBeliefEvaluation } from "../../lib/api";
import { formatDate } from "../../lib/format";
import {
  PortfolioDecisionFieldset,
  type PortfolioDecisionDraft,
} from "./PortfolioDecisionFieldset";
import {
  evaluationMomentum,
  reviewDisplayDate,
  reviewStatusLabel,
} from "./reviewPresentation";

function initialDecisionDrafts(
  review: ThesisReview,
): Record<string, PortfolioDecisionDraft> {
  return Object.fromEntries(
    review.evaluation.portfolioDecisions.map((decision) => [
      decision.portfolioItemId,
      { action: decision.action, rationale: decision.rationale },
    ]),
  );
}

function itemsForReview(
  review: ThesisReview,
): ThesisReview["affectedPortfolioItems"] {
  return [...review.affectedPortfolioItems]
    .sort((left, right) => {
      if (left.status === right.status) {
        return (right.allocationPercent ?? 0) - (left.allocationPercent ?? 0);
      }
      return left.status === "holding" ? -1 : 1;
    });
}

function citedEvidence(review: ThesisReview, updates: IntelligenceUpdate[]) {
  const claims = new Set(review.evaluation.claimIds);
  return updates
    .flatMap((update) =>
      update.claims.map((claim) => ({ claim, update })),
    )
    .filter(({ claim }) => claims.has(claim.id))
    .slice(0, 4);
}

function localDateInputValue(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function ReviewDetailPanel({
  evidenceError = null,
  isEvidenceLoading = false,
  onCompleted,
  onEvidenceRetry,
  review,
  updates,
}: {
  evidenceError?: string | null;
  isEvidenceLoading?: boolean;
  onCompleted: (
    decision: ThesisEvaluationReviewInput["decision"],
  ) => Promise<void>;
  onEvidenceRetry?: () => void;
  review: ThesisReview | null;
  updates: IntelligenceUpdate[];
}) {
  const [decisionDrafts, setDecisionDrafts] = useState<
    Record<string, PortfolioDecisionDraft>
  >(() => (review ? initialDecisionDrafts(review) : {}));
  const [nextReviewOn, setNextReviewOn] = useState(
    review?.evaluation.nextReviewOn ?? "",
  );
  const [note, setNote] = useState(review?.evaluation.reviewNote ?? "");
  const [activeDecision, setActiveDecision] = useState<
    ThesisEvaluationReviewInput["decision"] | null
  >(null);
  const [error, setError] = useState<string | null>(null);

  if (!review) {
    return (
      <section className="grid min-h-[520px] place-items-center px-6 text-center">
        <div className="max-w-sm">
          <Clock3
            aria-hidden="true"
            className="mx-auto size-6 text-relay-subtle"
          />
          <h2 className="mt-4 text-lg font-semibold">
            No review proposal ready
          </h2>
          <p className="mt-2 text-sm leading-6 text-relay-muted">
            Portfolio controls stay disabled until evaluated evidence produces a
            reviewable thesis proposal.
          </p>
          <Button className="mt-5" disabled>
            Record decision
          </Button>
        </div>
      </section>
    );
  }

  const evaluation = review.evaluation;
  const displayedAt = reviewDisplayDate(evaluation);
  const affectedItems = itemsForReview(review);
  const currentHoldings = affectedItems.filter(
    (item) => item.status === "holding",
  );
  const futureCandidates = affectedItems.filter(
    (item) => item.status !== "holding",
  );
  const evidence = citedEvidence(review, updates);
  const isActionable =
    Boolean(evaluation.id) &&
    (evaluation.reviewStatus === "pending" ||
      evaluation.reviewStatus === "deferred");
  const isHistory = !isActionable;

  const submit = async (
    decision: ThesisEvaluationReviewInput["decision"],
  ) => {
    setError(null);
    if (!nextReviewOn) {
      setError("Choose the next review date before recording this review.");
      return;
    }
    let portfolioDecisions: PortfolioDecisionInput[] | undefined;
    if (decision === "accepted") {
      const missingDecision = currentHoldings.find((item) => {
        const draft = decisionDrafts[item.id];
        return !draft?.action || !draft.rationale.trim();
      });
      if (missingDecision) {
        setError(
          `Choose an action and add a rationale for ${missingDecision.symbol ?? missingDecision.name}.`,
        );
        return;
      }
      const incompleteCandidate = futureCandidates.find((item) => {
        const draft = decisionDrafts[item.id];
        return Boolean(draft?.action && !draft.rationale.trim());
      });
      if (incompleteCandidate) {
        setError(
          `Add a rationale for the optional ${incompleteCandidate.symbol ?? incompleteCandidate.name} action, or clear the action.`,
        );
        return;
      }
      portfolioDecisions = affectedItems.flatMap((item) => {
        const draft = decisionDrafts[item.id];
        if (!draft?.action) {
          return [];
        }
        return [{
          portfolioItemId: item.id,
          action: draft.action,
          rationale: draft.rationale.trim(),
        }];
      });
    }

    setActiveDecision(decision);
    try {
      await reviewBeliefEvaluation(evaluation.id, {
        decision,
        nextReviewOn,
        ...(note.trim() ? { note: note.trim() } : {}),
        ...(decision === "accepted" ? { portfolioDecisions } : {}),
      });
      await onCompleted(decision);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "The review could not be recorded.",
      );
    } finally {
      setActiveDecision(null);
    }
  };

  return (
    <article className="min-w-0">
      <header className="border-b border-relay-border px-5 py-6 sm:px-7 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <ThesisMomentumBadge momentum={evaluationMomentum(evaluation)} />
            <span className="text-xs text-relay-muted">
              {reviewStatusLabel(evaluation.reviewStatus)}
            </span>
          </div>
          <time
            className="flex items-center gap-1.5 text-xs text-relay-muted"
            dateTime={displayedAt}
          >
            <CalendarDays aria-hidden="true" className="size-3.5" />
            {formatDate(displayedAt, {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </time>
        </div>
        <p className="mt-5 text-xs font-medium text-relay-muted">
          Affected thesis
        </p>
        <h2 className="mt-2 max-w-3xl text-2xl font-semibold leading-tight tracking-[-0.02em] sm:text-3xl">
          {review.thesisTitle}
        </h2>
        <Link
          className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-md text-sm text-relay-accent hover:text-white"
          to={`/theses/${encodeURIComponent(evaluation.thesisId)}`}
        >
          Open thesis
          <ExternalLink aria-hidden="true" className="size-3.5" />
        </Link>
      </header>

      <div className="space-y-8 px-5 py-7 sm:px-7 lg:px-8">
        <section aria-labelledby="what-changed-title">
          <p className="text-xs font-medium text-relay-muted">What changed</p>
          <h3
            className="mt-2 text-lg font-semibold tracking-tight"
            id="what-changed-title"
          >
            {review.whatChanged}
          </h3>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-relay-muted">
            {evaluation.rationale}
          </p>
          <dl className="mt-5 grid gap-3 rounded-lg border border-relay-border bg-relay-deep p-4 sm:grid-cols-3">
            <div>
              <dt className="text-xs text-relay-muted">Thesis outcome</dt>
              <dd className="mt-1 text-sm font-semibold capitalize">
                {evaluationMomentum(evaluation)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-relay-muted">Confidence change</dt>
              <dd className="mt-1 text-sm font-semibold">
                {evaluation.confidenceDelta > 0 ? "+" : ""}
                {evaluation.confidenceDelta}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-relay-muted">Evidence chains</dt>
              <dd className="mt-1 text-sm font-semibold">
                {evaluation.signalIds.length}
              </dd>
            </div>
          </dl>
        </section>

        <section aria-labelledby="review-evidence-title">
          <div className="flex items-center justify-between gap-3 border-b border-relay-border pb-3">
            <h3
              className="flex items-center gap-2 text-sm font-semibold"
              id="review-evidence-title"
            >
              <Quote aria-hidden="true" className="size-4 text-relay-accent" />
              Evidence behind this review
            </h3>
            <span className="text-xs text-relay-muted">
              {evaluation.claimIds.length} claim
              {evaluation.claimIds.length === 1 ? "" : "s"}
            </span>
          </div>
          {isEvidenceLoading ? (
            <div
              aria-busy="true"
              className="flex min-h-24 items-center gap-3 py-5 text-sm text-relay-muted"
              role="status"
            >
              <LoaderCircle
                aria-hidden="true"
                className="size-4 animate-spin text-relay-accent"
              />
              Loading cited evidence
            </div>
          ) : evidenceError ? (
            <div className="py-5">
              <p
                className="flex items-start gap-2 text-sm leading-6 text-relay-negative"
                role="alert"
              >
                <AlertCircle
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0"
                />
                Cited evidence could not be loaded. {evidenceError}
              </p>
              {onEvidenceRetry ? (
                <Button
                  className="mt-4"
                  onClick={onEvidenceRetry}
                  variant="quiet"
                >
                  Retry evidence
                </Button>
              ) : null}
            </div>
          ) : evidence.length ? (
            <ol className="divide-y divide-relay-border">
              {evidence.map(({ claim, update }, index) => (
                <li className="py-4" key={claim.id}>
                  <blockquote className="text-sm leading-7 text-relay-text">
                    <span className="mr-2 text-relay-accent">[{index + 1}]</span>
                    “{claim.quote}”
                  </blockquote>
                  <Link
                    className="mt-2 inline-flex items-center gap-1.5 text-xs text-relay-muted hover:text-relay-accent"
                    to={`/signals?update=${encodeURIComponent(update.id)}`}
                  >
                    {update.publisher} · {claim.locator}
                    <ArrowRight aria-hidden="true" className="size-3.5" />
                  </Link>
                </li>
              ))}
            </ol>
          ) : (
            <p className="py-5 text-sm leading-6 text-relay-muted">
              Exact source quotes remain available in the linked Evidence
              Library record.
            </p>
          )}
        </section>

        <section aria-labelledby="portfolio-decisions-title">
          <div className="border-b border-relay-border pb-3">
            <p className="text-xs font-medium text-relay-muted">
              Separate from thesis direction
            </p>
            <h3
              className="mt-2 text-lg font-semibold tracking-tight"
              id="portfolio-decisions-title"
            >
              Portfolio decisions
            </h3>
            <p className="mt-2 text-sm leading-6 text-relay-muted">
              A strengthening thesis can still lead to Hold or Reduce when
              allocation and valuation already carry enough exposure.
            </p>
          </div>

          {affectedItems.length ? (
            <div className="mt-4 space-y-7">
              {currentHoldings.length ? (
                <section aria-labelledby="current-holding-decisions-title">
                  <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                    <h4
                      className="text-sm font-semibold"
                      id="current-holding-decisions-title"
                    >
                      Current holdings
                    </h4>
                    <span className="text-xs text-relay-muted">
                      Decision and rationale required when accepting
                    </span>
                  </div>
                  <div className="space-y-4">
                    {currentHoldings.map((item) => (
                      <PortfolioDecisionFieldset
                        disabled={isHistory || activeDecision !== null}
                        item={item}
                        key={item.id}
                        onChange={(next) =>
                          setDecisionDrafts((current) => ({
                            ...current,
                            [item.id]: next,
                          }))
                        }
                        value={
                          decisionDrafts[item.id] ?? {
                            action: null,
                            rationale: "",
                          }
                        }
                      />
                    ))}
                  </div>
                </section>
              ) : null}

              {futureCandidates.length ? (
                <section aria-labelledby="future-candidate-decisions-title">
                  <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                    <h4
                      className="text-sm font-semibold"
                      id="future-candidate-decisions-title"
                    >
                      Future candidates
                    </h4>
                    <span className="text-xs text-relay-muted">
                      Optional · rationale required only when choosing an action
                    </span>
                  </div>
                  <div className="space-y-4">
                    {futureCandidates.map((item) => (
                      <PortfolioDecisionFieldset
                        disabled={isHistory || activeDecision !== null}
                        item={item}
                        key={item.id}
                        onChange={(next) =>
                          setDecisionDrafts((current) => ({
                            ...current,
                            [item.id]: next,
                          }))
                        }
                        value={
                          decisionDrafts[item.id] ?? {
                            action: null,
                            rationale: "",
                          }
                        }
                      />
                    ))}
                  </div>
                </section>
              ) : null}
            </div>
          ) : (
            <div className="mt-4 rounded-lg border border-relay-border bg-relay-deep p-4">
              <h4 className="text-sm font-semibold">No mapped portfolio item</h4>
              <p className="mt-2 text-sm leading-6 text-relay-muted">
                You can review the thesis proposal, but Relay has no holding or
                watchlist candidate linked to it yet.
              </p>
            </div>
          )}
        </section>

        <section className="grid gap-4 sm:grid-cols-2">
          <label>
            <span className="flex items-center gap-2 text-xs font-medium text-relay-muted">
              <CalendarDays aria-hidden="true" className="size-3.5" />
              Next review date
            </span>
            <input
              className="mt-2 min-h-11 w-full rounded-md border border-relay-control bg-relay-deep px-3 text-sm disabled:cursor-not-allowed disabled:opacity-45"
              disabled={isHistory || activeDecision !== null}
              min={localDateInputValue()}
              onChange={(event) => setNextReviewOn(event.target.value)}
              required
              type="date"
              value={nextReviewOn}
            />
          </label>
          <label>
            <span className="text-xs font-medium text-relay-muted">
              Review note
            </span>
            <textarea
              className="mt-2 min-h-24 w-full resize-y rounded-md border border-relay-control bg-relay-deep px-3 py-2.5 text-sm leading-6 disabled:cursor-not-allowed disabled:opacity-45"
              disabled={isHistory || activeDecision !== null}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Optional context for the decision log"
              value={note}
            />
          </label>
        </section>

        {error ? (
          <p
            className="flex items-start gap-2 rounded-md border border-relay-negative/35 bg-relay-negative/5 px-3 py-3 text-sm leading-6 text-relay-negative"
            role="alert"
          >
            <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            {error}
          </p>
        ) : null}
      </div>

      {isActionable ? (
        <footer className="sticky bottom-[68px] z-10 flex flex-wrap items-center justify-end gap-2 border-t border-relay-border bg-relay-bg/95 px-5 py-4 backdrop-blur sm:px-7 lg:bottom-0 lg:px-8">
          {evaluation.reviewStatus !== "deferred" ? (
            <Button
              disabled={activeDecision !== null}
              onClick={() => void submit("deferred")}
              variant="quiet"
            >
              {activeDecision === "deferred" ? (
                <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
              ) : (
                <Pause aria-hidden="true" className="size-4" />
              )}
              Defer
            </Button>
          ) : null}
          <Button
            disabled={activeDecision !== null}
            onClick={() => void submit("rejected")}
            variant="danger"
          >
            {activeDecision === "rejected" ? (
              <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
            ) : (
              <X aria-hidden="true" className="size-4" />
            )}
            Reject proposal
          </Button>
          <Button
            disabled={activeDecision !== null}
            onClick={() => void submit("accepted")}
            variant="primary"
          >
            {activeDecision === "accepted" ? (
              <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
            ) : (
              <Check aria-hidden="true" className="size-4" />
            )}
            Accept and record
          </Button>
        </footer>
      ) : (
        <footer className="border-t border-relay-border px-5 py-4 text-sm text-relay-muted sm:px-7 lg:px-8">
          This review is part of the permanent decision history.
        </footer>
      )}
    </article>
  );
}
