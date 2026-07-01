import {
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  Gauge,
  XCircle,
} from "lucide-react";
import { Link } from "react-router-dom";

import type { Company } from "../../../shared/contracts";
import { getLayerName, titleCase } from "../../lib/format";
import { companyThesisPath } from "../../lib/thesisRoutes";

export function ThesisCard({ company }: { company: Company }) {
  return (
    <Link
      aria-label={`Open ${company.ticker} thesis`}
      className="group block h-full bg-relay-surface transition-colors hover:bg-relay-surface-2"
      to={companyThesisPath(company.ticker)}
    >
      <article>
        <header className="border-b border-relay-border p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-baseline gap-2">
                <h2 className="font-mono text-xl font-semibold">
                  {company.ticker}
                </h2>
                <span className="text-xs text-relay-muted">{company.name}</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {company.layerIds.map((layerId) => (
                  <span
                    className="font-mono text-[9px] uppercase tracking-[0.08em] text-relay-accent"
                    key={layerId}
                  >
                    {getLayerName(layerId)}
                  </span>
                ))}
              </div>
            </div>
            <span className="inline-flex items-center gap-1 rounded border border-relay-border px-2 py-1 font-mono text-[9px] uppercase tracking-[0.08em] text-relay-muted">
              <Gauge aria-hidden="true" className="size-3" />
              {titleCase(company.confidence)}
            </span>
          </div>
          <p className="mt-5 text-base font-medium leading-7">
            {company.thesis}
          </p>
        </header>

        <div className="divide-y divide-relay-border px-5">
          <section className="py-5">
            <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.06em] text-relay-positive">
              <ArrowUpRight aria-hidden="true" className="size-3.5" />
              What proves it right
            </h3>
            <ul className="mt-3 space-y-2">
              {company.provesRight.slice(0, 3).map((item) => (
                <li
                  className="flex gap-2.5 text-xs leading-5 text-relay-muted"
                  key={item}
                >
                  <CheckCircle2
                    aria-hidden="true"
                    className="mt-0.5 size-3.5 shrink-0 text-relay-positive/75"
                  />
                  {item}
                </li>
              ))}
            </ul>
          </section>

          <section className="py-5">
            <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.06em] text-relay-negative">
              <ArrowDownRight aria-hidden="true" className="size-3.5" />
              What breaks it
            </h3>
            <ul className="mt-3 space-y-2">
              {company.breaksThesis.slice(0, 3).map((item) => (
                <li
                  className="flex gap-2.5 text-xs leading-5 text-relay-muted"
                  key={item}
                >
                  <XCircle
                    aria-hidden="true"
                    className="mt-0.5 size-3.5 shrink-0 text-relay-negative/75"
                  />
                  {item}
                </li>
              ))}
            </ul>
          </section>
        </div>
      </article>
    </Link>
  );
}
