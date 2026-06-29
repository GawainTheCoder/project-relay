import {
  Check,
  CircleMinus,
  LoaderCircle,
  X,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import type {
  ImpactReviewInput,
  IntelligenceUpdate,
} from "../../../shared/contracts";
import { EvidencePanel } from "../../components/EvidencePanel";
import { SentimentBadge } from "../../components/ui/StatusBadge";

interface ThesisDecisionPanelProps {
  onClose?: () => void;
  onReview: (impactId: string, input: ImpactReviewInput) => Promise<void>;
  selectedClaimId: string | null;
  update: IntelligenceUpdate;
}

export function ThesisDecisionPanel({
  onClose,
  onReview,
  selectedClaimId,
  update,
}: ThesisDecisionPanelProps) {
  const [workingImpactId, setWorkingImpactId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const submitFeedback = async (
    impactId: string,
    isMaterial: boolean,
  ) => {
    setWorkingImpactId(impactId);
    setActionError(null);
    try {
      await onReview(impactId, {
        decision: isMaterial ? "accepted" : "rejected",
        reasonTags: [
          isMaterial ? "useful-analysis" : "overstated-materiality",
        ],
      });
    } catch (caughtError) {
      setActionError(
        caughtError instanceof Error
          ? caughtError.message
          : "Feedback could not be saved.",
      );
    } finally {
      setWorkingImpactId(null);
    }
  };

  return (
    <aside className="relay-scrollbar flex h-full min-h-0 flex-col overflow-y-auto border-l border-relay-border bg-relay-deep">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-relay-border px-5">
        <div>
          <h2 className="text-sm font-semibold">Thesis impact</h2>
          <p className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-relay-muted">
            Company-specific direction
          </p>
        </div>
        {onClose ? (
          <button
            aria-label="Close thesis impact"
            className="rounded p-1.5 text-relay-muted hover:bg-relay-surface-2 hover:text-relay-text"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        ) : null}
      </div>

      <section className="border-b border-relay-border p-5">
        {update.thesisImpacts.length ? (
          <div className="space-y-3">
            {update.thesisImpacts.map((impact) => {
              const isWorking = workingImpactId === impact.id;
              const feedback =
                impact.review?.decision === "accepted"
                  ? "Material"
                  : impact.review?.decision === "rejected"
                    ? "Not material"
                    : null;
              return (
                <article
                  className="rounded-md border border-relay-border bg-relay-surface p-3"
                  key={impact.id}
                >
                  <div className="flex items-center justify-between gap-3">
                    <Link
                      className="font-mono text-xs font-semibold hover:text-relay-accent"
                      to={`/theses/${impact.companyTicker}`}
                    >
                      {impact.companyTicker}
                    </Link>
                    <SentimentBadge sentiment={impact.direction} />
                  </div>
                  <p className="mt-3 text-xs leading-5 text-relay-muted">
                    {impact.summary}
                  </p>
                  <div className="mt-3 border-l border-relay-accent/60 pl-3">
                    <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-relay-subtle">
                      Thesis delta
                    </p>
                    <p className="mt-1 text-xs leading-5 text-relay-text">
                      {impact.thesisDelta}
                    </p>
                  </div>
                  <p className="mt-3 font-mono text-[9px] uppercase tracking-[0.06em] text-relay-subtle">
                    {impact.confidence} confidence · {impact.horizon}
                  </p>

                  <div className="mt-4 flex items-center gap-2">
                    <button
                      aria-pressed={feedback === "Material"}
                      className={`inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded border px-2 text-[11px] transition-colors ${
                        feedback === "Material"
                          ? "border-relay-positive/50 bg-relay-positive/10 text-relay-positive"
                          : "border-relay-border text-relay-muted hover:border-relay-positive/40 hover:text-relay-text"
                      }`}
                      disabled={isWorking}
                      onClick={() => void submitFeedback(impact.id, true)}
                      type="button"
                    >
                      {isWorking ? (
                        <LoaderCircle
                          aria-hidden="true"
                          className="size-3 animate-spin"
                        />
                      ) : (
                        <Check aria-hidden="true" className="size-3" />
                      )}
                      Material
                    </button>
                    <button
                      aria-pressed={feedback === "Not material"}
                      className={`inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded border px-2 text-[11px] transition-colors ${
                        feedback === "Not material"
                          ? "border-relay-border-strong bg-relay-raised text-relay-text"
                          : "border-relay-border text-relay-muted hover:border-relay-border-strong hover:text-relay-text"
                      }`}
                      disabled={isWorking}
                      onClick={() => void submitFeedback(impact.id, false)}
                      type="button"
                    >
                      <CircleMinus aria-hidden="true" className="size-3" />
                      Not material
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="rounded-md border border-relay-border bg-relay-surface p-4">
            <p className="text-sm font-medium">No thesis change</p>
            <p className="mt-2 text-xs leading-5 text-relay-muted">
              Relay found no company-specific impact worth elevating.
            </p>
          </div>
        )}

        {actionError ? (
          <p className="mt-3 text-xs leading-5 text-relay-negative" role="alert">
            {actionError}
          </p>
        ) : null}
      </section>

      <div className="min-h-[280px] flex-1">
        <EvidencePanel
          claims={update.claims}
          selectedClaimId={selectedClaimId}
          updates={[update]}
        />
      </div>
    </aside>
  );
}
