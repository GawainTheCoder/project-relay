import { ExternalLink, PanelRight, Quote } from "lucide-react";

import type { IntelligenceUpdate } from "../../../shared/contracts";
import { formatDate, getLayerName } from "../../lib/format";
import {
  MaterialityBadge,
  SentimentBadge,
} from "../../components/ui/StatusBadge";

interface UpdateAnalysisProps {
  onCitationSelect: (claimId: string) => void;
  onOpenInspector: () => void;
  update: IntelligenceUpdate;
}

function AnalysisSection({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  return (
    <section className="border-b border-relay-border py-6 last:border-b-0">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <div className="mt-3 text-[15px] leading-7 text-relay-text/90">
        {children}
      </div>
    </section>
  );
}

export function UpdateAnalysis({
  onCitationSelect,
  onOpenInspector,
  update,
}: UpdateAnalysisProps) {
  return (
    <article className="relay-scrollbar min-h-0 overflow-y-auto">
      <header className="border-b border-relay-border px-5 py-6 sm:px-7 lg:px-8">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-relay-accent">
            {update.publisher}
          </span>
          <span className="text-relay-border-strong">·</span>
          <time
            className="font-mono text-[10px] uppercase tracking-[0.06em] text-relay-muted"
            dateTime={update.publishedAt}
          >
            {formatDate(update.publishedAt, {
              month: "short",
              day: "numeric",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </time>
          {update.sourceUrl ? (
            <a
              aria-label="Open original source"
              className="ml-auto rounded p-1.5 text-relay-muted hover:bg-relay-surface-2 hover:text-relay-accent"
              href={update.sourceUrl}
              rel="noreferrer"
              target="_blank"
            >
              <ExternalLink aria-hidden="true" className="size-4" />
            </a>
          ) : null}
          <button
            aria-label="Open thesis and evidence inspector"
            className="rounded p-1.5 text-relay-muted hover:bg-relay-surface-2 hover:text-relay-accent xl:hidden"
            onClick={onOpenInspector}
            type="button"
          >
            <PanelRight aria-hidden="true" className="size-4" />
          </button>
        </div>
        <h1 className="mt-4 max-w-3xl text-2xl font-semibold leading-tight tracking-[-0.02em]">
          {update.title}
        </h1>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <MaterialityBadge materiality={update.materiality} />
          <SentimentBadge sentiment={update.sentiment} />
          {update.layerIds.map((layerId) => (
            <span
              className="font-mono text-[10px] uppercase tracking-[0.08em] text-relay-muted"
              key={layerId}
            >
              {getLayerName(layerId)}
            </span>
          ))}
        </div>
        {update.companyTickers.length ? (
          <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.08em] text-relay-subtle">
            Affected: {update.companyTickers.join(", ")}
          </p>
        ) : null}
      </header>

      <div className="mx-auto max-w-3xl px-5 sm:px-7 lg:px-8">
        <AnalysisSection title="What happened">
          <p>{update.whatHappened}</p>
        </AnalysisSection>

        <AnalysisSection title="Why it matters">
          <p>{update.whyItMatters}</p>
        </AnalysisSection>

        <AnalysisSection title="Who benefits">
          {update.beneficiaries.length ? (
            <ul className="space-y-2">
              {update.beneficiaries.map((beneficiary) => (
                <li className="flex gap-3" key={beneficiary}>
                  <span className="mt-[11px] size-1 shrink-0 rounded-full bg-relay-positive" />
                  <span>{beneficiary}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-relay-muted">No clear beneficiary identified.</p>
          )}
        </AnalysisSection>

        <AnalysisSection title="Who is threatened">
          {update.threatened.length ? (
            <ul className="space-y-2">
              {update.threatened.map((threat) => (
                <li className="flex gap-3" key={threat}>
                  <span className="mt-[11px] size-1 shrink-0 rounded-full bg-relay-negative" />
                  <span>{threat}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-relay-muted">No direct threat identified.</p>
          )}
        </AnalysisSection>

        <AnalysisSection title="What to watch next">
          {update.watchNext.length ? (
            <ul className="space-y-2">
              {update.watchNext.map((item) => (
                <li className="flex gap-3" key={item}>
                  <span className="mt-[11px] size-1 shrink-0 rounded-full bg-relay-accent" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-relay-muted">
              No follow-up metric has been assigned.
            </p>
          )}
        </AnalysisSection>

        <AnalysisSection title="Source evidence">
          {update.claims.length ? (
            <ol className="space-y-3">
              {update.claims.map((claim, index) => (
                <li key={claim.id}>
                  <button
                    className="group flex w-full items-start gap-3 rounded-md border border-relay-border bg-relay-surface px-3 py-3 text-left transition-colors hover:border-relay-accent/60"
                    onClick={() => onCitationSelect(claim.id)}
                    type="button"
                  >
                    <span className="shrink-0 font-mono text-[10px] text-relay-accent">
                      [{index + 1}]
                    </span>
                    <span>
                      <span className="block text-sm leading-6 text-relay-text">
                        “{claim.quote}”
                      </span>
                      <span className="mt-1 block font-mono text-[9px] uppercase tracking-[0.06em] text-relay-subtle">
                        {claim.locator}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-relay-muted">
              No exact source quotes are attached.
            </p>
          )}
        </AnalysisSection>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-relay-border px-5 py-3 font-mono text-[9px] uppercase tracking-[0.08em] text-relay-subtle sm:px-7 lg:px-8">
        <span>Model: {update.model ?? "Seed example"}</span>
        <span className="inline-flex items-center gap-1.5 text-relay-muted">
          <Quote aria-hidden="true" className="size-3" />
          {update.claims.length} source{" "}
          {update.claims.length === 1 ? "quote" : "quotes"} attached
        </span>
      </footer>
    </article>
  );
}
