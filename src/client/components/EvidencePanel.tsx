import { ExternalLink, Quote, X } from "lucide-react";

import type {
  EvidenceClaim,
  IntelligenceUpdate,
} from "../../shared/contracts";

interface EvidencePanelProps {
  claims: EvidenceClaim[];
  onClose?: () => void;
  selectedClaimId?: string | null;
  updates: IntelligenceUpdate[];
}

export function EvidencePanel({
  claims,
  onClose,
  selectedClaimId,
  updates,
}: EvidencePanelProps) {
  const orderedClaims = selectedClaimId
    ? [
        ...claims.filter((claim) => claim.id === selectedClaimId),
        ...claims.filter((claim) => claim.id !== selectedClaimId),
      ]
    : claims;
  const isSeed = updates.some((update) => update.model === null);

  return (
    <section
      aria-label="Source evidence"
      className="h-full border-l border-relay-border bg-relay-surface"
    >
      <div className="flex h-14 items-center justify-between border-b border-relay-border px-5">
        <div>
          <h2 className="text-sm font-semibold">Evidence</h2>
          <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-relay-muted">
            {claims.length} source {claims.length === 1 ? "quote" : "quotes"}{" "}
            attached
          </p>
        </div>
        {onClose ? (
          <button
            aria-label="Close evidence"
            className="rounded p-1.5 text-relay-muted hover:bg-relay-raised hover:text-relay-text"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        ) : null}
      </div>

      {orderedClaims.length ? (
        <ol className="relay-scrollbar divide-y divide-relay-border overflow-y-auto">
          {orderedClaims.map((claim) => {
            const sourceUpdate = updates.find((update) =>
              update.claims.some((candidate) => candidate.id === claim.id),
            );
            const citationNumber =
              claims.findIndex((candidate) => candidate.id === claim.id) + 1;
            return (
              <li
                className={`p-5 ${
                  selectedClaimId === claim.id ? "bg-relay-accent/6" : ""
                }`}
                id={`claim-${claim.id}`}
                key={claim.id}
              >
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.08em] text-relay-muted">
                    <span className="grid size-5 place-items-center rounded border border-relay-border">
                      {citationNumber}
                    </span>
                    Source claim
                  </span>
                  <Quote
                    aria-label="Source quote attached"
                    className="size-3.5 text-relay-accent"
                  />
                </div>
                <blockquote className="mt-4 border-l border-relay-accent/60 pl-3 text-sm leading-6 text-relay-text">
                  “{claim.quote}”
                </blockquote>
                <div className="mt-4 flex items-start gap-2 text-xs leading-5 text-relay-muted">
                  <Quote
                    aria-hidden="true"
                    className="mt-0.5 size-3 shrink-0"
                  />
                  <span>
                    {sourceUpdate?.publisher ?? claim.sourceId}
                    <span className="block font-mono text-[10px] text-relay-subtle">
                      {claim.locator}
                    </span>
                  </span>
                </div>
                {isSeed ? (
                  <p className="mt-3 font-mono text-[9px] uppercase tracking-[0.06em] text-relay-warning">
                    Seed example — not independently verified
                  </p>
                ) : null}
                {sourceUpdate?.sourceUrl ? (
                  <a
                    className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-relay-accent hover:text-white"
                    href={sourceUpdate.sourceUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Open source
                    <ExternalLink aria-hidden="true" className="size-3" />
                  </a>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="px-5 py-12 text-center">
          <p className="text-sm text-relay-muted">
            No evidence claims are attached yet.
          </p>
        </div>
      )}
    </section>
  );
}
