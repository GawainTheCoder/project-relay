import { ArrowRight, Quote } from "lucide-react";
import { Link } from "react-router-dom";

import type {
  BeliefEvidence,
  BeliefEvidenceStance,
} from "../../lib/api";
import { formatDate } from "../../lib/format";

function EvidenceGroup({
  evidence,
  label,
  stance,
}: {
  evidence: BeliefEvidence[];
  label: string;
  stance: BeliefEvidenceStance;
}) {
  const tone =
    stance === "supports"
      ? "text-relay-positive"
      : stance === "opposes"
        ? "text-relay-negative"
        : "text-relay-accent";

  return (
    <section>
      <div className="flex items-center justify-between border-b border-relay-border pb-3">
        <h2 className="font-mono text-[10px] uppercase tracking-[0.1em] text-relay-muted">
          {label}
        </h2>
        <span className="font-mono text-[9px] text-relay-subtle">
          {evidence.length}
        </span>
      </div>
      {evidence.length ? (
        <ol className="divide-y divide-relay-border">
          {evidence.slice(0, 6).map((item) => (
            <li className="py-4" key={item.id}>
              <blockquote className="text-xs leading-5 text-relay-text/90">
                “{item.quote}”
              </blockquote>
              <div className="mt-3 flex items-end justify-between gap-3">
                <div className="min-w-0 text-[10px] leading-4 text-relay-muted">
                  <p className="truncate">{item.publisher}</p>
                  <time
                    className="font-mono text-[9px] text-relay-subtle"
                    dateTime={item.publishedAt}
                  >
                    {formatDate(item.publishedAt, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </time>
                </div>
                <span
                  className={`shrink-0 font-mono text-[9px] uppercase tracking-[0.06em] ${tone}`}
                >
                  {stance}
                </span>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="py-6 text-xs leading-5 text-relay-subtle">
          No {label.toLowerCase()} is linked yet.
        </p>
      )}
    </section>
  );
}

export function EvidenceRail({
  contextual,
  opposing,
  supporting,
}: {
  contextual: BeliefEvidence[];
  opposing: BeliefEvidence[];
  supporting: BeliefEvidence[];
}) {
  return (
    <aside className="border-t border-relay-border bg-relay-deep px-5 py-7 sm:px-8 xl:border-l xl:border-t-0 xl:px-6 xl:py-8">
      <div className="mb-7 flex items-center gap-2">
        <Quote aria-hidden="true" className="size-4 text-relay-accent" />
        <p className="text-xs font-medium">Evidence ledger</p>
      </div>
      <div className="space-y-8">
        <EvidenceGroup
          evidence={supporting}
          label="Supporting evidence"
          stance="supports"
        />
        <EvidenceGroup
          evidence={opposing}
          label="Opposing evidence"
          stance="opposes"
        />
        {contextual.length ? (
          <EvidenceGroup
            evidence={contextual}
            label="Contextual evidence"
            stance="context"
          />
        ) : null}
      </div>
      <Link
        className="mt-7 inline-flex items-center gap-2 text-xs text-relay-accent hover:text-white"
        to="/signals"
      >
        View all evidence
        <ArrowRight aria-hidden="true" className="size-3.5" />
      </Link>
    </aside>
  );
}
