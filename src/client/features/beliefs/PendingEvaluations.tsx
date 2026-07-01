import {
  Check,
  Clock3,
  LoaderCircle,
  Pause,
  Sparkles,
  X,
} from "lucide-react";
import { useState } from "react";

import type { ThesisEvaluationReviewInput } from "../../../shared/contracts";
import type { BeliefEvaluation } from "../../lib/api";
import { formatDate } from "../../lib/format";

function formatOutcome(outcome: BeliefEvaluation["outcome"]) {
  return outcome
    .split("-")
    .map((word) => word[0]?.toUpperCase() + word.slice(1))
    .join(" ");
}

function EvaluationRow({
  activeReview,
  evaluation,
  isDeferred,
  onReview,
}: {
  activeReview: {
    id: string;
    decision: ThesisEvaluationReviewInput["decision"];
  } | null;
  evaluation: BeliefEvaluation;
  isDeferred: boolean;
  onReview: (
    evaluationId: string,
    decision: ThesisEvaluationReviewInput["decision"],
  ) => void;
}) {
  const activeDecision =
    activeReview?.id === evaluation.id ? activeReview.decision : null;
  return (
    <article className="grid gap-4 py-5 sm:grid-cols-[130px_minmax(0,1fr)_auto] sm:items-center">
      <div>
        <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-relay-warning">
          {formatOutcome(evaluation.outcome)}
        </span>
        <time
          className="mt-1 flex items-center gap-1.5 font-mono text-[9px] text-relay-subtle"
          dateTime={evaluation.createdAt}
        >
          <Clock3 aria-hidden="true" className="size-3" />
          {formatDate(evaluation.createdAt, {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </time>
      </div>
      <div>
        <p className="text-sm leading-6 text-relay-text">
          {evaluation.proposedStatement ?? evaluation.rationale}
        </p>
        {evaluation.proposedStatement ? (
          <p className="mt-1 text-xs leading-5 text-relay-muted">
            {evaluation.rationale}
          </p>
        ) : null}
        {evaluation.reviewRecommendation ? (
          <div className="mt-3 flex items-start gap-2 rounded border border-relay-border bg-relay-surface px-3 py-2.5">
            <Sparkles
              aria-hidden="true"
              className="mt-0.5 size-3.5 shrink-0 text-relay-accent"
            />
            <p className="text-xs leading-5 text-relay-muted">
              <span
                className={
                  evaluation.reviewRecommendation === "accept"
                    ? "font-medium text-relay-positive"
                    : "font-medium text-relay-negative"
                }
              >
                LLM suggestion:{" "}
                {evaluation.reviewRecommendation === "accept"
                  ? "Accept"
                  : "Reject"}
              </span>
              {evaluation.reviewRecommendationReason
                ? ` — ${evaluation.reviewRecommendationReason}`
                : null}
            </p>
          </div>
        ) : (
          <p className="mt-2 text-[11px] leading-5 text-relay-subtle">
            LLM suggestion unavailable for this earlier evaluation.
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <span
          className={`mr-2 font-mono text-[10px] ${
            evaluation.confidenceDelta > 0
              ? "text-relay-positive"
              : evaluation.confidenceDelta < 0
                ? "text-relay-negative"
                : "text-relay-muted"
          }`}
        >
          {evaluation.confidenceDelta > 0 ? "+" : ""}
          {evaluation.confidenceDelta} confidence
        </span>
        {isDeferred ? (
          <span className="inline-flex min-h-8 items-center gap-1.5 rounded border border-relay-warning/30 bg-relay-warning/7 px-2.5 text-xs text-relay-warning">
            <Pause aria-hidden="true" className="size-3" />
            Deferred
          </span>
        ) : null}
        <button
          className="inline-flex min-h-8 items-center gap-1.5 rounded border border-relay-positive/40 px-2.5 text-xs text-relay-positive hover:border-relay-positive hover:bg-relay-positive/8 disabled:opacity-50"
          disabled={activeReview !== null}
          onClick={() => onReview(evaluation.id, "accepted")}
          type="button"
        >
          {activeDecision === "accepted" ? (
            <LoaderCircle
              aria-hidden="true"
              className="size-3 animate-spin"
            />
          ) : (
            <Check aria-hidden="true" className="size-3" />
          )}
          {activeDecision === "accepted" ? "Accepting" : "Accept"}
        </button>
        {!isDeferred ? (
          <button
            className="inline-flex min-h-8 items-center gap-1.5 rounded border border-relay-border px-2.5 text-xs text-relay-muted hover:border-relay-warning/50 hover:text-relay-warning disabled:opacity-50"
            disabled={activeReview !== null}
            onClick={() => onReview(evaluation.id, "deferred")}
            type="button"
          >
            {activeDecision === "deferred" ? (
              <LoaderCircle
                aria-hidden="true"
                className="size-3 animate-spin"
              />
            ) : (
              <Pause aria-hidden="true" className="size-3" />
            )}
            {activeDecision === "deferred" ? "Deferring" : "Defer"}
          </button>
        ) : null}
        <button
          className="inline-flex min-h-8 items-center gap-1.5 rounded border border-relay-border px-2.5 text-xs text-relay-muted hover:border-relay-negative/50 hover:text-relay-negative disabled:opacity-50"
          disabled={activeReview !== null}
          onClick={() => onReview(evaluation.id, "rejected")}
          type="button"
        >
          {activeDecision === "rejected" ? (
            <LoaderCircle
              aria-hidden="true"
              className="size-3 animate-spin"
            />
          ) : (
            <X aria-hidden="true" className="size-3" />
          )}
          {activeDecision === "rejected" ? "Rejecting" : "Reject"}
        </button>
      </div>
    </article>
  );
}

export function PendingEvaluations({
  evaluations,
  onReview,
}: {
  evaluations: BeliefEvaluation[];
  onReview: (
    evaluationId: string,
    decision: ThesisEvaluationReviewInput["decision"],
  ) => Promise<void>;
}) {
  const [activeReview, setActiveReview] = useState<{
    id: string;
    decision: ThesisEvaluationReviewInput["decision"];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pendingEvaluations = evaluations.filter(
    (evaluation) => evaluation.reviewStatus === "pending",
  );
  const deferredEvaluations = evaluations.filter(
    (evaluation) => evaluation.reviewStatus === "deferred",
  );

  const review = async (
    evaluationId: string,
    decision: ThesisEvaluationReviewInput["decision"],
  ) => {
    setActiveReview({ id: evaluationId, decision });
    setError(null);
    try {
      await onReview(evaluationId, decision);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "The thesis evaluation could not be reviewed.",
      );
    } finally {
      setActiveReview(null);
    }
  };

  return (
    <section className="mt-10">
      <div className="flex items-end justify-between border-b border-relay-border pb-3">
        <div>
          <h2 className="text-sm font-semibold">Pending evaluations</h2>
          <p className="mt-1 text-xs leading-5 text-relay-muted">
            Model-proposed changes remain separate until you review them.
          </p>
        </div>
        <span className="font-mono text-[10px] text-relay-subtle">
          {pendingEvaluations.length}
        </span>
      </div>
      {error ? (
        <p
          className="mt-4 border-l border-relay-negative pl-3 text-xs leading-5 text-relay-negative"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      {pendingEvaluations.length ? (
        <div className="divide-y divide-relay-border">
          {pendingEvaluations.map((evaluation) => (
            <EvaluationRow
              activeReview={activeReview}
              evaluation={evaluation}
              isDeferred={false}
              key={evaluation.id}
              onReview={(evaluationId, decision) => {
                void review(evaluationId, decision);
              }}
            />
          ))}
        </div>
      ) : (
        <p className="py-6 text-sm leading-6 text-relay-subtle">
          No thesis changes are waiting for review.
        </p>
      )}
      {deferredEvaluations.length ? (
        <section className="mt-8">
          <div className="flex items-end justify-between border-b border-relay-border pb-3">
            <div>
              <h3 className="text-sm font-semibold">Deferred for later</h3>
              <p className="mt-1 text-xs leading-5 text-relay-muted">
                These proposals are excluded from briefs and remain available
                to accept or reject later.
              </p>
            </div>
            <span className="font-mono text-[10px] text-relay-subtle">
              {deferredEvaluations.length}
            </span>
          </div>
          <div className="divide-y divide-relay-border">
            {deferredEvaluations.map((evaluation) => (
              <EvaluationRow
                activeReview={activeReview}
                evaluation={evaluation}
                isDeferred
                key={evaluation.id}
                onReview={(evaluationId, decision) => {
                  void review(evaluationId, decision);
                }}
              />
            ))}
          </div>
        </section>
      ) : null}
    </section>
  );
}
