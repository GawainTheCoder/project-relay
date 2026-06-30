import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  ChevronLeft,
  Quote,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import type { DailyBrief } from "../../shared/contracts";
import { PageError, PageLoading } from "../components/ui/AsyncState";
import { useDashboard } from "../context/useDashboard";
import { getBrief } from "../lib/api";
import { getSecondarySignalUpdate } from "../lib/briefs";
import { formatDate, formatRelativeTime, getLayerName } from "../lib/format";

export function BriefDetailPage() {
  const { briefId = "" } = useParams<{ briefId: string }>();
  const { data } = useDashboard();
  const [brief, setBrief] = useState<DailyBrief | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadBrief = useCallback(
    async (signal?: AbortSignal) => {
      setError(null);
      try {
        setBrief(await getBrief(briefId, signal));
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
            : "Relay could not load this brief.",
        );
      }
    },
    [briefId],
  );

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void loadBrief(controller.signal);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [loadBrief]);

  const updates = useMemo(
    () =>
      brief && data
        ? brief.updateIds.flatMap((updateId) => {
            const update = data.updates.find(
              (candidate) => candidate.id === updateId,
            );
            return update ? [update] : [];
          })
        : [],
    [brief, data],
  );

  const claims = useMemo(() => {
    if (!brief || !data) {
      return [];
    }
    const claimIds = new Set(brief.citationClaimIds);
    return data.updates
      .flatMap((update) =>
        update.claims.map((claim) => ({ claim, update })),
      )
      .filter(({ claim }) => claimIds.has(claim.id));
  }, [brief, data]);

  if (!brief && !error) {
    return <PageLoading label="Loading brief" />;
  }
  if (error || !brief) {
    return (
      <PageError
        error={error ?? "The requested brief is unavailable."}
        onRetry={() => void loadBrief()}
      />
    );
  }

  const primaryUpdate = updates[0];

  return (
    <div className="relay-enter min-h-screen">
      <header className="border-b border-relay-border px-5 py-5 sm:px-8 lg:px-10">
        <div className="mx-auto flex max-w-[1100px] flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-relay-muted">
              <CalendarDays aria-hidden="true" className="size-3.5" />
              {formatDate(brief.date, {
                weekday: "long",
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </div>
            <p className="mt-2 text-xs text-relay-subtle">
              Generated {formatRelativeTime(brief.generatedAt)}
              {brief.model ? ` · ${brief.model}` : ""}
            </p>
          </div>
          <Link
            className="inline-flex items-center gap-1.5 text-sm text-relay-muted hover:text-relay-accent"
            to="/briefs"
          >
            <ChevronLeft aria-hidden="true" className="size-4" />
            All briefs
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-[1100px] px-5 py-8 sm:px-8 lg:px-10 lg:py-12">
        <article className="max-w-4xl">
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-relay-accent">
            <span className="size-1.5 rounded-full bg-relay-accent" />
            Daily conclusion
          </div>
          <h1 className="mt-4 max-w-3xl text-3xl font-semibold leading-[1.15] tracking-[-0.025em] sm:text-4xl">
            {brief.title}
          </h1>
          <p className="mt-5 max-w-3xl text-base leading-8 text-relay-muted sm:text-lg">
            {brief.signal}
          </p>

          <section className="mt-8 border-y border-relay-border py-7">
            <div className="flex items-start gap-4">
              <BookOpen
                aria-hidden="true"
                className="mt-1 size-5 shrink-0 text-relay-subtle"
              />
              <div>
                <h2 className="text-sm font-semibold">Analyst synthesis</h2>
                <p className="mt-3 max-w-3xl text-[15px] leading-7 text-relay-text/90">
                  {brief.summary}
                </p>
              </div>
            </div>
          </section>

          {primaryUpdate ? (
            <Link
              className="group mt-7 flex items-center justify-between gap-5 rounded-md border border-relay-border bg-relay-surface px-5 py-4 transition-colors hover:border-relay-border-strong hover:bg-relay-surface-2"
              to={`/signals?update=${encodeURIComponent(primaryUpdate.id)}`}
            >
              <div className="min-w-0">
                <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-relay-muted">
                  Primary underlying signal
                </span>
                <p className="mt-1 truncate text-sm font-medium">
                  {primaryUpdate.title}
                </p>
              </div>
              <ArrowRight
                aria-hidden="true"
                className="size-4 shrink-0 text-relay-accent transition-transform group-hover:translate-x-0.5"
              />
            </Link>
          ) : null}

          {brief.secondarySignals.length ? (
            <section className="mt-11">
              <div className="border-b border-relay-border pb-3">
                <h2 className="text-lg font-semibold tracking-tight">
                  Secondary signals
                </h2>
              </div>
              <ol className="divide-y divide-relay-border">
                {brief.secondarySignals.map((signal, index) => {
                  const relatedUpdate = data
                    ? getSecondarySignalUpdate(
                        brief,
                        data.updates,
                        signal,
                        index,
                      )
                    : null;
                  return (
                    <li
                      className="grid grid-cols-[32px_1fr_auto] items-start gap-3 py-5"
                      key={signal}
                    >
                      <span className="font-mono text-xs text-relay-subtle">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <div>
                        <p className="text-sm leading-6">{signal}</p>
                        {relatedUpdate ? (
                          <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.08em] text-relay-subtle">
                            {relatedUpdate.layerIds
                              .map((layerId) => getLayerName(layerId))
                              .join(" · ")}
                          </p>
                        ) : null}
                      </div>
                      {relatedUpdate ? (
                        <Link
                          aria-label={`Open ${relatedUpdate.title}`}
                          className="rounded p-1 text-relay-subtle hover:bg-relay-surface-2 hover:text-relay-accent"
                          to={`/signals?update=${encodeURIComponent(relatedUpdate.id)}`}
                        >
                          <ArrowRight aria-hidden="true" className="size-4" />
                        </Link>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
            </section>
          ) : null}

          <section className="mt-11">
            <div className="flex items-center justify-between border-b border-relay-border pb-3">
              <div>
                <h2 className="text-lg font-semibold tracking-tight">
                  Supporting evidence
                </h2>
                <p className="mt-1 text-sm text-relay-muted">
                  Evidence cited when this brief was generated.
                </p>
              </div>
              <Quote aria-hidden="true" className="size-4 text-relay-subtle" />
            </div>
            {claims.length ? (
              <ol className="divide-y divide-relay-border">
                {claims.map(({ claim, update }, index) => (
                  <li className="py-5" key={claim.id}>
                    <blockquote className="text-sm leading-7 text-relay-text">
                      “{claim.quote}”
                    </blockquote>
                    <Link
                      className="mt-2 inline-flex items-center gap-1.5 text-xs text-relay-muted hover:text-relay-accent"
                      to={`/signals?update=${encodeURIComponent(update.id)}`}
                    >
                      [{index + 1}] {update.publisher} · {update.title}
                      <ArrowRight aria-hidden="true" className="size-3" />
                    </Link>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="border-b border-relay-border py-7 text-sm text-relay-muted">
                This brief contains no stored evidence citations.
              </p>
            )}
          </section>
        </article>
      </main>
    </div>
  );
}
