import { Search } from "lucide-react";

import type { IntelligenceUpdate } from "../../../shared/contracts";
import { formatDate, getLayerName } from "../../lib/format";
import { MaterialityBadge } from "../../components/ui/StatusBadge";

export type UpdateFilter = "material" | "filtered";

interface UpdateListProps {
  filter: UpdateFilter;
  onFilterChange: (filter: UpdateFilter) => void;
  onQueryChange: (query: string) => void;
  onSelect: (updateId: string) => void;
  query: string;
  selectedId: string | null;
  updates: IntelligenceUpdate[];
}

const filters: { id: UpdateFilter; label: string }[] = [
  { id: "material", label: "Thesis-relevant" },
  { id: "filtered", label: "No thesis impact" },
];

function dayGroup(publishedAt: string) {
  const date = new Date(publishedAt);
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startDate = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  );
  const difference = Math.round(
    (startToday.getTime() - startDate.getTime()) / 86_400_000,
  );
  if (difference <= 0) {
    return "Today";
  }
  if (difference === 1) {
    return "Yesterday";
  }
  return "Earlier";
}

export function UpdateList({
  filter,
  onFilterChange,
  onQueryChange,
  onSelect,
  query,
  selectedId,
  updates,
}: UpdateListProps) {
  const groups = ["Today", "Yesterday", "Earlier"].map((label) => ({
    label,
    updates: updates.filter((update) => dayGroup(update.publishedAt) === label),
  }));

  return (
    <aside className="flex h-full min-h-0 flex-col border-r border-relay-border bg-relay-deep">
      <div className="border-b border-relay-border px-4 pb-3 pt-5">
        <h1 className="text-xl font-semibold tracking-tight">Signals</h1>
        <p className="mt-1 text-[11px] leading-4 text-relay-muted">
          Sources are monitored inputs; signals are source-backed evidence
          Relay evaluates against your theses.
        </p>
        <div className="mt-4 flex items-center gap-1" role="tablist">
          {filters.map((candidate) => (
            <button
              aria-selected={filter === candidate.id}
              className={`rounded px-2.5 py-1.5 text-xs font-medium transition-colors ${
                filter === candidate.id
                  ? candidate.id === "material"
                    ? "bg-relay-warning/12 text-relay-warning"
                    : "bg-relay-surface-2 text-relay-muted"
                  : "text-relay-muted hover:bg-relay-surface hover:text-relay-text"
              }`}
              key={candidate.id}
              onClick={() => onFilterChange(candidate.id)}
              role="tab"
              type="button"
            >
              {candidate.label}
            </button>
          ))}
        </div>
      </div>

      <label className="flex h-11 items-center gap-2 border-b border-relay-border px-4">
        <Search aria-hidden="true" className="size-3.5 text-relay-subtle" />
        <span className="sr-only">Filter evidence</span>
        <input
          className="min-w-0 flex-1 bg-transparent text-xs text-relay-text placeholder:text-relay-subtle"
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Filter evidence"
          value={query}
        />
      </label>

      <div className="relay-scrollbar min-h-0 flex-1 overflow-y-auto">
        {updates.length ? (
          groups.map((group) =>
            group.updates.length ? (
              <section key={group.label}>
                <div className="sticky top-0 z-10 flex items-center justify-between border-b border-relay-border bg-relay-deep/95 px-4 py-2.5 backdrop-blur">
                  <h2 className="font-mono text-[10px] uppercase tracking-[0.1em] text-relay-muted">
                    {group.label}
                  </h2>
                  <span className="font-mono text-[10px] text-relay-subtle">
                    {group.updates.length}
                  </span>
                </div>
                <div className="divide-y divide-relay-border">
                  {group.updates.map((update) => (
                    <button
                      aria-current={
                        selectedId === update.id ? "true" : undefined
                      }
                      className={`relative block w-full px-4 py-4 text-left transition-colors ${
                        selectedId === update.id
                          ? "bg-relay-warning/7"
                          : "hover:bg-relay-surface"
                      }`}
                      key={update.id}
                      onClick={() => onSelect(update.id)}
                      type="button"
                    >
                      {selectedId === update.id ? (
                        <span className="absolute inset-y-0 left-0 w-0.5 bg-relay-warning" />
                      ) : null}
                      <div className="flex items-start justify-between gap-3">
                        <p className="line-clamp-2 text-[13px] font-medium leading-5 text-relay-text">
                          {update.title}
                        </p>
                        <time
                          className="shrink-0 font-mono text-[9px] text-relay-subtle"
                          dateTime={update.publishedAt}
                        >
                          {formatDate(update.publishedAt, {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </time>
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <MaterialityBadge materiality={update.materiality} />
                        <span className="truncate text-[11px] text-relay-muted">
                          {update.publisher}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-2 gap-y-1 font-mono text-[9px] uppercase tracking-[0.05em] text-relay-subtle">
                        {update.companyTickers.slice(0, 4).map((ticker) => (
                          <span key={ticker}>{ticker}</span>
                        ))}
                        {update.layerIds.slice(0, 1).map((layerId) => (
                          <span className="text-relay-accent/80" key={layerId}>
                            {getLayerName(layerId)}
                          </span>
                        ))}
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            ) : null,
          )
        ) : (
          <div className="px-5 py-12 text-center">
            <p className="text-sm text-relay-muted">
              No evidence matches this view.
            </p>
          </div>
        )}
      </div>
      <div className="border-t border-relay-border px-4 py-2.5 font-mono text-[9px] uppercase tracking-[0.08em] text-relay-subtle">
        {updates.length} records · J/K navigate
      </div>
    </aside>
  );
}
