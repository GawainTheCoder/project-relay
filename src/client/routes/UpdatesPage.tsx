import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import type { ReviewDecision } from "../../shared/contracts";
import { PageError, PageLoading } from "../components/ui/AsyncState";
import { useDashboard } from "../context/useDashboard";
import { UpdateAnalysis } from "../features/updates/UpdateAnalysis";
import {
  UpdateList,
  type UpdateFilter,
} from "../features/updates/UpdateList";
import { ThesisDecisionPanel } from "../features/updates/ThesisDecisionPanel";

export function UpdatesPage() {
  const { data, decideImpact, error, isLoading, reload } = useDashboard();
  const [searchParams, setSearchParams] = useSearchParams();
  const [filter, setFilter] = useState<UpdateFilter>("all");
  const [query, setQuery] = useState("");
  const [isInspectorOpen, setIsInspectorOpen] = useState(false);
  const [selectedClaimId, setSelectedClaimId] = useState<string | null>(null);

  const filteredUpdates = useMemo(() => {
    if (!data) {
      return [];
    }
    const watchlist = new Set(data.companies.map((company) => company.ticker));
    const normalizedQuery = query.trim().toLowerCase();
    return data.updates.filter((update) => {
      if (
        filter === "material" &&
        !["high", "medium"].includes(update.materiality)
      ) {
        return false;
      }
      if (
        filter === "watchlist" &&
        !update.companyTickers.some((ticker) => watchlist.has(ticker))
      ) {
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
    data?.updates.find((update) => update.id === selectedId) ??
    filteredUpdates[0] ??
    null;

  const selectUpdate = useCallback(
    (updateId: string) => {
      setSearchParams({ update: updateId });
      setSelectedClaimId(null);
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
      if (event.key.toLowerCase() === "a") {
        event.preventDefault();
        void decideImpact(selectedUpdate.id, "accepted");
      }
      if (event.key.toLowerCase() === "n") {
        event.preventDefault();
        void decideImpact(selectedUpdate.id, "rejected");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [decideImpact, filteredUpdates, selectUpdate, selectedUpdate]);

  if (isLoading) {
    return <PageLoading label="Loading research console" />;
  }
  if (error || !data) {
    return (
      <PageError
        error={error ?? "Dashboard data is unavailable."}
        onRetry={() => void reload()}
      />
    );
  }

  const handleDecide = async (
    decision: Exclude<ReviewDecision, "proposed">,
  ) => {
    if (!selectedUpdate) {
      return;
    }
    await decideImpact(selectedUpdate.id, decision);
  };

  return (
    <div className="h-[calc(100vh-5.5rem)] min-h-[680px] lg:h-[calc(100vh-2rem)]">
      <div className="grid h-full min-h-0 md:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[300px_minmax(460px,1fr)_340px]">
        <div className="hidden min-h-0 md:block">
          <UpdateList
            filter={filter}
            onFilterChange={setFilter}
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
              onFilterChange={setFilter}
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
                onOpenInspector={() => setIsInspectorOpen(true)}
                update={selectedUpdate}
              />
            </div>
          ) : (
            <div className="grid h-full place-items-center px-6 text-center">
              <div>
                <h1 className="text-lg font-semibold">No updates found</h1>
                <p className="mt-2 text-sm text-relay-muted">
                  Change the filter or import a new source.
                </p>
              </div>
            </div>
          )}
        </main>

        {selectedUpdate ? (
          <div className="hidden min-h-0 xl:block">
            <ThesisDecisionPanel
              onDecide={handleDecide}
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
              onClose={() => setIsInspectorOpen(false)}
              onDecide={handleDecide}
              selectedClaimId={selectedClaimId}
              update={selectedUpdate}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
