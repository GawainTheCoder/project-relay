import {
  Building2,
  Check,
  LoaderCircle,
  Plus,
  X,
} from "lucide-react";
import {
  type FormEvent,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  layerIds,
  type Confidence,
  type LayerId,
} from "../../../shared/contracts";
import { Button } from "../../components/ui/Button";
import { createCompany } from "../../lib/api";
import { getLayerName } from "../../lib/format";

interface AddCompanyDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (ticker: string) => Promise<void>;
}

function lines(value: string) {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function AddCompanyDialog({
  isOpen,
  onClose,
  onCreated,
}: AddCompanyDialogProps) {
  const [ticker, setTicker] = useState("");
  const [name, setName] = useState("");
  const [thesis, setThesis] = useState("");
  const [whyItMatters, setWhyItMatters] = useState("");
  const [selectedLayers, setSelectedLayers] = useState<LayerId[]>([]);
  const [confidence, setConfidence] = useState<Confidence>("medium");
  const [provesRight, setProvesRight] = useState("");
  const [breaksThesis, setBreaksThesis] = useState("");
  const [watchMetrics, setWatchMetrics] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const tickerRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const frame = window.requestAnimationFrame(() => tickerRef.current?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isSubmitting) {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen) {
    return null;
  }

  const toggleLayer = (layerId: LayerId) => {
    setSelectedLayers((current) =>
      current.includes(layerId)
        ? current.filter((candidate) => candidate !== layerId)
        : [...current, layerId],
    );
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const cleanTicker = ticker.trim().toUpperCase();
    const cleanName = name.trim();
    const cleanThesis = thesis.trim();
    const cleanWhyItMatters = whyItMatters.trim();
    const proofItems = lines(provesRight);
    const breakItems = lines(breaksThesis);
    const metricItems = lines(watchMetrics);

    setError(null);
    setSuccess(null);
    if (!/^[A-Z][A-Z0-9.-]{0,11}$/.test(cleanTicker)) {
      setError(
        "Use a ticker that starts with a letter and contains up to 12 letters, numbers, dots, or dashes.",
      );
      return;
    }
    if (!cleanName || !cleanThesis || !cleanWhyItMatters) {
      setError("Company name, thesis, and why it matters are required.");
      return;
    }
    if (!selectedLayers.length) {
      setError("Select at least one infrastructure layer.");
      return;
    }
    if (!proofItems.length || !breakItems.length || !metricItems.length) {
      setError(
        "Add at least one confirmation criterion, break condition, and metric to watch.",
      );
      return;
    }

    setIsSubmitting(true);
    try {
      await createCompany({
        ticker: cleanTicker,
        name: cleanName,
        layerIds: selectedLayers,
        description: cleanWhyItMatters,
        thesis: cleanThesis,
        whyItMatters: cleanWhyItMatters,
        provesRight: proofItems,
        breaksThesis: breakItems,
        watchMetrics: metricItems,
        confidence,
      });
      setSuccess(`${cleanTicker} was added to the watchlist.`);
      await onCreated(cleanTicker);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "The company could not be added.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      aria-labelledby="add-company-title"
      aria-modal="true"
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target && !isSubmitting) {
          onClose();
        }
      }}
      role="dialog"
    >
      <section className="relay-scrollbar max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-relay-border-strong bg-relay-surface shadow-2xl shadow-black/60">
        <header className="flex items-start justify-between border-b border-relay-border px-5 py-5">
          <div>
            <h2
              className="text-lg font-semibold tracking-tight"
              id="add-company-title"
            >
              Add company thesis
            </h2>
            <p className="mt-1 text-sm text-relay-muted">
              Define what Relay should monitor before adding source evidence.
            </p>
          </div>
          <button
            aria-label="Close add company"
            className="rounded p-1.5 text-relay-muted hover:bg-relay-raised hover:text-relay-text"
            disabled={isSubmitting}
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        </header>

        <form onSubmit={submit}>
          <div className="space-y-5 p-5">
            <div className="grid gap-4 sm:grid-cols-[140px_minmax(0,1fr)]">
              <label className="block">
                <span className="text-xs font-medium text-relay-muted">
                  Ticker
                </span>
                <input
                  autoCapitalize="characters"
                  className="mt-2 h-10 w-full rounded-md border border-relay-border bg-relay-deep px-3 font-mono text-sm uppercase placeholder:text-relay-subtle focus:border-relay-accent"
                  maxLength={12}
                  onChange={(event) => setTicker(event.target.value.toUpperCase())}
                  placeholder="NVDA"
                  ref={tickerRef}
                  required
                  value={ticker}
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-relay-muted">
                  Company name
                </span>
                <input
                  className="mt-2 h-10 w-full rounded-md border border-relay-border bg-relay-deep px-3 text-sm placeholder:text-relay-subtle focus:border-relay-accent"
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Company name"
                  required
                  value={name}
                />
              </label>
            </div>

            <label className="block">
              <span className="text-xs font-medium text-relay-muted">
                Core thesis
              </span>
              <textarea
                className="mt-2 min-h-24 w-full resize-y rounded-md border border-relay-border bg-relay-deep px-3 py-3 text-sm leading-6 placeholder:text-relay-subtle focus:border-relay-accent"
                onChange={(event) => setThesis(event.target.value)}
                placeholder="What do you believe about this company’s AI-infrastructure position?"
                required
                value={thesis}
              />
            </label>

            <label className="block">
              <span className="text-xs font-medium text-relay-muted">
                Why it matters
              </span>
              <textarea
                className="mt-2 min-h-20 w-full resize-y rounded-md border border-relay-border bg-relay-deep px-3 py-3 text-sm leading-6 placeholder:text-relay-subtle focus:border-relay-accent"
                onChange={(event) => setWhyItMatters(event.target.value)}
                placeholder="Describe the bottleneck, exposure, or strategic importance."
                required
                value={whyItMatters}
              />
            </label>

            <fieldset>
              <legend className="text-xs font-medium text-relay-muted">
                Infrastructure layers
              </legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {layerIds.map((layerId) => {
                  const selected = selectedLayers.includes(layerId);
                  return (
                    <button
                      aria-pressed={selected}
                      className={`rounded border px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.06em] transition-colors ${
                        selected
                          ? "border-relay-accent bg-relay-accent/12 text-relay-accent"
                          : "border-relay-border text-relay-muted hover:border-relay-border-strong hover:text-relay-text"
                      }`}
                      key={layerId}
                      onClick={() => toggleLayer(layerId)}
                      type="button"
                    >
                      {getLayerName(layerId)}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <label className="block max-w-48">
              <span className="text-xs font-medium text-relay-muted">
                Initial confidence
              </span>
              <select
                className="mt-2 h-10 w-full rounded-md border border-relay-border bg-relay-deep px-3 text-sm text-relay-text focus:border-relay-accent"
                onChange={(event) =>
                  setConfidence(event.target.value as Confidence)
                }
                value={confidence}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </label>

            <div className="grid gap-4 lg:grid-cols-3">
              <ChecklistField
                label="What proves it right"
                onChange={setProvesRight}
                placeholder={"One criterion per line\nRevenue mix expands…"}
                value={provesRight}
              />
              <ChecklistField
                label="What breaks the thesis"
                onChange={setBreaksThesis}
                placeholder={"One condition per line\nQualification slips…"}
                value={breaksThesis}
              />
              <ChecklistField
                label="Metrics to watch"
                onChange={setWatchMetrics}
                placeholder={"One metric per line\nAI revenue growth…"}
                value={watchMetrics}
              />
            </div>

            {error ? (
              <p
                className="rounded-md border border-relay-negative/35 bg-relay-negative/8 px-3 py-2.5 text-xs leading-5 text-relay-negative"
                role="alert"
              >
                {error}
              </p>
            ) : null}
            {success ? (
              <p
                className="flex items-start gap-2 rounded-md border border-relay-positive/35 bg-relay-positive/8 px-3 py-2.5 text-xs leading-5 text-relay-positive"
                role="status"
              >
                <Check
                  aria-hidden="true"
                  className="mt-0.5 size-3.5 shrink-0"
                />
                {success}
              </p>
            ) : null}
          </div>

          <footer className="flex items-center justify-end gap-2 border-t border-relay-border px-5 py-4">
            <Button disabled={isSubmitting} onClick={onClose} variant="quiet">
              Cancel
            </Button>
            <Button disabled={isSubmitting} type="submit" variant="primary">
              {isSubmitting ? (
                <LoaderCircle
                  aria-hidden="true"
                  className="size-3.5 animate-spin"
                />
              ) : (
                <Plus aria-hidden="true" className="size-3.5" />
              )}
              {isSubmitting ? "Adding company" : "Add to watchlist"}
            </Button>
          </footer>
        </form>
      </section>
    </div>
  );
}

function ChecklistField({
  label,
  onChange,
  placeholder,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  return (
    <label className="block">
      <span className="flex items-center gap-2 text-xs font-medium text-relay-muted">
        <Building2 aria-hidden="true" className="size-3.5" />
        {label}
      </span>
      <textarea
        className="mt-2 min-h-32 w-full resize-y rounded-md border border-relay-border bg-relay-deep px-3 py-3 text-xs leading-5 placeholder:text-relay-subtle focus:border-relay-accent"
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        value={value}
      />
    </label>
  );
}
