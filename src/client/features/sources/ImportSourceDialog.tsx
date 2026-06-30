import {
  AlertCircle,
  ArrowRight,
  Check,
  Link2,
  LoaderCircle,
  Quote,
  Radar,
  X,
} from "lucide-react";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Link } from "react-router-dom";

import type {
  ImportSourceInput,
  SourceKind,
} from "../../../shared/contracts";
import { Button } from "../../components/ui/Button";
import {
  importSource,
  type ImportSourceResult,
} from "../../lib/api";

export interface ImportSourceFeedback {
  kind: "success" | "error";
  message: string;
  updateId?: string;
}

interface ImportSourceDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onImported: (result: ImportSourceResult) => Promise<void>;
  onResult?: (feedback: ImportSourceFeedback) => void;
}

type IntakeMode = "url" | "excerpt";

export function ImportSourceDialog({
  isOpen,
  onClose,
  onImported,
  onResult,
}: ImportSourceDialogProps) {
  const [mode, setMode] = useState<IntakeMode>("url");
  const [title, setTitle] = useState("");
  const [publisher, setPublisher] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [content, setContent] = useState("");
  const [sourceKind, setSourceKind] = useState<SourceKind>("other");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<ImportSourceFeedback | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  const closeDialog = useCallback(() => {
    setError(null);
    setSuccess(null);
    setTitle("");
    setPublisher("");
    setSourceUrl("");
    setContent("");
    setSourceKind("other");
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const frame = window.requestAnimationFrame(() => titleRef.current?.focus());
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
    const cleanTitle = title.trim();
    const cleanPublisher = publisher.trim();
    const cleanUrl = sourceUrl.trim();
    const cleanContent = content.trim();

    setError(null);
    setSuccess(null);
    if (!cleanTitle || !cleanPublisher) {
      setError("Title and publisher are required.");
      return;
    }
    if (mode === "url" && !cleanUrl) {
      setError("Add a public article URL.");
      return;
    }
    if (mode === "excerpt" && cleanContent.length < 20) {
      setError("Paste at least 20 characters from the source.");
      return;
    }

    const input: ImportSourceInput = {
      title: cleanTitle,
      publisher: cleanPublisher,
      ...(mode === "url" ? { sourceUrl: cleanUrl } : { content: cleanContent }),
      sourceKind,
    };

    setIsSubmitting(true);
    try {
      const result = await importSource(input);
      const feedback: ImportSourceFeedback = {
        kind: "success",
        message: result.duplicate
          ? "This signal is already tracked. Relay kept the existing analysis."
          : result.update
            ? "Signal added and analyzed."
            : "Signal added. Analysis is pending.",
        ...(result.update ? { updateId: result.update.id } : {}),
      };
      setSuccess(feedback);
      onResult?.(feedback);
      await onImported(result);
      setTitle("");
      setPublisher("");
      setSourceUrl("");
      setContent("");
      setSourceKind("other");
    } catch (caughtError) {
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : "The signal could not be added.";
      setError(message);
      onResult?.({ kind: "error", message });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      aria-labelledby="add-signal-title"
      aria-modal="true"
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target && !isSubmitting) {
          closeDialog();
        }
      }}
      role="dialog"
    >
      <section className="relay-scrollbar max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-lg border border-relay-border-strong bg-relay-surface shadow-2xl shadow-black/60">
        <header className="flex items-start justify-between border-b border-relay-border px-5 py-5">
          <div>
            <h2
              className="text-lg font-semibold tracking-tight"
              id="add-signal-title"
            >
              Add signal
            </h2>
            <p className="mt-1 text-sm text-relay-muted">
              Analyze a public article or a permitted source excerpt.
            </p>
          </div>
          <button
            aria-label="Close add signal"
            className="rounded p-1.5 text-relay-muted hover:bg-relay-raised hover:text-relay-text"
            disabled={isSubmitting}
            onClick={closeDialog}
            type="button"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        </header>

        <form onSubmit={submit}>
          <div className="space-y-5 p-5">
            <div
              aria-label="Signal source"
              className="grid grid-cols-2 gap-1 rounded-md bg-relay-deep p-1"
              role="group"
            >
              <button
                aria-pressed={mode === "url"}
                className={`flex items-center justify-center gap-2 rounded px-3 py-2 text-xs transition-colors ${
                  mode === "url"
                    ? "bg-relay-raised text-relay-text"
                    : "text-relay-muted hover:text-relay-text"
                }`}
                onClick={() => {
                  setMode("url");
                  setError(null);
                  setSuccess(null);
                }}
                type="button"
              >
                <Link2 aria-hidden="true" className="size-3.5" />
                Public URL
              </button>
              <button
                aria-pressed={mode === "excerpt"}
                className={`flex items-center justify-center gap-2 rounded px-3 py-2 text-xs transition-colors ${
                  mode === "excerpt"
                    ? "bg-relay-raised text-relay-text"
                    : "text-relay-muted hover:text-relay-text"
                }`}
                onClick={() => {
                  setMode("excerpt");
                  setError(null);
                  setSuccess(null);
                }}
                type="button"
              >
                <Quote aria-hidden="true" className="size-3.5" />
                Pasted excerpt
              </button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs font-medium text-relay-muted">
                  Signal title
                </span>
                <input
                  className="mt-2 h-10 w-full rounded-md border border-relay-border bg-relay-deep px-3 text-sm placeholder:text-relay-subtle focus:border-relay-accent"
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="What changed?"
                  ref={titleRef}
                  required
                  value={title}
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-relay-muted">
                  Publisher
                </span>
                <input
                  className="mt-2 h-10 w-full rounded-md border border-relay-border bg-relay-deep px-3 text-sm placeholder:text-relay-subtle focus:border-relay-accent"
                  onChange={(event) => setPublisher(event.target.value)}
                  placeholder="Publication or author"
                  required
                  value={publisher}
                />
              </label>
            </div>

            <label className="block">
              <span className="text-xs font-medium text-relay-muted">
                Signal type
              </span>
              <select
                className="mt-2 h-10 w-full rounded-md border border-relay-border bg-relay-deep px-3 text-sm text-relay-text focus:border-relay-accent"
                onChange={(event) =>
                  setSourceKind(event.target.value as SourceKind)
                }
                value={sourceKind}
              >
                <option value="other">Article or research note</option>
                <option value="earnings-release">
                  Official company update
                </option>
                <option value="technical">Technical release</option>
                <option value="paper">Research paper</option>
                <option value="transcript">Interview or transcript</option>
              </select>
            </label>

            {mode === "url" ? (
              <label className="block">
                <span className="flex items-center gap-2 text-xs font-medium text-relay-muted">
                  <Link2 aria-hidden="true" className="size-3.5" />
                  Public article URL
                </span>
                <input
                  className="mt-2 h-10 w-full rounded-md border border-relay-border bg-relay-deep px-3 text-sm placeholder:text-relay-subtle focus:border-relay-accent"
                  onChange={(event) => setSourceUrl(event.target.value)}
                  placeholder="https://…"
                  required
                  type="url"
                  value={sourceUrl}
                />
                <span className="mt-2 block text-[10px] leading-4 text-relay-subtle">
                  Use a public article page. Authenticated or paywalled sources
                  should be added as a permitted excerpt.
                </span>
              </label>
            ) : (
              <label className="block">
                <span className="flex items-center gap-2 text-xs font-medium text-relay-muted">
                  <Quote aria-hidden="true" className="size-3.5" />
                  Source excerpt
                </span>
                <textarea
                  className="mt-2 min-h-52 w-full resize-y rounded-md border border-relay-border bg-relay-deep px-3 py-3 text-sm leading-6 placeholder:text-relay-subtle focus:border-relay-accent"
                  onChange={(event) => setContent(event.target.value)}
                  placeholder="Paste the specific passage that contains the signal…"
                  required
                  value={content}
                />
                <span className="mt-1 block text-right font-mono text-[9px] text-relay-subtle">
                  {content.trim().length} characters
                </span>
              </label>
            )}

            {error ? (
              <div
                className="flex items-start gap-2 rounded-md border border-relay-negative/35 bg-relay-negative/8 px-3 py-2.5 text-xs leading-5 text-relay-negative"
                role="alert"
              >
                <AlertCircle
                  aria-hidden="true"
                  className="mt-0.5 size-3.5 shrink-0"
                />
                <span>
                  <span className="block font-medium">Signal not added</span>
                  <span className="mt-0.5 block">{error}</span>
                </span>
              </div>
            ) : null}
            {success ? (
              <div
                className="rounded-md border border-relay-positive/35 bg-relay-positive/8 px-3 py-3 text-xs leading-5 text-relay-positive"
                role="status"
              >
                <div className="flex items-start gap-2">
                  <Check
                    aria-hidden="true"
                    className="mt-0.5 size-3.5 shrink-0"
                  />
                  <span>
                    <span className="block font-medium">Import complete</span>
                    <span className="mt-0.5 block">{success.message}</span>
                  </span>
                </div>
                {success.updateId ? (
                  <Link
                    className="mt-2 inline-flex items-center gap-1.5 font-medium text-relay-accent hover:text-relay-text"
                    onClick={closeDialog}
                    to={`/signals?update=${encodeURIComponent(success.updateId)}`}
                  >
                    View analyzed signal
                    <ArrowRight aria-hidden="true" className="size-3.5" />
                  </Link>
                ) : null}
              </div>
            ) : null}
          </div>

          <footer className="flex items-center justify-end gap-2 border-t border-relay-border px-5 py-4">
            <Button
              disabled={isSubmitting}
              onClick={closeDialog}
              variant="quiet"
            >
              {success ? "Done" : "Cancel"}
            </Button>
            <Button disabled={isSubmitting} type="submit" variant="primary">
              {isSubmitting ? (
                <LoaderCircle
                  aria-hidden="true"
                  className="size-3.5 animate-spin"
                />
              ) : (
                <Radar aria-hidden="true" className="size-3.5" />
              )}
              {isSubmitting ? "Analyzing signal" : "Add and analyze"}
            </Button>
          </footer>
        </form>
      </section>
    </div>
  );
}
