import {
  Check,
  FileText,
  Link2,
  LoaderCircle,
  X,
} from "lucide-react";
import {
  type FormEvent,
  useEffect,
  useRef,
  useState,
} from "react";

import type { ImportSourceInput } from "../../../shared/contracts";
import { importSource } from "../../lib/api";
import { Button } from "../../components/ui/Button";

interface ImportSourceDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onImported: () => Promise<void>;
}

export function ImportSourceDialog({
  isOpen,
  onClose,
  onImported,
}: ImportSourceDialogProps) {
  const [title, setTitle] = useState("");
  const [publisher, setPublisher] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const frame = window.requestAnimationFrame(() => titleRef.current?.focus());
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
    if (!cleanUrl && cleanContent.length < 20) {
      setError("Add a source URL or at least 20 characters of source text.");
      return;
    }

    const input: ImportSourceInput = {
      title: cleanTitle,
      publisher: cleanPublisher,
      ...(cleanUrl ? { sourceUrl: cleanUrl } : {}),
      ...(cleanContent ? { content: cleanContent } : {}),
    };

    setIsSubmitting(true);
    try {
      const result = await importSource(input);
      setSuccess(
        result.duplicate
          ? "This source was already in Relay. The existing analysis was kept."
          : result.update
            ? "Source imported and analyzed."
            : "Source accepted. Analysis is running in the background.",
      );
      await onImported();
      setTitle("");
      setPublisher("");
      setSourceUrl("");
      setContent("");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "The source could not be imported.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      aria-labelledby="import-source-title"
      aria-modal="true"
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target && !isSubmitting) {
          onClose();
        }
      }}
      role="dialog"
    >
      <section className="relay-scrollbar max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-lg border border-relay-border-strong bg-relay-surface shadow-2xl shadow-black/60">
        <header className="flex items-start justify-between border-b border-relay-border px-5 py-5">
          <div>
            <h2
              className="text-lg font-semibold tracking-tight"
              id="import-source-title"
            >
              Import research
            </h2>
            <p className="mt-1 text-sm text-relay-muted">
              Add a URL or paste research you are authorized to use.
            </p>
          </div>
          <button
            aria-label="Close import"
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
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs font-medium text-relay-muted">
                  Title
                </span>
                <input
                  className="mt-2 h-10 w-full rounded-md border border-relay-border bg-relay-deep px-3 text-sm placeholder:text-relay-subtle focus:border-relay-accent"
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Research title"
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
                  placeholder="Company or author"
                  required
                  value={publisher}
                />
              </label>
            </div>

            <label className="block">
              <span className="flex items-center gap-2 text-xs font-medium text-relay-muted">
                <Link2 aria-hidden="true" className="size-3.5" />
                Source URL
              </span>
              <input
                className="mt-2 h-10 w-full rounded-md border border-relay-border bg-relay-deep px-3 text-sm placeholder:text-relay-subtle focus:border-relay-accent"
                onChange={(event) => setSourceUrl(event.target.value)}
                placeholder="https://…"
                type="url"
                value={sourceUrl}
              />
            </label>

            <div className="flex items-center gap-3 font-mono text-[9px] uppercase tracking-[0.08em] text-relay-subtle">
              <span className="h-px flex-1 bg-relay-border" />
              Or paste text
              <span className="h-px flex-1 bg-relay-border" />
            </div>

            <label className="block">
              <span className="flex items-center gap-2 text-xs font-medium text-relay-muted">
                <FileText aria-hidden="true" className="size-3.5" />
                Source content
              </span>
              <textarea
                className="mt-2 min-h-44 w-full resize-y rounded-md border border-relay-border bg-relay-deep px-3 py-3 text-sm leading-6 placeholder:text-relay-subtle focus:border-relay-accent"
                onChange={(event) => setContent(event.target.value)}
                placeholder="Paste an article, transcript, filing excerpt, or research note…"
                value={content}
              />
              <span className="mt-1 block text-right font-mono text-[9px] text-relay-subtle">
                {content.trim().length} characters
              </span>
            </label>

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
                <FileText aria-hidden="true" className="size-3.5" />
              )}
              {isSubmitting ? "Analyzing source" : "Import and analyze"}
            </Button>
          </footer>
        </form>
      </section>
    </div>
  );
}
