import { ArrowRight, Quote } from "lucide-react";
import { Link } from "react-router-dom";

import type { IntelligenceUpdate } from "../../../shared/contracts";
import { formatDate } from "../../lib/format";

export function RecentEvidenceList({
  updates,
}: {
  updates: IntelligenceUpdate[];
}) {
  const recent = updates.slice(0, 3);

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-relay-border pb-4">
        <div>
          <p className="flex items-center gap-2 text-xs font-medium text-relay-muted">
            <Quote aria-hidden="true" className="size-4" />
            Source-backed changes
          </p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight">
            Recent evidence
          </h2>
        </div>
        <Link
          className="inline-flex min-h-11 items-center gap-2 rounded-md px-2 text-sm text-relay-muted hover:text-relay-accent"
          to="/signals"
        >
          Evidence library
          <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
      </div>

      {recent.length ? (
        <ol className="divide-y divide-relay-border">
          {recent.map((update) => (
            <li key={update.id}>
              <Link
                className="group grid gap-3 py-5 sm:grid-cols-[140px_minmax(0,1fr)_auto] sm:items-start"
                to={`/signals?update=${encodeURIComponent(update.id)}`}
              >
                <div className="text-xs text-relay-muted">
                  <p className="font-medium text-relay-text">
                    {update.publisher}
                  </p>
                  <time className="mt-1 block" dateTime={update.publishedAt}>
                    {formatDate(update.publishedAt, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </time>
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold leading-6 group-hover:text-relay-accent">
                    {update.title}
                  </h3>
                  <p className="mt-1 line-clamp-2 text-sm leading-6 text-relay-muted">
                    {update.whatHappened}
                  </p>
                  {update.companyTickers.length ? (
                    <p className="mt-2 text-xs text-relay-subtle">
                      {update.companyTickers.slice(0, 5).join(" · ")}
                    </p>
                  ) : null}
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
        <div className="py-10 text-center">
          <h3 className="text-sm font-semibold">No evidence yet</h3>
          <p className="mt-2 text-sm leading-6 text-relay-muted">
            Add a source-backed signal when something changes your thesis.
          </p>
        </div>
      )}
    </section>
  );
}
