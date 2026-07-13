import { ArrowRight, Building2, Gauge, Network } from "lucide-react";

import type { PortfolioReadModel } from "../../../shared/contracts";
import type { BeliefDetail } from "../../lib/api";

function EmptyStep({ children }: { children: string }) {
  return <p className="mt-3 text-sm leading-6 text-relay-subtle">{children}</p>;
}

export function ThesisInvestmentChain({
  belief,
  portfolio,
}: {
  belief: BeliefDetail;
  portfolio: PortfolioReadModel | null;
}) {
  const portfolioById = new Map(
    (portfolio?.items ?? []).map((item) => [item.id, item]),
  );

  return (
    <section aria-labelledby="investment-chain-title" className="mt-10">
      <div className="border-b border-relay-border pb-3">
        <p className="text-xs font-medium text-relay-accent">Investment chain</p>
        <h2
          className="mt-2 text-lg font-semibold tracking-tight"
          id="investment-chain-title"
        >
          Macro thesis → bottleneck → company capture → evidence → portfolio
          decision
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-relay-muted">
          Keep the macro claim separate from who can capture it and where the
          portfolio is relying on it.
        </p>
      </div>

      <ol className="mt-5 grid gap-3 lg:grid-cols-3">
        <li className="relative rounded-lg border border-relay-border bg-relay-deep p-4">
          <ArrowRight
            aria-hidden="true"
            className="absolute -right-[20px] top-6 z-10 hidden size-4 text-relay-subtle lg:block"
          />
          <p className="flex items-center gap-2 text-xs font-medium text-relay-muted">
            <Network aria-hidden="true" className="size-4 text-relay-accent" />
            1 · Bottlenecks
          </p>
          {belief.bottlenecks.length ? (
            <ul className="mt-3 space-y-3">
              {belief.bottlenecks.map((bottleneck) => (
                <li key={bottleneck.key}>
                  <h3 className="text-sm font-semibold">{bottleneck.title}</h3>
                  <p className="mt-1 text-xs leading-5 text-relay-muted">
                    {bottleneck.description}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyStep>No explicit bottleneck has been mapped yet.</EmptyStep>
          )}
        </li>

        <li className="relative rounded-lg border border-relay-border bg-relay-deep p-4">
          <ArrowRight
            aria-hidden="true"
            className="absolute -right-[20px] top-6 z-10 hidden size-4 text-relay-subtle lg:block"
          />
          <p className="flex items-center gap-2 text-xs font-medium text-relay-muted">
            <Building2 aria-hidden="true" className="size-4 text-relay-accent" />
            2 · Company capture
          </p>
          {belief.captureMechanisms.length ? (
            <ul className="mt-3 space-y-3">
              {belief.captureMechanisms.map((capture) => (
                <li key={capture.key}>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold">
                      {capture.companyTicker}
                    </h3>
                    <span className="text-xs capitalize text-relay-subtle">
                      {capture.role}
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-relay-muted">
                    {capture.mechanism}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyStep>No company capture mechanism is linked yet.</EmptyStep>
          )}
        </li>

        <li className="rounded-lg border border-relay-border bg-relay-deep p-4">
          <p className="flex items-center gap-2 text-xs font-medium text-relay-muted">
            <Gauge aria-hidden="true" className="size-4 text-relay-accent" />
            3 · Portfolio exposure
          </p>
          {belief.portfolioExposures.length ? (
            <ul className="mt-3 space-y-3">
              {belief.portfolioExposures.map((exposure) => {
                const item = portfolioById.get(exposure.portfolioItemId);
                return (
                  <li key={`${exposure.portfolioItemId}:${exposure.thesisId}`}>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold">
                        {item?.symbol ?? item?.name ?? exposure.portfolioItemId}
                      </h3>
                      <span className="text-xs capitalize text-relay-subtle">
                        {exposure.exposureType}
                      </span>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-relay-muted">
                      {exposure.captureMechanism}
                    </p>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyStep>No holding or watchlist exposure is linked yet.</EmptyStep>
          )}
        </li>
      </ol>
    </section>
  );
}
