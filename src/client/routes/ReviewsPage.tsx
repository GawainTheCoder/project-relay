import { BookCheck, History, Inbox } from "lucide-react";
import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";

import { PageError, PageLoading } from "../components/ui/AsyncState";
import { useDashboard } from "../context/useDashboard";
import { ReviewDetailPanel } from "../features/investment/ReviewDetailPanel";
import { ReviewList } from "../features/investment/ReviewList";
import { useInvestmentWorkspace } from "../features/investment/useInvestmentWorkspace";

type ReviewView = "queue" | "history";

function viewFromParameters(value: string | null): ReviewView {
  return value === "history" ? "history" : "queue";
}

export function ReviewsPage() {
  const dashboard = useDashboard();
  const investment = useInvestmentWorkspace();
  const [searchParams, setSearchParams] = useSearchParams();
  const view = viewFromParameters(searchParams.get("view"));
  const visibleReviews =
    view === "queue"
      ? (investment.reviews?.actionable ?? [])
      : (investment.reviews?.history ?? []);
  const requestedId = searchParams.get("review");
  const requestedReviewIsVisible = visibleReviews.some(
    (review) => review.evaluation.id === requestedId,
  );
  const selectedId = requestedReviewIsVisible
    ? requestedId
    : (visibleReviews[0]?.evaluation.id ?? null);
  const selectedReview = useMemo(
    () =>
      investment.reviews?.reviews.find(
        (review) => review.evaluation.id === selectedId,
      ) ?? null,
    [investment.reviews?.reviews, selectedId],
  );

  if (investment.isLoading && !investment.reviews) {
    return <PageLoading label="Loading review workspace" />;
  }
  if (investment.errors.reviews && !investment.reviews) {
    return (
      <PageError
        error={investment.errors.reviews}
        onRetry={() => void investment.reload()}
      />
    );
  }

  const selectView = (nextView: ReviewView) => {
    const nextReviews =
      nextView === "queue"
        ? (investment.reviews?.actionable ?? [])
        : (investment.reviews?.history ?? []);
    const next = new URLSearchParams();
    if (nextView === "history") {
      next.set("view", "history");
    }
    const firstReview = nextReviews[0];
    if (firstReview) {
      next.set("review", firstReview.evaluation.id);
    }
    setSearchParams(next);
  };
  const selectReview = (reviewId: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("review", reviewId);
    setSearchParams(next);
  };
  const onCompleted = async (
    decision: "accepted" | "deferred" | "rejected",
  ) => {
    await Promise.all([investment.reload(), dashboard.reload()]);
    const next = new URLSearchParams();
    if (decision !== "deferred") {
      next.set("view", "history");
    }
    if (selectedId) {
      next.set("review", selectedId);
    }
    setSearchParams(next);
  };

  return (
    <div className="relay-enter min-h-screen">
      <header className="border-b border-relay-border px-5 py-7 sm:px-8 lg:px-10">
        <div className="mx-auto max-w-[1360px]">
          <p className="flex items-center gap-2 text-xs font-medium text-relay-accent">
            <BookCheck aria-hidden="true" className="size-4" />
            Decision journal
          </p>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-5">
            <div>
              <h1 className="text-3xl font-semibold tracking-[-0.025em] sm:text-4xl">
                Reviews
              </h1>
              <p className="mt-3 max-w-2xl text-base leading-7 text-relay-muted">
                Record what changed, how the thesis moved, what to do in each
                holding, and when to review it again.
              </p>
            </div>
            <dl className="flex items-center gap-6 rounded-xl border border-relay-border bg-relay-deep px-5 py-4">
              <div>
                <dt className="text-xs text-relay-muted">Needs review</dt>
                <dd className="mt-1 text-xl font-semibold text-relay-accent">
                  {investment.reviews?.actionable.length ?? 0}
                </dd>
              </div>
              <div className="border-l border-relay-border pl-6">
                <dt className="text-xs text-relay-muted">Recorded</dt>
                <dd className="mt-1 text-xl font-semibold">
                  {investment.reviews?.history.length ?? 0}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1360px] px-5 py-7 sm:px-8 lg:px-10">
        <div
          aria-label="Review views"
          className="mb-5 flex gap-2 border-b border-relay-border pb-4"
          role="group"
        >
          <button
            aria-pressed={view === "queue"}
            className={`inline-flex min-h-11 items-center gap-2 rounded-md border px-3.5 text-sm font-medium transition-colors ${
              view === "queue"
                ? "border-relay-accent bg-relay-accent/10 text-relay-accent"
                : "border-relay-control text-relay-muted hover:text-relay-text"
            }`}
            onClick={() => selectView("queue")}
            type="button"
          >
            <Inbox aria-hidden="true" className="size-4" />
            Needs review
          </button>
          <button
            aria-pressed={view === "history"}
            className={`inline-flex min-h-11 items-center gap-2 rounded-md border px-3.5 text-sm font-medium transition-colors ${
              view === "history"
                ? "border-relay-accent bg-relay-accent/10 text-relay-accent"
                : "border-relay-control text-relay-muted hover:text-relay-text"
            }`}
            onClick={() => selectView("history")}
            type="button"
          >
            <History aria-hidden="true" className="size-4" />
            Decision history
          </button>
        </div>

        <div
          className="overflow-hidden rounded-xl border border-relay-border bg-relay-surface lg:grid lg:grid-cols-[340px_minmax(0,1fr)]"
        >
          <aside className="border-b border-relay-border lg:border-b-0 lg:border-r">
            <div className="border-b border-relay-border px-5 py-4">
              <h2
                className="text-sm font-semibold"
                id={view === "queue" ? "review-queue-title" : "review-history-title"}
              >
                {view === "queue" ? "Review queue" : "Decision journal"}
              </h2>
              <p className="mt-1 text-xs leading-5 text-relay-muted">
                {view === "queue"
                  ? "Material proposals awaiting your judgment."
                  : "Accepted and rejected decisions."}
              </p>
            </div>
            <ReviewList
              emptyDescription={
                view === "queue"
                  ? "A proposal appears after material evidence is evaluated against a thesis."
                  : "Accepted and rejected reviews will appear here with their portfolio decisions."
              }
              emptyTitle={
                view === "queue"
                  ? "No thesis reviews due"
                  : "No decisions recorded"
              }
              onSelect={selectReview}
              reviews={visibleReviews}
              selectedId={selectedId}
            />
          </aside>

          <ReviewDetailPanel
            evidenceError={dashboard.data ? null : dashboard.error}
            isEvidenceLoading={dashboard.isLoading && !dashboard.data}
            key={
              selectedReview
                ? `${selectedReview.evaluation.id}:${selectedReview.evaluation.reviewStatus}:${selectedReview.evaluation.reviewedAt ?? "open"}`
                : "empty-review"
            }
            onCompleted={onCompleted}
            onEvidenceRetry={() => void dashboard.reload()}
            review={selectedReview}
            updates={dashboard.data?.updates ?? []}
          />
        </div>
      </main>
    </div>
  );
}
