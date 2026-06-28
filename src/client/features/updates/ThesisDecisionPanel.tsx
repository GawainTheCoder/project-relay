import {
  ArrowDownRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  Clock3,
  LoaderCircle,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import {
  impactReviewReasonTags,
  type ImpactReviewDecision,
  type ImpactReviewInput,
  type ImpactReviewReasonTag,
  type IntelligenceUpdate,
} from "../../../shared/contracts";
import { EvidencePanel } from "../../components/EvidencePanel";
import { Button } from "../../components/ui/Button";
import { sentimentColor, titleCase } from "../../lib/format";

interface ThesisDecisionPanelProps {
  onClose?: () => void;
  onReview: (impactId: string, input: ImpactReviewInput) => Promise<void>;
  selectedClaimId: string | null;
  update: IntelligenceUpdate;
}

const reasonLabels: Record<ImpactReviewReasonTag, string> = {
  "wrong-company": "Wrong company",
  "wrong-layer": "Wrong layer",
  "overstated-materiality": "Materiality overstated",
  "unsupported-conclusion": "Unsupported conclusion",
  "missed-important-claim": "Missed key claim",
  "useful-analysis": "Useful analysis",
  other: "Other",
};

const decisions: Array<{
  label: string;
  value: ImpactReviewDecision;
}> = [
  { label: "Accept", value: "accepted" },
  { label: "No change", value: "rejected" },
  { label: "Review later", value: "deferred" },
];

interface ReviewDraft {
  decision: ImpactReviewDecision;
  note: string;
  reasonTags: ImpactReviewReasonTag[];
}

export function ThesisDecisionPanel({
  onClose,
  onReview,
  selectedClaimId,
  update,
}: ThesisDecisionPanelProps) {
  const [selectedImpactId, setSelectedImpactId] = useState(
    update.thesisImpacts[0]?.id ?? "",
  );
  const selectedImpact = useMemo(
    () =>
      update.thesisImpacts.find((impact) => impact.id === selectedImpactId) ??
      update.thesisImpacts[0] ??
      null,
    [selectedImpactId, update.thesisImpacts],
  );
  const [drafts, setDrafts] = useState<Record<string, ReviewDraft>>({});
  const [isWorking, setIsWorking] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const currentDraft: ReviewDraft = selectedImpact
    ? (drafts[selectedImpact.id] ?? {
        decision: selectedImpact.review?.decision ?? "accepted",
        note: selectedImpact.review?.note ?? "",
        reasonTags: selectedImpact.review?.reasonTags.length
          ? selectedImpact.review.reasonTags
          : ["useful-analysis"],
      })
    : { decision: "accepted", note: "", reasonTags: [] };

  const updateDraft = (patch: Partial<ReviewDraft>) => {
    if (!selectedImpact) {
      return;
    }
    setDrafts((current) => ({
      ...current,
      [selectedImpact.id]: { ...currentDraft, ...patch },
    }));
    setActionError(null);
  };

  const toggleReason = (reason: ImpactReviewReasonTag) => {
    updateDraft({
      reasonTags: currentDraft.reasonTags.includes(reason)
        ? currentDraft.reasonTags.filter((item) => item !== reason)
        : [...currentDraft.reasonTags, reason],
    });
  };

  const saveReview = async () => {
    if (!selectedImpact) {
      return;
    }
    if (!currentDraft.reasonTags.length) {
      setActionError("Select at least one reason.");
      return;
    }
    if (
      currentDraft.reasonTags.includes("other") &&
      !currentDraft.note.trim()
    ) {
      setActionError("Add a note for the “Other” reason.");
      return;
    }
    setIsWorking(true);
    setActionError(null);
    try {
      await onReview(selectedImpact.id, {
        decision: currentDraft.decision,
        reasonTags: currentDraft.reasonTags,
        ...(currentDraft.note.trim()
          ? { note: currentDraft.note.trim() }
          : {}),
      });
    } catch (caughtError) {
      setActionError(
        caughtError instanceof Error
          ? caughtError.message
          : "The review could not be saved.",
      );
    } finally {
      setIsWorking(false);
    }
  };

  return (
    <aside className="relay-scrollbar flex h-full min-h-0 flex-col overflow-y-auto border-l border-relay-border bg-relay-deep">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-relay-border px-5">
        <div>
          <h2 className="text-sm font-semibold">Thesis review</h2>
          <p className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-relay-muted">
            One decision per company impact
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
          <div className="space-y-2">
            {update.thesisImpacts.map((impact) => {
              const positive = impact.direction === "bullish";
              const DirectionIcon = positive ? ArrowUpRight : ArrowDownRight;
              const isSelected = impact.id === selectedImpact?.id;
              return (
                <button
                  aria-pressed={isSelected}
                  className={`w-full rounded-md border p-3 text-left transition-colors ${
                    isSelected
                      ? "border-relay-accent/60 bg-relay-accent/6"
                      : "border-relay-border bg-relay-surface hover:border-relay-border-strong"
                  }`}
                  key={impact.id}
                  onClick={() => setSelectedImpactId(impact.id)}
                  type="button"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-mono text-xs font-semibold">
                      {impact.companyTicker}
                    </span>
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
                  <div className="mt-3 flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.06em] text-relay-subtle">
                    <span>
                      {impact.confidence} · {impact.horizon}
                    </span>
                    {impact.review ? (
                      <span className="inline-flex items-center gap-1 text-relay-positive">
                        <Check aria-hidden="true" className="size-3" />
                        {impact.review.decision}
                      </span>
                    ) : (
                      <span>Unreviewed</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="text-sm leading-6 text-relay-muted">
            Relay found no thesis impact in this update.
          </p>
        )}
      </section>

      {selectedImpact ? (
        <section className="border-b border-relay-border p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">
              Review {selectedImpact.companyTicker}
            </h3>
            <Link
              className="text-xs text-relay-accent hover:text-relay-text"
              to={`/companies/${selectedImpact.companyTicker}`}
            >
              Open thesis
            </Link>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-1 rounded-md bg-relay-surface p-1">
            {decisions.map((item) => (
              <button
                aria-pressed={currentDraft.decision === item.value}
                className={`rounded px-2 py-2 text-[11px] transition-colors ${
                  currentDraft.decision === item.value
                    ? "bg-relay-raised text-relay-text shadow-sm"
                    : "text-relay-muted hover:text-relay-text"
                }`}
                key={item.value}
                onClick={() => updateDraft({ decision: item.value })}
                type="button"
              >
                {item.label}
              </button>
            ))}
          </div>

          <p className="mt-4 text-xs font-medium text-relay-muted">
            Why?
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {impactReviewReasonTags.map((reason) => {
              const selected = currentDraft.reasonTags.includes(reason);
              return (
                <button
                  aria-pressed={selected}
                  className={`rounded-full border px-2.5 py-1.5 text-[10px] transition-colors ${
                    selected
                      ? "border-relay-accent/60 bg-relay-accent/10 text-relay-text"
                      : "border-relay-border text-relay-muted hover:border-relay-border-strong"
                  }`}
                  key={reason}
                  onClick={() => toggleReason(reason)}
                  type="button"
                >
                  {reasonLabels[reason]}
                </button>
              );
            })}
          </div>

          <label className="mt-4 block">
            <span className="text-xs font-medium text-relay-muted">
              Note <span className="text-relay-subtle">(optional)</span>
            </span>
            <textarea
              className="mt-2 min-h-20 w-full resize-y rounded-md border border-relay-border bg-relay-surface px-3 py-2.5 text-xs leading-5 placeholder:text-relay-subtle focus:border-relay-accent"
              maxLength={2000}
              onChange={(event) => updateDraft({ note: event.target.value })}
              placeholder="What should the analyst do differently next time?"
              value={currentDraft.note}
            />
          </label>

          {actionError ? (
            <p className="mt-3 text-xs leading-5 text-relay-negative" role="alert">
              {actionError}
            </p>
          ) : null}

          <Button
            className="mt-4 w-full"
            disabled={isWorking}
            onClick={() => void saveReview()}
            variant="primary"
          >
            {isWorking ? (
              <LoaderCircle
                aria-hidden="true"
                className="size-3.5 animate-spin"
              />
            ) : selectedImpact.review ? (
              <Check aria-hidden="true" className="size-3.5" />
            ) : (
              <Clock3 aria-hidden="true" className="size-3.5" />
            )}
            {selectedImpact.review ? "Update review" : "Save review"}
          </Button>
        </section>
      ) : null}

      <div className="min-h-[260px] flex-1">
        <EvidencePanel
          claims={update.claims}
          selectedClaimId={selectedClaimId}
          updates={[update]}
        />
      </div>
    </aside>
  );
}
