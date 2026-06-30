import {
  ArrowRight,
  Building2,
  CircleDot,
  Network,
} from "lucide-react";
import { Link } from "react-router-dom";

import type { LayerId } from "../../../shared/contracts";
import type { BeliefSummary } from "../../lib/api";
import { formatDate, getLayerName } from "../../lib/format";
import { ConfidenceMeter } from "./ConfidenceMeter";

export function BeliefCard({ belief }: { belief: BeliefSummary }) {
  const Icon = belief.kind === "macro" ? Network : Building2;

  return (
    <Link
      aria-label={`Open thesis: ${belief.title}`}
      className="group grid gap-5 border-b border-relay-border px-2 py-6 transition-colors hover:bg-relay-surface focus-visible:bg-relay-surface sm:grid-cols-[minmax(0,1fr)_170px] sm:px-4"
      to={`/theses/${encodeURIComponent(belief.id)}`}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2.5">
          <Icon
            aria-hidden="true"
            className="size-3.5 text-relay-accent"
          />
          <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-relay-muted">
            {belief.kind} thesis
          </span>
          {belief.layerIds.slice(0, 3).map((layerId) => (
            <span
              className="font-mono text-[9px] uppercase tracking-[0.08em] text-relay-subtle"
              key={layerId}
            >
              {getLayerName(layerId as LayerId)}
            </span>
          ))}
        </div>
        <h2 className="mt-3 text-base font-semibold tracking-tight group-hover:text-relay-accent">
          {belief.title}
        </h2>
        <p className="mt-2 line-clamp-2 max-w-3xl text-sm leading-6 text-relay-muted">
          {belief.statement}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-[9px] uppercase tracking-[0.06em] text-relay-subtle">
          <span className="inline-flex items-center gap-1.5">
            <CircleDot aria-hidden="true" className="size-3 text-relay-positive" />
            {belief.supportingEvidenceCount} supporting
          </span>
          <span>{belief.opposingEvidenceCount} opposing</span>
          {belief.pendingEvaluationCount ? (
            <span className="text-relay-warning">
              {belief.pendingEvaluationCount} pending review
            </span>
          ) : null}
          <time dateTime={belief.updatedAt}>
            Updated{" "}
            {formatDate(belief.updatedAt, {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </time>
        </div>
      </div>
      <div className="flex items-center gap-5 sm:border-l sm:border-relay-border sm:pl-6">
        <ConfidenceMeter compact confidence={belief.confidence} />
        <ArrowRight
          aria-hidden="true"
          className="size-4 shrink-0 text-relay-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-relay-accent"
        />
      </div>
    </Link>
  );
}
