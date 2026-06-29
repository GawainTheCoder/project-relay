import {
  ArrowRight,
  ArrowDownRight,
  ArrowUpRight,
  Building2,
  CircleMinus,
  ExternalLink,
  Layers3,
  Minus,
  X,
} from "lucide-react";
import { Link } from "react-router-dom";

import type {
  Company,
  IntelligenceUpdate,
  StackLayer,
} from "../../../shared/contracts";
import {
  formatDate,
  sentimentColor,
  titleCase,
} from "../../lib/format";

interface StackInspectorProps {
  company: Company | null;
  layer: StackLayer;
  onClose?: () => void;
  updates: IntelligenceUpdate[];
}

export function StackInspector({
  company,
  layer,
  onClose,
  updates,
}: StackInspectorProps) {
  const recentEvidence = updates
    .filter(
      (update) =>
        update.layerIds.includes(layer.id) &&
        (!company || update.companyTickers.includes(company.ticker)),
    )
    .slice(0, 3);
  const latestImpact = recentEvidence
    .flatMap((update) => update.thesisImpacts)
    .find((impact) => !company || impact.companyTicker === company.ticker);
  const DirectionIcon =
    latestImpact?.direction === "bullish"
      ? ArrowUpRight
      : latestImpact?.direction === "bearish"
        ? ArrowDownRight
        : latestImpact?.direction === "neutral"
          ? Minus
          : CircleMinus;

  return (
    <aside className="relay-scrollbar h-full overflow-y-auto border-l border-relay-border bg-relay-surface">
      <div className="flex items-center justify-between border-b border-relay-border px-5 py-5">
        <div className="flex items-center gap-3">
          <div className="grid size-8 place-items-center rounded border border-relay-border bg-relay-surface-2 text-relay-accent">
            {company ? (
              <Building2 aria-hidden="true" className="size-4" />
            ) : (
              <Layers3 aria-hidden="true" className="size-4" />
            )}
          </div>
          <div>
            <h2 className="font-mono text-base font-semibold">
              {company?.ticker ?? layer.name}
            </h2>
            <p className="mt-0.5 text-[10px] uppercase tracking-[0.08em] text-relay-muted">
              {company?.name ?? "Infrastructure layer"}
            </p>
          </div>
        </div>
        {onClose ? (
          <button
            aria-label="Close inspector"
            className="rounded p-1.5 text-relay-muted hover:bg-relay-raised hover:text-relay-text"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        ) : null}
      </div>

      <div className="divide-y divide-relay-border px-5">
        <section className="py-5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold">
              {company ? "Thesis impact" : "Layer role"}
            </h3>
            {latestImpact ? (
              <span
                className={`inline-flex items-center gap-1 text-xs font-medium ${sentimentColor(latestImpact.direction)}`}
              >
                <DirectionIcon aria-hidden="true" className="size-3.5" />
                {titleCase(latestImpact.direction)}
              </span>
            ) : null}
          </div>
          <p className="mt-3 text-sm leading-6 text-relay-muted">
            {company?.thesis ?? layer.description}
          </p>
        </section>

        {company ? (
          <section className="py-5">
            <h3 className="text-sm font-semibold">Why it matters</h3>
            <p className="mt-3 text-sm leading-6 text-relay-muted">
              {company.whyItMatters}
            </p>
          </section>
        ) : null}

        <section className="py-5">
          <h3 className="text-sm font-semibold">Recent evidence</h3>
          {recentEvidence.length ? (
            <div className="mt-3 space-y-3">
              {recentEvidence.map((update) => (
                <Link
                  className="group block rounded-md border border-relay-border bg-relay-surface-2 p-3 transition-colors hover:border-relay-border-strong"
                  key={update.id}
                  to={`/signals?update=${encodeURIComponent(update.id)}`}
                >
                  <p className="text-xs font-medium leading-5">
                    {update.title}
                  </p>
                  <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.06em] text-relay-subtle">
                    {formatDate(update.publishedAt)} · {update.publisher}
                  </p>
                  <p className="mt-2 line-clamp-2 text-xs leading-5 text-relay-muted">
                    {update.whatHappened}
                  </p>
                  <span className="mt-3 inline-flex items-center gap-1 text-[11px] font-medium text-relay-accent group-hover:text-white">
                    Inspect evidence
                    <ArrowRight aria-hidden="true" className="size-3" />
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm leading-6 text-relay-muted">
              No recent evidence is linked to this selection.
            </p>
          )}
        </section>
      </div>

      {company ? (
        <div className="border-t border-relay-border p-5">
          <Link
            className="inline-flex items-center gap-2 text-sm font-medium text-relay-accent hover:text-white"
            to={`/theses/${company.ticker}`}
          >
            View company thesis
            <ExternalLink aria-hidden="true" className="size-3.5" />
          </Link>
        </div>
      ) : null}
    </aside>
  );
}
