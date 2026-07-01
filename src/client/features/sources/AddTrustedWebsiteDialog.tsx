import {
  AlertCircle,
  Check,
  Globe2,
  LoaderCircle,
  ShieldCheck,
  X,
} from "lucide-react";
import {
  type Dispatch,
  type FormEvent,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  layerIds,
  type Company,
  type LayerId,
  type ResearchSource,
  type ThesisSourceCoverage,
} from "../../../shared/contracts";
import { Button } from "../../components/ui/Button";
import {
  createTrustedSourceProfile,
  type SourceAuthorityTier,
  type SourceProfileRole,
} from "../../lib/api";
import { getLayerName } from "../../lib/format";
import { normalizeTrustedWebsite } from "./source-profile";

interface AddTrustedWebsiteDialogProps {
  companies: Company[];
  isOpen: boolean;
  macroTheses: ThesisSourceCoverage[];
  onClose: () => void;
  onCreated: (source: ResearchSource) => Promise<void>;
  onError: (message: string) => void;
}

const fieldsetClass =
  "rounded-md border border-relay-border bg-relay-deep px-3 py-3";
const checkboxClass =
  "size-3.5 rounded border-relay-border bg-relay-surface text-relay-accent";

export function AddTrustedWebsiteDialog({
  companies,
  isOpen,
  macroTheses,
  onClose,
  onCreated,
  onError,
}: AddTrustedWebsiteDialogProps) {
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [role, setRole] = useState<SourceProfileRole>("primary");
  const [authorityTier, setAuthorityTier] =
    useState<SourceAuthorityTier>("specialist");
  const [selectedLayers, setSelectedLayers] = useState<LayerId[]>([]);
  const [selectedCompanies, setSelectedCompanies] = useState<string[]>([]);
  const [selectedTheses, setSelectedTheses] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [createdSource, setCreatedSource] = useState<ResearchSource | null>(
    null,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setName("");
    setWebsite("");
    setRole("primary");
    setAuthorityTier("specialist");
    setSelectedLayers([]);
    setSelectedCompanies([]);
    setSelectedTheses([]);
    setError(null);
    setCreatedSource(null);
  }, []);

  const closeDialog = useCallback(() => {
    reset();
    onClose();
  }, [onClose, reset]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const frame = window.requestAnimationFrame(() => nameRef.current?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isSubmitting) {
        closeDialog();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [closeDialog, isOpen, isSubmitting]);

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

  const toggleValue = (
    value: string,
    setter: Dispatch<SetStateAction<string[]>>,
  ) => {
    setter((current) =>
      current.includes(value)
        ? current.filter((candidate) => candidate !== value)
        : [...current, value],
    );
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const cleanName = name.trim();
    const normalizedWebsite = normalizeTrustedWebsite(website);
    setError(null);

    if (!cleanName) {
      setError("Add a source name.");
      return;
    }
    if (!normalizedWebsite) {
      setError("Add a valid public website or domain.");
      return;
    }
    if (!selectedLayers.length) {
      setError("Select at least one infrastructure layer.");
      return;
    }

    setIsSubmitting(true);
    try {
      const source = await createTrustedSourceProfile({
        name: cleanName,
        ...normalizedWebsite,
        role,
        authorityTier,
        layerIds: selectedLayers,
        companyTickers: selectedCompanies,
        thesisIds: selectedTheses,
      });
      setCreatedSource(source);
      await onCreated(source);
    } catch (caughtError) {
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : "The trusted website could not be added.";
      setError(message);
      onError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      aria-labelledby="add-trusted-website-title"
      aria-modal="true"
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target && !isSubmitting) {
          closeDialog();
        }
      }}
      role="dialog"
    >
      <section className="relay-scrollbar max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-lg border border-relay-border-strong bg-relay-surface shadow-2xl shadow-black/60">
        <header className="flex items-start justify-between border-b border-relay-border px-5 py-5">
          <div>
            <h2
              className="text-lg font-semibold tracking-tight"
              id="add-trusted-website-title"
            >
              Add trusted website
            </h2>
            <p className="mt-1 text-sm text-relay-muted">
              Register a publisher or company profile that Relay should
              recognize as a source.
            </p>
          </div>
          <button
            aria-label="Close add trusted website"
            className="rounded p-1.5 text-relay-muted hover:bg-relay-raised hover:text-relay-text"
            disabled={isSubmitting}
            onClick={closeDialog}
            type="button"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        </header>

        {createdSource ? (
          <div className="p-5">
            <div
              className="rounded-md border border-relay-positive/35 bg-relay-positive/8 px-4 py-4 text-relay-positive"
              role="status"
            >
              <Check aria-hidden="true" className="size-4" />
              <p className="mt-3 text-sm font-medium">
                Trusted website added
              </p>
              <p className="mt-1 text-xs leading-5">
                {createdSource.name} is registered for attribution and source
                coverage. It will not be crawled automatically.
              </p>
            </div>
            <div className="mt-5 flex justify-end">
              <Button onClick={closeDialog} variant="primary">
                Done
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit}>
            <div className="space-y-5 p-5">
              <aside className="flex items-start gap-2 rounded-md border border-relay-accent/25 bg-relay-accent/7 px-3 py-3 text-xs leading-5 text-relay-muted">
                <Globe2
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0 text-relay-accent"
                />
                <span>
                  This creates a non-feed source profile. To analyze an
                  individual article or arbitrary webpage, use{" "}
                  <span className="font-medium text-relay-text">Add signal</span>.
                </span>
              </aside>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-medium text-relay-muted">
                    Source name
                  </span>
                  <input
                    className="mt-2 h-10 w-full rounded-md border border-relay-border bg-relay-deep px-3 text-sm placeholder:text-relay-subtle focus:border-relay-accent"
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Publication or company"
                    ref={nameRef}
                    required
                    value={name}
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-relay-muted">
                    Public website or domain
                  </span>
                  <input
                    className="mt-2 h-10 w-full rounded-md border border-relay-border bg-relay-deep px-3 text-sm placeholder:text-relay-subtle focus:border-relay-accent"
                    onChange={(event) => setWebsite(event.target.value)}
                    placeholder="example.com/research"
                    required
                    value={website}
                  />
                </label>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-medium text-relay-muted">
                    Source role
                  </span>
                  <select
                    className="mt-2 h-10 w-full rounded-md border border-relay-border bg-relay-deep px-3 text-sm text-relay-text focus:border-relay-accent"
                    onChange={(event) =>
                      setRole(event.target.value as SourceProfileRole)
                    }
                    value={role}
                  >
                    <option value="primary">Primary evidence</option>
                    <option value="context">Context only</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-relay-muted">
                    Authority tier
                  </span>
                  <select
                    className="mt-2 h-10 w-full rounded-md border border-relay-border bg-relay-deep px-3 text-sm text-relay-text focus:border-relay-accent"
                    onChange={(event) =>
                      setAuthorityTier(
                        event.target.value as SourceAuthorityTier,
                      )
                    }
                    value={authorityTier}
                  >
                    <option value="first-party">First-party</option>
                    <option value="specialist">Specialist industry</option>
                    <option value="context">Context</option>
                  </select>
                </label>
              </div>

              <fieldset className={fieldsetClass}>
                <legend className="px-1 text-xs font-medium text-relay-muted">
                  Infrastructure layers
                </legend>
                <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {layerIds.map((layerId) => (
                    <label
                      className="flex items-center gap-2 text-xs text-relay-muted"
                      key={layerId}
                    >
                      <input
                        checked={selectedLayers.includes(layerId)}
                        className={checkboxClass}
                        onChange={() => toggleLayer(layerId)}
                        type="checkbox"
                      />
                      {getLayerName(layerId)}
                    </label>
                  ))}
                </div>
              </fieldset>

              <div className="grid gap-4 lg:grid-cols-2">
                <fieldset className={fieldsetClass}>
                  <legend className="px-1 text-xs font-medium text-relay-muted">
                    Affected companies
                  </legend>
                  <div className="relay-scrollbar mt-2 max-h-36 space-y-2 overflow-y-auto">
                    {companies.length ? (
                      companies.map((company) => (
                        <label
                          className="flex items-center gap-2 text-xs text-relay-muted"
                          key={company.ticker}
                        >
                          <input
                            checked={selectedCompanies.includes(company.ticker)}
                            className={checkboxClass}
                            onChange={() =>
                              toggleValue(
                                company.ticker,
                                setSelectedCompanies,
                              )
                            }
                            type="checkbox"
                          />
                          <span className="font-mono text-relay-text">
                            {company.ticker}
                          </span>
                          <span className="truncate">{company.name}</span>
                        </label>
                      ))
                    ) : (
                      <p className="text-xs text-relay-subtle">
                        No company theses available.
                      </p>
                    )}
                  </div>
                </fieldset>

                <fieldset className={fieldsetClass}>
                  <legend className="px-1 text-xs font-medium text-relay-muted">
                    Affected macro theses
                  </legend>
                  <div className="relay-scrollbar mt-2 max-h-36 space-y-2 overflow-y-auto">
                    {macroTheses.length ? (
                      macroTheses.map((thesis) => (
                        <label
                          className="flex items-start gap-2 text-xs leading-5 text-relay-muted"
                          key={thesis.thesisId}
                        >
                          <input
                            checked={selectedTheses.includes(thesis.thesisId)}
                            className={`${checkboxClass} mt-0.5`}
                            onChange={() =>
                              toggleValue(thesis.thesisId, setSelectedTheses)
                            }
                            type="checkbox"
                          />
                          {thesis.thesisTitle}
                        </label>
                      ))
                    ) : (
                      <p className="text-xs text-relay-subtle">
                        No macro theses available.
                      </p>
                    )}
                  </div>
                </fieldset>
              </div>

              {error ? (
                <div
                  className="flex items-start gap-2 rounded-md border border-relay-negative/35 bg-relay-negative/8 px-3 py-2.5 text-xs leading-5 text-relay-negative"
                  role="alert"
                >
                  <AlertCircle
                    aria-hidden="true"
                    className="mt-0.5 size-3.5 shrink-0"
                  />
                  {error}
                </div>
              ) : null}
            </div>

            <footer className="flex items-center justify-end gap-2 border-t border-relay-border px-5 py-4">
              <Button
                disabled={isSubmitting}
                onClick={closeDialog}
                variant="quiet"
              >
                Cancel
              </Button>
              <Button disabled={isSubmitting} type="submit" variant="primary">
                {isSubmitting ? (
                  <LoaderCircle
                    aria-hidden="true"
                    className="size-3.5 animate-spin"
                  />
                ) : (
                  <ShieldCheck aria-hidden="true" className="size-3.5" />
                )}
                {isSubmitting ? "Adding website" : "Add trusted website"}
              </Button>
            </footer>
          </form>
        )}
      </section>
    </div>
  );
}
