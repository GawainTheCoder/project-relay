import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  ChevronLeft,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import type { DailyBrief } from "../../shared/contracts";
import {
  EmptyState,
  PageError,
  PageLoading,
} from "../components/ui/AsyncState";
import { listBriefs } from "../lib/api";
import { formatDate, formatRelativeTime } from "../lib/format";

export function BriefsPage() {
  const [briefs, setBriefs] = useState<DailyBrief[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadBriefs = useCallback(async (signal?: AbortSignal) => {
    setError(null);
    try {
      setBriefs(await listBriefs(50, signal));
    } catch (caughtError) {
      if (
        caughtError instanceof DOMException &&
        caughtError.name === "AbortError"
      ) {
        return;
      }
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Relay could not load prior briefs.",
      );
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void loadBriefs(controller.signal);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [loadBriefs]);

  if (!briefs && !error) {
    return <PageLoading label="Loading brief history" />;
  }
  if (error) {
    return <PageError error={error} onRetry={() => void loadBriefs()} />;
  }

  return (
    <div className="relay-enter min-h-screen">
      <header className="border-b border-relay-border px-5 py-5 sm:px-8 lg:px-10">
        <div className="mx-auto flex max-w-[1100px] flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-relay-muted">
              Daily synthesis archive
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              Prior briefs
            </h1>
          </div>
          <Link
            className="inline-flex items-center gap-1.5 text-sm text-relay-muted hover:text-relay-accent"
            to="/"
          >
            <ChevronLeft aria-hidden="true" className="size-4" />
            Today’s brief
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-[1100px] px-5 py-7 sm:px-8 lg:px-10 lg:py-10">
        {briefs?.length ? (
          <ol className="divide-y divide-relay-border border-y border-relay-border">
            {briefs.map((brief) => (
              <li key={brief.id}>
                <Link
                  className="group grid gap-4 py-6 sm:grid-cols-[150px_minmax(0,1fr)_auto] sm:items-start"
                  to={`/briefs/${encodeURIComponent(brief.id)}`}
                >
                  <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.08em] text-relay-subtle">
                    <CalendarDays aria-hidden="true" className="size-3.5" />
                    {formatDate(brief.date, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-base font-semibold tracking-tight group-hover:text-relay-accent">
                      {brief.title}
                    </h2>
                    <p className="mt-2 line-clamp-2 text-sm leading-6 text-relay-muted">
                      {brief.signal}
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[9px] uppercase tracking-[0.08em] text-relay-subtle">
                      <span>
                        {brief.updateIds.length} source signal
                        {brief.updateIds.length === 1 ? "" : "s"}
                      </span>
                      <span>Generated {formatRelativeTime(brief.generatedAt)}</span>
                      <span>{brief.model ?? "Local conclusion"}</span>
                    </div>
                  </div>
                  <ArrowRight
                    aria-hidden="true"
                    className="size-4 text-relay-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-relay-accent"
                  />
                </Link>
              </li>
            ))}
          </ol>
        ) : (
          <EmptyState
            body="Generate a daily brief after Relay identifies thesis-changing signals. Each generated brief will remain available here."
            title="No prior briefs yet"
          />
        )}

        <section className="mt-10 border-l border-relay-border-strong pl-5">
          <BookOpen aria-hidden="true" className="size-4 text-relay-subtle" />
          <h2 className="mt-3 text-sm font-semibold">
            A durable decision record
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-relay-muted">
            Briefs preserve what Relay considered material on each day,
            including the underlying signals and evidence available at
            generation time.
          </p>
        </section>
      </main>
    </div>
  );
}
