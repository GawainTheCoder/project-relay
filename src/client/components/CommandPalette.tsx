import { Building2, FileText, Layers3, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useDashboard } from "../context/useDashboard";
import { getLayerName } from "../lib/format";

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

type SearchResult = {
  description: string;
  href: string;
  icon: typeof Search;
  key: string;
  label: string;
};

export function CommandPalette({
  isOpen,
  onClose,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { data } = useDashboard();

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [isOpen]);

  const results = useMemo(() => {
    if (!data) {
      return [];
    }
    const entries: SearchResult[] = [
      ...data.companies.map((company) => ({
        key: `company-${company.ticker}`,
        label: `${company.ticker} · ${company.name}`,
        description: company.thesis,
        href: `/companies/${company.ticker}`,
        icon: Building2,
      })),
      ...data.updates.map((update) => ({
        key: `update-${update.id}`,
        label: update.title,
        description: `${update.publisher} · ${update.companyTickers.join(", ")}`,
        href: `/updates?update=${encodeURIComponent(update.id)}`,
        icon: FileText,
      })),
      ...data.layers.map((layer) => ({
        key: `layer-${layer.id}`,
        label: getLayerName(layer.id),
        description: layer.description,
        href: `/stack?layer=${encodeURIComponent(layer.id)}`,
        icon: Layers3,
      })),
    ];
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return entries.slice(0, 8);
    }
    return entries
      .filter(
        (entry) =>
          entry.label.toLowerCase().includes(normalized) ||
          entry.description.toLowerCase().includes(normalized),
      )
      .slice(0, 10);
  }, [data, query]);

  if (!isOpen) {
    return null;
  }

  const choose = (href: string) => {
    navigate(href);
    onClose();
  };

  return (
    <div
      aria-label="Search Relay"
      aria-modal="true"
      className="fixed inset-0 z-50 bg-black/70 px-4 pt-[12vh]"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) {
          onClose();
        }
      }}
      role="dialog"
    >
      <div className="mx-auto w-full max-w-2xl overflow-hidden rounded-lg border border-relay-border-strong bg-relay-surface shadow-2xl shadow-black/50">
        <div className="flex items-center gap-3 border-b border-relay-border px-4">
          <Search
            aria-hidden="true"
            className="size-4 shrink-0 text-relay-muted"
          />
          <input
            className="h-14 min-w-0 flex-1 bg-transparent text-sm text-relay-text placeholder:text-relay-subtle"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                onClose();
              }
              if (event.key === "Enter" && results[0]) {
                choose(results[0].href);
              }
            }}
            placeholder="Search companies, updates, and stack layers"
            ref={inputRef}
            value={query}
          />
          <button
            aria-label="Close search"
            className="rounded p-1.5 text-relay-muted transition-colors hover:bg-relay-raised hover:text-relay-text"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        </div>
        <div className="relay-scrollbar max-h-[55vh] overflow-y-auto p-2">
          {results.length ? (
            results.map((result) => {
              const Icon = result.icon;
              return (
                <button
                  className="group flex w-full items-start gap-3 rounded-md px-3 py-3 text-left transition-colors hover:bg-relay-raised"
                  key={result.key}
                  onClick={() => choose(result.href)}
                  type="button"
                >
                  <Icon
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0 text-relay-subtle group-hover:text-relay-accent"
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-relay-text">
                      {result.label}
                    </span>
                    <span className="mt-1 block truncate text-xs text-relay-muted">
                      {result.description}
                    </span>
                  </span>
                </button>
              );
            })
          ) : (
            <p className="px-3 py-10 text-center text-sm text-relay-muted">
              No matching intelligence.
            </p>
          )}
        </div>
        <div className="flex items-center justify-between border-t border-relay-border px-4 py-2 font-mono text-[10px] uppercase tracking-[0.08em] text-relay-subtle">
          <span>Enter to open</span>
          <span>Esc to close</span>
        </div>
      </div>
    </div>
  );
}
