import { LoaderCircle, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import type { ImpactReviewInput } from "../../shared/contracts";
import { PageError, PageLoading } from "../components/ui/AsyncState";
import { Button } from "../components/ui/Button";
import { useDashboard } from "../context/useDashboard";
import { UpdateAnalysis } from "../features/updates/UpdateAnalysis";
import {
  UpdateList,
  type UpdateFilter,
} from "../features/updates/UpdateList";
import { ThesisDecisionPanel } from "../features/updates/ThesisDecisionPanel";
import { isThesisChangingSignal } from "../lib/signals";
import {
  removeSignal,
  requeueSignalThesisEvaluation,
} from "../lib/api";

interface ReevaluationFeedback {
  updateId: string;
  state: "queuing" | "queued" | "error";
  message: string | null;
}

export function UpdatesPage() {
  const { data, error, isLoading, reload, reviewThesisImpact } = useDashboard();
  const [searchParams, setSearchParams] = useSearchParams();
  const [filter, setFilter] = useState<UpdateFilter>("material");
  const [query, setQuery] = useState("");
  const [isInspectorOpen, setIsInspectorOpen] = useState(false);
  const [selectedClaimId, setSelectedClaimId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [reevaluation, setReevaluation] =
    useState<ReevaluationFeedback | null>(null);
  const macroThesisTitles = useMemo(
    () =>
      Object.fromEntries(
        (data?.sourceCoverage ?? []).map((coverage) => [
          coverage.thesisId,
          coverage.thesisTitle,
        ]),
      ),
    [data?.sourceCoverage],
  );

  const filteredUpdates = useMemo(() => {
    if (!data) {
      return [];
    }
    const normalizedQuery = query.trim().toLowerCase();
    return data.updates.filter((update) => {
      const changesThesis = isThesisChangingSignal(update);
      if (filter === "material" && !changesThesis) {
        return false;
      }
      if (filter === "filtered" && changesThesis) {
        return false;
      }
      if (
        normalizedQuery &&
        ![
          update.title,
          update.publisher,
          update.companyTickers.join(" "),
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery)
      ) {
        return false;
      }
      return true;
    });
  }, [data, filter, query]);

  const selectedId = searchParams.get("update") ?? filteredUpdates[0]?.id ?? null;
  const selectedUpdate =
    filteredUpdates.find((update) => update.id === selectedId) ??
    filteredUpdates[0] ??
    null;

  const selectUpdate = useCallback(
    (updateId: string) => {
      setSearchParams({ update: updateId });
      setSelectedClaimId(null);
      setReevaluation(null);
    },
    [setSearchParams],
  );
  const changeFilter = useCallback(
    (nextFilter: UpdateFilter) => {
      setFilter(nextFilter);
      setSearchParams({});
      setSelectedClaimId(null);
      setReevaluation(null);
    },
    [setSearchParams],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      ) {
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      if (!selectedUpdate) {
        return;
      }
      const currentIndex = filteredUpdates.findIndex(
        (update) => update.id === selectedUpdate.id,
      );
      if (event.key.toLowerCase() === "j") {
        const next = filteredUpdates[Math.min(currentIndex + 1, filteredUpdates.length - 1)];
        if (next) {
          event.preventDefault();
          selectUpdate(next.id);
        }
      }
      if (event.key.toLowerCase() === "k") {
        const previous = filteredUpdates[Math.max(currentIndex - 1, 0)];
        if (previous) {
          event.preventDefault();
          selectUpdate(previous.id);
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [filteredUpdates, selectUpdate, selectedUpdate]);

  if (isLoading) {
    return <PageLoading label="Loading evidence ledger" />;
  }
  if (error || !data) {
    return (
      <PageError
        error={error ?? "Dashboard data is unavailable."}
        onRetry={() => void reload()}
      />
    );
  }

  const handleReview = async (
    impactId: string,
    input: ImpactReviewInput,
  ) => {
    await reviewThesisImpact(impactId, input);
  };

  const deleteSignal = async () => {
    if (!confirmDeleteId) {
      return;
    }
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await removeSignal(confirmDeleteId);
      setConfirmDeleteId(null);
      setSearchParams({});
      setSelectedClaimId(null);
      setIsInspectorOpen(false);
      await reload();
    } catch (caughtError) {
      setDeleteError(
        caughtError instanceof Error
          ? caughtError.message
          : "The signal could not be deleted.",
      );
    } finally {
      setIsDeleting(false);
    }
  };

  const queueReevaluation = async () => {
    if (!selectedUpdate) {
      return;
    }
    const updateId = selectedUpdate.id;
    setReevaluation({ updateId, state: "queuing", message: null });
    try {
      const result = await requeueSignalThesisEvaluation(updateId);
      const replaced =
        result.invalidatedEvaluationIds.length > 0
          ? ` ${result.invalidatedEvaluationIds.length} older unreviewed proposal${
              result.invalidatedEvaluationIds.length === 1 ? " was" : "s were"
            } superseded.`
          : "";
      const routing = result.routesClassified
        ? result.macroRouteCount > 0
          ? ` Relay classified ${result.macroRouteCount} relevant macro route${
              result.macroRouteCount === 1 ? "" : "s"
            } from the stored evidence.`
          : " Relay classified the stored evidence against active macro theses and found no relevant macro route."
        : result.macroRouteCount > 0
          ? ` ${result.macroRouteCount} existing macro route${
              result.macroRouteCount === 1 ? " is" : "s are"
            } ready for evaluation.`
          : " The stored evidence was already classified and has no relevant macro route.";
      setReevaluation({
        updateId,
        state: "queued",
        message: `Queued. Run Evaluate theses to generate new proposals; Relay will not accept them automatically.${routing}${replaced}`,
      });
      await reload();
    } catch (caughtError) {
      setReevaluation({
        updateId,
        state: "error",
        message:
          caughtError instanceof Error
            ? caughtError.message
            : "The signal could not be queued for thesis re-evaluation.",
      });
    }
  };

  const selectedReevaluation =
    reevaluation?.updateId === selectedUpdate?.id ? reevaluation : null;

  return (
    <div className="min-h-[calc(100dvh-3.5rem)] md:h-[calc(100vh-5.5rem)] md:min-h-[680px] lg:h-[calc(100vh-2rem)]">
      <div className="grid h-full min-h-0 md:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[300px_minmax(444px,1fr)_340px]">
        <div className="hidden min-h-0 md:block">
          <UpdateList
            filter={filter}
            onFilterChange={changeFilter}
            onQueryChange={setQuery}
            onSelect={selectUpdate}
            query={query}
            selectedId={selectedUpdate?.id ?? null}
            updates={filteredUpdates}
          />
        </div>

        <main className="min-h-0 min-w-0">
          <div className="h-[260px] border-b border-relay-border md:hidden">
            <UpdateList
              filter={filter}
              onFilterChange={changeFilter}
              onQueryChange={setQuery}
              onSelect={selectUpdate}
              query={query}
              selectedId={selectedUpdate?.id ?? null}
              updates={filteredUpdates}
            />
          </div>
          {selectedUpdate ? (
            <div className="h-[calc(100%-260px)] md:h-full">
              <UpdateAnalysis
                onCitationSelect={(claimId) => {
                  setSelectedClaimId(claimId);
                  setIsInspectorOpen(true);
                }}
                onDeleteRequest={() => {
                  setDeleteError(null);
                  setConfirmDeleteId(selectedUpdate.id);
                }}
                onOpenInspector={() => setIsInspectorOpen(true)}
                onReevaluationRequest={() => void queueReevaluation()}
                reevaluationMessage={selectedReevaluation?.message ?? null}
                reevaluationState={selectedReevaluation?.state ?? "idle"}
                update={selectedUpdate}
              />
            </div>
          ) : (
            <div className="grid h-full place-items-center px-6 text-center">
              <div>
                <h1 className="text-lg font-semibold">No evidence found</h1>
                <p className="mt-2 text-sm text-relay-muted">
                  Change the view or import source material from Sources.
                </p>
              </div>
            </div>
          )}
        </main>

        {selectedUpdate ? (
          <div className="hidden min-h-0 xl:block">
            <ThesisDecisionPanel
              macroThesisTitles={macroThesisTitles}
              onReview={handleReview}
              selectedClaimId={selectedClaimId}
              update={selectedUpdate}
            />
          </div>
        ) : null}
      </div>

      {isInspectorOpen && selectedUpdate ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60 xl:hidden">
          <button
            aria-label="Close inspector"
            className="absolute inset-0"
            onClick={() => setIsInspectorOpen(false)}
            type="button"
          />
          <div className="relative h-full w-full max-w-[390px]">
            <ThesisDecisionPanel
              macroThesisTitles={macroThesisTitles}
              onClose={() => setIsInspectorOpen(false)}
              onReview={handleReview}
              selectedClaimId={selectedClaimId}
              update={selectedUpdate}
            />
          </div>
        </div>
      ) : null}

      {confirmDeleteId && selectedUpdate ? (
        <div
          aria-labelledby="delete-signal-title"
          aria-modal="true"
          className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target && !isDeleting) {
              setConfirmDeleteId(null);
              setDeleteError(null);
            }
          }}
          role="dialog"
        >
          <section className="w-full max-w-md rounded-lg border border-relay-border-strong bg-relay-surface shadow-2xl shadow-black/60">
            <div className="p-5">
              <h2
                className="text-lg font-semibold tracking-tight"
                id="delete-signal-title"
              >
                Delete this signal?
              </h2>
              <p className="mt-2 text-sm leading-6 text-relay-muted">
                This removes its claims, unaccepted evaluations, and any brief
                generated from it. Relay will refuse if an accepted thesis
                change still depends on this signal.
              </p>
              <p className="mt-3 text-sm font-medium text-relay-text">
                {selectedUpdate.title}
              </p>
              {deleteError ? (
                <p
                  className="mt-4 rounded-md border border-relay-negative/35 bg-relay-negative/8 px-3 py-2.5 text-xs leading-5 text-relay-negative"
                  role="alert"
                >
                  {deleteError}
                </p>
              ) : null}
            </div>
            <footer className="flex items-center justify-end gap-2 border-t border-relay-border px-5 py-4">
              <Button
                disabled={isDeleting}
                onClick={() => {
                  setConfirmDeleteId(null);
                  setDeleteError(null);
                }}
                variant="quiet"
              >
                Cancel
              </Button>
              <Button
                disabled={isDeleting}
                onClick={() => void deleteSignal()}
                variant="danger"
              >
                {isDeleting ? (
                  <LoaderCircle
                    aria-hidden="true"
                    className="size-3.5 animate-spin"
                  />
                ) : (
                  <Trash2 aria-hidden="true" className="size-3.5" />
                )}
                {isDeleting ? "Deleting" : "Delete signal"}
              </Button>
            </footer>
          </section>
        </div>
      ) : null}
    </div>
  );
}
