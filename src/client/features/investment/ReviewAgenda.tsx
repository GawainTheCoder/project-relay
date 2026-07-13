import { ArrowRight, CalendarClock, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";

import type { ReviewsReadModel } from "../../../shared/contracts";
import { ThesisMomentumBadge } from "../../components/ui/ThesisMomentumBadge";
import { Button } from "../../components/ui/Button";
import type { BeliefSummary } from "../../lib/api";
import { formatDate } from "../../lib/format";

export function ReviewAgenda({
  beliefs,
  error,
  isLoading,
  onRetry,
  reviews,
}: {
  beliefs: BeliefSummary[];
  error: string | null;
  isLoading: boolean;
  onRetry: () => void;
  reviews: ReviewsReadModel | null;
}) {
  const actionable = (reviews?.actionable ?? []).slice(0, 3);
  const nextScheduled = beliefs
    .filter((belief) => belief.nextReviewOn)
    .sort((left, right) =>
      (left.nextReviewOn ?? "").localeCompare(right.nextReviewOn ?? ""),
    )[0];

  return (
    <section className="rounded-xl border border-relay-border bg-relay-deep p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-xs font-medium text-relay-muted">
            <CalendarClock aria-hidden="true" className="size-4" />
            Decision discipline
          </p>
          <h2 className="mt-2 text-lg font-semibold tracking-tight">
            Upcoming reviews
          </h2>
        </div>
        <Link
          aria-label="Open all reviews"
          className="grid size-11 place-items-center rounded-md text-relay-muted hover:bg-relay-surface hover:text-relay-accent"
          to="/reviews"
        >
          <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
      </div>

      {isLoading && !reviews ? (
        <div aria-busy="true" className="mt-5 space-y-3">
          {[0, 1].map((item) => (
            <div
              className="h-20 animate-pulse rounded-lg bg-relay-surface"
              key={item}
            />
          ))}
        </div>
      ) : error && !reviews ? (
        <div className="mt-5 rounded-md border border-relay-negative/30 bg-relay-negative/5 px-3 py-3">
          <p className="text-sm leading-6 text-relay-negative">
            Reviews could not be loaded. {error}
          </p>
          <Button className="mt-3" onClick={onRetry}>
            <RefreshCw aria-hidden="true" className="size-4" />
            Retry reviews
          </Button>
        </div>
      ) : actionable.length ? (
        <ol className="mt-5 divide-y divide-relay-border border-y border-relay-border">
          {actionable.map((review) => (
            <li key={review.evaluation.id}>
              <Link
                className="group block py-4"
                to={`/reviews?review=${encodeURIComponent(review.evaluation.id)}`}
              >
                <ThesisMomentumBadge momentum={review.momentum} />
                {review.evaluation.reviewStatus === "deferred" ? (
                  <span className="ml-2 text-xs text-relay-warning">
                    Deferred
                  </span>
                ) : null}
                <h3 className="mt-3 text-sm font-semibold leading-5 group-hover:text-relay-accent">
                  {review.thesisTitle}
                </h3>
                <p className="mt-2 line-clamp-2 text-xs leading-5 text-relay-muted">
                  {review.evaluation.summary}
                </p>
              </Link>
            </li>
          ))}
        </ol>
      ) : (
        <div className="mt-5 border-y border-relay-border py-6">
          <h3 className="text-sm font-semibold">No reviews due</h3>
          <p className="mt-2 text-sm leading-6 text-relay-muted">
            {nextScheduled?.nextReviewOn
              ? `${nextScheduled.title} is next on ${formatDate(nextScheduled.nextReviewOn, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}.`
              : "A review will appear after material evidence is evaluated."}
          </p>
        </div>
      )}
    </section>
  );
}
