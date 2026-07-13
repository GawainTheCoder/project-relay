import { GitMerge, Info } from "lucide-react";
import { Link } from "react-router-dom";

import type { PortfolioReadModel } from "../../../shared/contracts";

export function ExposureOverlapPanel({
  portfolio,
}: {
  portfolio: PortfolioReadModel | null;
}) {
  const itemLabels = new Map(
    (portfolio?.items ?? []).map((item) => [
      item.id,
      item.symbol ?? item.name,
    ]),
  );
  const overlap =
    portfolio?.overlaps.find((item) => {
      const left = itemLabels.get(item.leftPortfolioItemId) ?? "";
      const right = itemLabels.get(item.rightPortfolioItemId) ?? "";
      const symbols = new Set([left.toUpperCase(), right.toUpperCase()]);
      return symbols.has("SMH") && symbols.has("TSM");
    }) ?? portfolio?.overlaps[0];

  if (!overlap) {
    return null;
  }

  const leftLabel =
    itemLabels.get(overlap.leftPortfolioItemId) ?? overlap.leftPortfolioItemName;
  const rightLabel =
    itemLabels.get(overlap.rightPortfolioItemId) ?? overlap.rightPortfolioItemName;

  return (
    <section className="rounded-xl border border-relay-accent/30 bg-relay-accent/5 p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg border border-relay-accent/30 bg-relay-accent/10 text-relay-accent">
          <GitMerge aria-hidden="true" className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-medium text-relay-accent">
            Overlapping exposure
          </p>
          <h2 className="mt-2 text-lg font-semibold tracking-tight">
            {leftLabel} and {rightLabel} depend on the same assumptions
          </h2>
          <p className="mt-2 text-sm leading-6 text-relay-muted">
            Keep fund look-through separate from direct ownership so the same
            issuer is not counted twice.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {overlap.sharedTheses.map((thesis) => (
              <Link
                className="inline-flex min-h-9 items-center rounded-md border border-relay-control bg-relay-surface px-3 text-xs text-relay-text hover:border-relay-accent hover:text-relay-accent"
                key={thesis.thesisId}
                to={`/theses/${encodeURIComponent(thesis.thesisId)}`}
              >
                {thesis.thesisTitle}
              </Link>
            ))}
          </div>
          <p className="mt-4 flex items-start gap-2 text-xs leading-5 text-relay-muted">
            <Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
            Shared thesis exposure signals dependency overlap, not a price-risk
            score.
          </p>
        </div>
      </div>
    </section>
  );
}
