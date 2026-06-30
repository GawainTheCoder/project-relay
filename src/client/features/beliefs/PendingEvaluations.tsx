import { Check, Clock3, LoaderCircle, Pause, X } from "lucide-react";
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
  const [activeId, setActiveId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const review = async (
    evaluationId: string,
    decision: ThesisEvaluationReviewInput["decision"],
  ) => {
    setActiveId(evaluationId);
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
      setActiveId(null);
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
          {evaluations.length}
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
      {evaluations.length ? (
        <div className="divide-y divide-relay-border">
          {evaluations.map((evaluation) => (
            <article
              className="grid gap-4 py-5 sm:grid-cols-[130px_minmax(0,1fr)_auto] sm:items-center"
              key={evaluation.id}
            >
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
                <button
                  className="inline-flex min-h-8 items-center gap-1.5 rounded border border-relay-positive/40 px-2.5 text-xs text-relay-positive hover:border-relay-positive hover:bg-relay-positive/8 disabled:opacity-50"
                  disabled={activeId !== null}
                  onClick={() => void review(evaluation.id, "accepted")}
                  type="button"
                >
                  {activeId === evaluation.id ? (
                    <LoaderCircle
                      aria-hidden="true"
                      className="size-3 animate-spin"
                    />
                  ) : (
                    <Check aria-hidden="true" className="size-3" />
                  )}
                  Accept
                </button>
                <button
                  className="inline-flex min-h-8 items-center gap-1.5 rounded border border-relay-border px-2.5 text-xs text-relay-muted hover:border-relay-warning/50 hover:text-relay-warning disabled:opacity-50"
                  disabled={activeId !== null}
                  onClick={() => void review(evaluation.id, "deferred")}
                  type="button"
                >
                  <Pause aria-hidden="true" className="size-3" />
                  Defer
                </button>
                <button
                  className="inline-flex min-h-8 items-center gap-1.5 rounded border border-relay-border px-2.5 text-xs text-relay-muted hover:border-relay-negative/50 hover:text-relay-negative disabled:opacity-50"
                  disabled={activeId !== null}
                  onClick={() => void review(evaluation.id, "rejected")}
                  type="button"
                >
                  <X aria-hidden="true" className="size-3" />
                  Reject
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="py-6 text-sm leading-6 text-relay-subtle">
          No thesis changes are waiting for review.
        </p>
      )}
    </section>
  );
}
