import { CalendarClock, CheckCircle2 } from "lucide-react";

import type { ThesisReview } from "../../../shared/contracts";
import { ThesisMomentumBadge } from "../../components/ui/ThesisMomentumBadge";
import { formatDate } from "../../lib/format";
import { evaluationMomentum, reviewStatusLabel } from "./reviewPresentation";

export function ReviewList({
  emptyDescription,
  emptyTitle,
  onSelect,
  reviews,
  selectedId,
}: {
  emptyDescription: string;
  emptyTitle: string;
  onSelect: (reviewId: string) => void;
  reviews: ThesisReview[];
  selectedId: string | null;
}) {
  if (!reviews.length) {
    return (
      <div className="grid min-h-56 place-items-center px-5 py-8 text-center">
        <div className="max-w-xs">
          <CheckCircle2
            aria-hidden="true"
            className="mx-auto size-5 text-relay-positive"
          />
          <h2 className="mt-4 text-sm font-semibold">{emptyTitle}</h2>
          <p className="mt-2 text-sm leading-6 text-relay-muted">
            {emptyDescription}
          </p>
        </div>
      </div>
    );
  }

  return (
    <ol className="divide-y divide-relay-border">
      {reviews.map((review) => {
        const isSelected = review.evaluation.id === selectedId;
        return (
          <li key={review.evaluation.id}>
            <button
              aria-current={isSelected ? "true" : undefined}
              className={`group min-h-[132px] w-full border-l-2 px-4 py-4 text-left transition-colors sm:px-5 ${
                isSelected
                  ? "border-relay-accent bg-relay-accent/7"
                  : "border-transparent hover:bg-relay-surface"
              }`}
              onClick={() => onSelect(review.evaluation.id)}
              type="button"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <ThesisMomentumBadge
                  momentum={evaluationMomentum(review.evaluation)}
                />
                <span className="text-xs text-relay-muted">
                  {reviewStatusLabel(review.evaluation.reviewStatus)}
                </span>
              </div>
              <h3 className="mt-3 text-sm font-semibold leading-5 group-hover:text-relay-accent">
                {review.thesisTitle}
              </h3>
              <p className="mt-2 flex items-center gap-1.5 text-xs text-relay-muted">
                <CalendarClock aria-hidden="true" className="size-3.5" />
                {formatDate(review.evaluation.createdAt, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
