import { History } from "lucide-react";

import type { BeliefVersion } from "../../lib/api";
import { formatDate } from "../../lib/format";

export function VersionTimeline({ versions }: { versions: BeliefVersion[] }) {
  const ordered = versions.toSorted((left, right) => right.version - left.version);

  return (
    <section className="mt-10">
      <div className="flex items-center justify-between border-b border-relay-border pb-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <History aria-hidden="true" className="size-4 text-relay-accent" />
            Version history
          </h2>
          <p className="mt-1 text-xs text-relay-muted">
            An auditable record of accepted thesis changes.
          </p>
        </div>
        <span className="font-mono text-[10px] text-relay-subtle">
          {ordered.length} versions
        </span>
      </div>
      {ordered.length ? (
        <ol className="mt-2">
          {ordered.map((version, index) => (
            <li
              className="relative grid gap-3 py-4 pl-7 sm:grid-cols-[110px_minmax(0,1fr)_90px]"
              key={version.id}
            >
              {index < ordered.length - 1 ? (
                <span className="absolute bottom-0 left-[7px] top-7 w-px bg-relay-border-strong" />
              ) : null}
              <span
                className={`absolute left-1 top-[21px] size-[7px] rounded-full ring-2 ring-relay-bg ${
                  index === 0 ? "bg-relay-positive" : "bg-relay-subtle"
                }`}
              />
              <time
                className="font-mono text-[9px] uppercase tracking-[0.05em] text-relay-subtle"
                dateTime={version.createdAt}
              >
                {formatDate(version.createdAt, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </time>
              <div>
                <p className="font-mono text-[10px] text-relay-muted">
                  v{version.version}{" "}
                  {index === 0 ? (
                    <span className="ml-2 text-relay-positive">Current</span>
                  ) : null}
                </p>
                <p className="mt-1 text-xs leading-5 text-relay-text/90">
                  {version.rationale ?? version.statement}
                </p>
              </div>
              <span className="font-mono text-[9px] text-relay-muted sm:text-right">
                {Math.round(version.confidence)}/100
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="py-6 text-sm text-relay-subtle">
          Version history begins with the first accepted update.
        </p>
      )}
    </section>
  );
}
