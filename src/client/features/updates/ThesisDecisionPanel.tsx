import {
  ArrowDownRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  LoaderCircle,
  X,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import type {
  IntelligenceUpdate,
  ReviewDecision,
} from "../../../shared/contracts";
import { EvidencePanel } from "../../components/EvidencePanel";
import { Button } from "../../components/ui/Button";
import { sentimentColor, titleCase } from "../../lib/format";

interface ThesisDecisionPanelProps {
  onClose?: () => void;
  onDecide: (
    decision: Exclude<ReviewDecision, "proposed">,
  ) => Promise<void>;
  selectedClaimId: string | null;
  update: IntelligenceUpdate;
}

export function ThesisDecisionPanel({
  onClose,
  onDecide,
  selectedClaimId,
  update,
}: ThesisDecisionPanelProps) {
  const [isWorking, setIsWorking] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const decision = update.thesisImpacts[0]?.decision ?? "proposed";

  const decide = async (
    nextDecision: Exclude<ReviewDecision, "proposed">,
  ) => {
    setIsWorking(true);
    setActionError(null);
    try {
      await onDecide(nextDecision);
    } catch (caughtError) {
      setActionError(
        caughtError instanceof Error
          ? caughtError.message
          : "The decision could not be saved.",
      );
    } finally {
      setIsWorking(false);
    }
  };

  return (
    <aside className="relay-scrollbar flex h-full min-h-0 flex-col overflow-y-auto border-l border-relay-border bg-relay-deep">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-relay-border px-5">
        <div>
          <h2 className="text-sm font-semibold">Proposed thesis change</h2>
          <p className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-relay-muted">
            Human review required
          </p>
        </div>
        {onClose ? (
          <button
            aria-label="Close inspector"
            className="rounded p-1.5 text-relay-muted hover:bg-relay-surface-2 hover:text-relay-text"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        ) : (
          <ChevronDown aria-hidden="true" className="size-4 text-relay-subtle" />
        )}
      </div>

      <section className="border-b border-relay-border p-5">
        {update.thesisImpacts.length ? (
          <div className="space-y-3">
            {update.thesisImpacts.map((impact) => {
              const positive = impact.direction === "bullish";
              const DirectionIcon = positive ? ArrowUpRight : ArrowDownRight;
              return (
                <div
                  className="rounded-md border border-relay-border bg-relay-surface p-3"
                  key={impact.id}
                >
                  <div className="flex items-center justify-between gap-3">
                    <Link
                      className="font-mono text-xs font-semibold hover:text-relay-accent"
                      to={`/companies/${impact.companyTicker}`}
                    >
                      {impact.companyTicker}
                    </Link>
                    <span
                      className={`inline-flex items-center gap-1 text-xs font-medium ${sentimentColor(impact.direction)}`}
                    >
                      <DirectionIcon aria-hidden="true" className="size-3.5" />
                      {titleCase(impact.direction)}
                    </span>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-relay-muted">
                    {impact.summary}
                  </p>
                  <dl className="mt-3 grid grid-cols-2 gap-2 font-mono text-[9px] uppercase tracking-[0.06em] text-relay-subtle">
                    <div>
                      <dt>Confidence</dt>
                      <dd className="mt-0.5 text-relay-muted">
                        {impact.confidence}
                      </dd>
                    </div>
                    <div>
                      <dt>Horizon</dt>
                      <dd className="mt-0.5 text-relay-muted">
                        {impact.horizon}
                      </dd>
                    </div>
                  </dl>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm leading-6 text-relay-muted">
            Relay found no thesis impact in this update.
          </p>
        )}
      </section>

      <div className="min-h-[260px] flex-1">
        <EvidencePanel
          claims={update.claims}
          selectedClaimId={selectedClaimId}
          updates={[update]}
        />
      </div>

      {update.thesisImpacts.length ? (
        <section className="sticky bottom-0 border-t border-relay-border bg-relay-deep p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Your decision</h2>
            {decision !== "proposed" ? (
              <span className="inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.08em] text-relay-positive">
                <Check aria-hidden="true" className="size-3" />
                {decision}
              </span>
            ) : null}
          </div>
          {actionError ? (
            <p className="mb-3 text-xs leading-5 text-relay-negative">
              {actionError}
            </p>
          ) : null}
          <div className="grid gap-2">
            <Button
              className="w-full bg-relay-warning text-relay-deep hover:bg-[#ffd36f]"
              disabled={isWorking}
              onClick={() => void decide("accepted")}
              variant="secondary"
            >
              {isWorking ? (
                <LoaderCircle
                  aria-hidden="true"
                  className="size-3.5 animate-spin"
                />
              ) : (
                <Check aria-hidden="true" className="size-3.5" />
              )}
              Accept change
              <kbd className="ml-auto font-mono text-[10px]">A</kbd>
            </Button>
            <Button
              className="w-full"
              disabled={isWorking}
              onClick={() => void decide("rejected")}
            >
              No thesis change
              <kbd className="ml-auto font-mono text-[10px] text-relay-subtle">
                N
              </kbd>
            </Button>
          </div>
        </section>
      ) : null}
    </aside>
  );
}
