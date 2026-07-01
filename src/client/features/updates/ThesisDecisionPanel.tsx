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
  MacroThesisRelevance,
} from "../../../shared/contracts";
import { EvidencePanel } from "../../components/EvidencePanel";
import { SentimentBadge } from "../../components/ui/StatusBadge";
import { companyThesisPath } from "../../lib/thesisRoutes";

interface ThesisDecisionPanelProps {
  macroThesisTitles: Readonly<Record<string, string>>;
  onClose?: () => void;
  onReview: (impactId: string, input: ImpactReviewInput) => Promise<void>;
  selectedClaimId: string | null;
  update: IntelligenceUpdate;
}

export function ThesisDecisionPanel({
  macroThesisTitles,
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
          <h2 className="text-sm font-semibold">Thesis routing</h2>
          <p className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-relay-muted">
            Company and macro relevance
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
            <p className="text-[11px] leading-5 text-relay-muted">
              This reviews the proposed thesis impact, not the source.
              <span className="text-relay-text"> Material</span> keeps the
              impact eligible for thesis updates and briefs.
              <span className="text-relay-text"> Not material</span> excludes
              this impact; the signal remains in the ledger.
            </p>
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
                      to={companyThesisPath(impact.companyTicker)}
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
            <p className="text-sm font-medium">
              No company thesis impact
            </p>
            <p className="mt-2 text-xs leading-5 text-relay-muted">
              Relay found no company-specific impact worth elevating.
            </p>
          </div>
        )}

        {update.macroThesisImpacts.length ? (
          <div className="mt-5 border-t border-relay-border pt-5">
            <h3 className="text-sm font-semibold">Macro thesis routing</h3>
            <p className="mt-2 text-[11px] leading-5 text-relay-muted">
              These are evidence-routing decisions, not accepted thesis
              changes. Evaluate theses creates reviewable proposals; only
              accepting a proposal updates a thesis.
            </p>
            <div className="mt-3 space-y-3">
              {update.macroThesisImpacts.map((impact) => (
                <article
                  className="rounded-md border border-relay-border bg-relay-surface p-3"
                  key={impact.id}
                >
                  <Link
                    className="text-xs font-semibold leading-5 text-relay-text hover:text-relay-accent"
                    to={`/theses/${impact.thesisId}`}
                  >
                    {macroThesisTitles[impact.thesisId] ??
                      impact.thesisId}
                  </Link>
                  <div className="mt-2 flex flex-wrap items-center gap-2 font-mono text-[9px] uppercase tracking-[0.07em]">
                    <span
                      className={`rounded border px-1.5 py-0.5 ${macroRelevanceClassName(
                        impact.relevance,
                      )}`}
                    >
                      {impact.relevance}
                    </span>
                    <span className="text-relay-subtle">
                      {impact.stance}
                    </span>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-relay-muted">
                    {impact.rationale}
                  </p>
                </article>
              ))}
            </div>
          </div>
        ) : null}

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

function macroRelevanceClassName(
  relevance: MacroThesisRelevance,
): string {
  switch (relevance) {
    case "primary":
      return "border-relay-warning/40 bg-relay-warning/10 text-relay-warning";
    case "secondary":
      return "border-relay-accent/40 bg-relay-accent/10 text-relay-accent";
    case "context":
      return "border-relay-border-strong bg-relay-raised text-relay-muted";
  }
}
