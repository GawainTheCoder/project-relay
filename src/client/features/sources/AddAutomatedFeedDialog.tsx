import {
  AlertCircle,
  Check,
  LoaderCircle,
  Plus,
  Rss,
  X,
} from "lucide-react";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import type {
  ResearchSource,
  ResearchSourceInput,
} from "../../../shared/contracts";
import { Button } from "../../components/ui/Button";
import { createResearchSource } from "../../lib/api";

interface AddAutomatedFeedDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (source: ResearchSource) => Promise<void>;
  onError: (message: string) => void;
}

type SourceType = ResearchSourceInput["type"];

const sourceTypeOptions: Array<{
  value: SourceType;
  label: string;
  description: string;
}> = [
  {
    value: "rss",
    label: "RSS feed",
    description: "Refresh and analyze new feed items automatically.",
  },
  {
    value: "release",
    label: "Release feed",
    description: "Track software or product release announcements.",
  },
  {
    value: "paper",
    label: "Research feed",
    description: "Track a focused research or paper feed.",
  },
];

export function AddAutomatedFeedDialog({
  isOpen,
  onClose,
  onCreated,
  onError,
}: AddAutomatedFeedDialogProps) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [type, setType] = useState<SourceType>("rss");
  const [error, setError] = useState<string | null>(null);
  const [createdSource, setCreatedSource] = useState<ResearchSource | null>(
    null,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  const closeDialog = useCallback(() => {
    setError(null);
    setCreatedSource(null);
    setName("");
    setUrl("");
    setType("rss");
    onClose();
  }, [onClose]);

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

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const cleanName = name.trim();
    const cleanUrl = url.trim();
    setError(null);

    if (!cleanName) {
      setError("Add a source name.");
      return;
    }
    if (!cleanUrl) {
      setError("Add a public feed URL.");
      return;
    }

    setIsSubmitting(true);
    try {
      const source = await createResearchSource({
        name: cleanName,
        url: cleanUrl,
        type,
      });
      setCreatedSource(source);
      await onCreated(source);
      setName("");
      setUrl("");
      setType("rss");
    } catch (caughtError) {
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : "The source could not be added.";
      setError(message);
      onError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      aria-labelledby="add-automated-feed-title"
      aria-modal="true"
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target && !isSubmitting) {
          closeDialog();
        }
      }}
      role="dialog"
    >
      <section className="w-full max-w-lg rounded-lg border border-relay-border-strong bg-relay-surface shadow-2xl shadow-black/60">
        <header className="flex items-start justify-between border-b border-relay-border px-5 py-5">
          <div>
            <h2
              className="text-lg font-semibold tracking-tight"
              id="add-automated-feed-title"
            >
              Add automated feed
            </h2>
            <p className="mt-1 text-sm text-relay-muted">
              Relay periodically checks RSS, release, and research feeds.
            </p>
          </div>
          <button
            aria-label="Close add automated feed"
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
              <p className="mt-3 text-sm font-medium">Automated feed added</p>
              <p className="mt-1 text-xs leading-5">
                Relay can now check {createdSource.name} during feed refreshes.
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
              <label className="block">
                <span className="text-xs font-medium text-relay-muted">
                  Source name
                </span>
                <input
                  className="mt-2 h-10 w-full rounded-md border border-relay-border bg-relay-deep px-3 text-sm placeholder:text-relay-subtle focus:border-relay-accent"
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Publication, company, or project"
                  ref={nameRef}
                  required
                  value={name}
                />
              </label>

              <label className="block">
                <span className="text-xs font-medium text-relay-muted">
                  Source type
                </span>
                <select
                  className="mt-2 h-10 w-full rounded-md border border-relay-border bg-relay-deep px-3 text-sm text-relay-text focus:border-relay-accent"
                  onChange={(event) => {
                    setType(event.target.value as SourceType);
                    setError(null);
                  }}
                  value={type}
                >
                  {sourceTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <span className="mt-2 block text-[10px] leading-4 text-relay-subtle">
                  {
                    sourceTypeOptions.find((option) => option.value === type)
                      ?.description
                  }
                </span>
              </label>

              <label className="block">
                <span className="flex items-center gap-2 text-xs font-medium text-relay-muted">
                  <Rss aria-hidden="true" className="size-3.5" />
                  Feed URL
                </span>
                <input
                  className="mt-2 h-10 w-full rounded-md border border-relay-border bg-relay-deep px-3 text-sm placeholder:text-relay-subtle focus:border-relay-accent"
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder="https://…"
                  required
                  type="url"
                  value={url}
                />
              </label>

              <aside className="rounded-md border border-relay-border bg-relay-deep px-3 py-3 text-xs leading-5 text-relay-muted">
                This form requires a feed URL. To register a publisher without
                a feed, use <span className="font-medium text-relay-text">Add trusted website</span>.
                To analyze one article or webpage, use{" "}
                <span className="font-medium text-relay-text">Add signal</span>.
              </aside>

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
                  <Plus aria-hidden="true" className="size-3.5" />
                )}
                {isSubmitting ? "Adding feed" : "Add automated feed"}
              </Button>
            </footer>
          </form>
        )}
      </section>
    </div>
  );
}
