import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Radio,
} from "lucide-react";
import { Link } from "react-router-dom";

import type {
  LayerId,
  SourceCoverageStatus,
  ThesisSourceCoverage,
} from "../../../shared/contracts";
import { getLayerName } from "../../lib/format";

const statusPresentation: Record<
  SourceCoverageStatus,
  {
    label: string;
    description: string;
    className: string;
    icon: typeof CheckCircle2;
  }
> = {
  automated: {
    label: "Automated",
    description: "Strong evidence is monitored automatically",
    className:
      "border-relay-positive/35 bg-relay-positive/8 text-relay-positive",
    icon: CheckCircle2,
  },
  "manual-only": {
    label: "Manual only",
    description: "Strong evidence must be added manually",
    className: "border-relay-warning/35 bg-relay-warning/8 text-relay-warning",
    icon: CircleDashed,
  },
  missing: {
    label: "Missing",
    description: "No strong evidence stream is configured",
    className: "border-relay-negative/35 bg-relay-negative/8 text-relay-negative",
    icon: AlertTriangle,
  },
};

const summaryOrder: SourceCoverageStatus[] = [
  "automated",
  "manual-only",
  "missing",
];
const MAX_VISIBLE_STRONG_SOURCES = 5;
const MAX_VISIBLE_CONTEXT_SOURCES = 3;

export function SourceCoverageBadge({
  status,
}: {
  status: SourceCoverageStatus;
}) {
  const presentation = statusPresentation[status];
  const Icon = presentation.icon;

  return (
    <span
      aria-label={presentation.description}
      className={`inline-flex w-fit items-center gap-1.5 rounded border px-2 py-1 font-mono text-[9px] uppercase tracking-[0.08em] ${presentation.className}`}
      title={presentation.description}
    >
      <Icon aria-hidden="true" className="size-3" />
      {presentation.label}
    </span>
  );
}

function SourceNames({ coverage }: { coverage: ThesisSourceCoverage }) {
  const strongSources = coverage.sources.filter(
    (source) =>
      source.role === "primary" &&
      (source.authorityTier === "first-party" ||
        source.authorityTier === "specialist"),
  );
  const contextSources = coverage.sources.filter(
    (source) => source.role === "context",
  );
  const visibleStrongSources = strongSources.slice(
    0,
    MAX_VISIBLE_STRONG_SOURCES,
  );
  const hiddenStrongSourceCount =
    strongSources.length - visibleStrongSources.length;
  const visibleContextSources = contextSources.slice(
    0,
    MAX_VISIBLE_CONTEXT_SOURCES,
  );
  const hiddenContextSourceCount =
    contextSources.length - visibleContextSources.length;

  return (
    <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
      <div className="min-w-0">
        <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-relay-subtle">
          Strong evidence streams
        </p>
        {strongSources.length ? (
          <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Strong sources">
            {visibleStrongSources.map((source) => (
              <li
                className="inline-flex items-center gap-1.5 rounded border border-relay-border-strong bg-relay-surface-2 px-2 py-1 text-[11px] text-relay-text"
                key={source.id}
              >
                {source.automated ? (
                  <Radio
                    aria-label="Automated"
                    className="size-2.5 text-relay-positive"
                  />
                ) : null}
                {source.name}
              </li>
            ))}
            {hiddenStrongSourceCount > 0 ? (
              <li className="px-1 py-1 text-[11px] text-relay-subtle">
                +{hiddenStrongSourceCount} more
              </li>
            ) : null}
          </ul>
        ) : (
          <p className="mt-2 text-xs text-relay-negative">
            No first-party or specialist source
          </p>
        )}
      </div>

      <div className="min-w-0">
        <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-relay-subtle">
          Context
        </p>
        {contextSources.length ? (
          <p className="mt-2 text-xs leading-5 text-relay-subtle">
            {visibleContextSources.map((source) => source.name).join(", ")}
            {hiddenContextSourceCount > 0
              ? `, +${hiddenContextSourceCount} more`
              : ""}
          </p>
        ) : (
          <p className="mt-2 text-xs text-relay-subtle">None configured</p>
        )}
      </div>
    </div>
  );
}

export function SourceCoverageAudit({
  coverage,
}: {
  coverage: ThesisSourceCoverage[];
}) {
  const counts: Record<SourceCoverageStatus, number> = {
    automated: 0,
    "manual-only": 0,
    missing: 0,
  };
  for (const thesis of coverage) {
    counts[thesis.status] += 1;
  }

  return (
    <section
      aria-labelledby="macro-coverage-title"
      className="overflow-hidden rounded-md border border-relay-border bg-relay-surface"
      id="macro-thesis-coverage"
    >
      <header className="grid gap-5 border-b border-relay-border px-4 py-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end lg:px-5">
        <div>
          <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-relay-accent">
            Understanding audit
          </p>
          <h2
            className="mt-1.5 text-lg font-semibold tracking-tight"
            id="macro-coverage-title"
          >
            Macro thesis coverage
          </h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-relay-muted">
            Every macro thesis needs a first-party or specialist evidence
            stream. Context sources can inform interpretation, but do not
            satisfy coverage on their own.
          </p>
        </div>

        <dl
          aria-label="Coverage totals"
          className="grid grid-cols-3 gap-px overflow-hidden rounded border border-relay-border bg-relay-border"
        >
          {summaryOrder.map((status) => (
            <div
              className="min-w-20 bg-relay-surface-2 px-3 py-2.5 text-center sm:min-w-24"
              key={status}
            >
              <dt className="font-mono text-[8px] uppercase tracking-[0.08em] text-relay-subtle">
                {statusPresentation[status].label}
              </dt>
              <dd
                className={`mt-1 text-lg font-semibold ${
                  status === "automated"
                    ? "text-relay-positive"
                    : status === "manual-only"
                      ? "text-relay-warning"
                      : "text-relay-negative"
                }`}
              >
                {counts[status]}
              </dd>
            </div>
          ))}
        </dl>
      </header>

      {coverage.length ? (
        <ul className="divide-y divide-relay-border">
          {coverage.map((thesis) => (
            <li
              className="grid gap-4 px-4 py-4 lg:grid-cols-[minmax(180px,0.8fr)_130px_minmax(280px,1.2fr)] lg:items-start lg:px-5"
              key={thesis.thesisId}
            >
              <div className="min-w-0">
                <Link
                  className="text-sm font-medium hover:text-relay-accent"
                  to={`/theses/${encodeURIComponent(thesis.thesisId)}`}
                >
                  {thesis.thesisTitle}
                </Link>
                <div className="mt-2 flex flex-wrap gap-x-2 gap-y-1">
                  {thesis.layerIds.map((layerId) => (
                    <span
                      className="font-mono text-[9px] uppercase tracking-[0.06em] text-relay-subtle"
                      key={layerId}
                    >
                      {getLayerName(layerId as LayerId)}
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <SourceCoverageBadge status={thesis.status} />
                <p className="mt-2 text-[11px] leading-4 text-relay-subtle">
                  {thesis.strongSourceCount} strong source
                  {thesis.strongSourceCount === 1 ? "" : "s"}
                </p>
              </div>

              <SourceNames coverage={thesis} />
            </li>
          ))}
        </ul>
      ) : (
        <div className="px-5 py-8 text-center">
          <p className="text-sm text-relay-muted">
            No active macro theses are available to audit.
          </p>
        </div>
      )}
    </section>
  );
}
