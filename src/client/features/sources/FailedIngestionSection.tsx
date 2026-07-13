import {
  AlertCircle,
  Check,
  ExternalLink,
  LoaderCircle,
  Quote,
  RefreshCw,
} from "lucide-react";
import {
  type FormEvent,
  useState,
} from "react";

import { Button } from "../../components/ui/Button";
import {
  type FailedSourceDocument,
  type ImportSourceResult,
  type RetryFailedSourceDocumentInput,
} from "../../lib/api";
import {
  failedIngestionMessage,
  formatFailedDocumentDate,
  retryInputFor,
} from "./failed-ingestion";

interface FailedIngestionSectionProps {
  documents: FailedSourceDocument[];
  error: string | null;
  isLoading: boolean;
  onReload: () => Promise<void>;
  onRetry: (
    documentId: string,
    input: RetryFailedSourceDocumentInput,
  ) => Promise<ImportSourceResult>;
}

interface RecoveryFeedback {
  documentId: string;
  kind: "error" | "success";
  message: string;
}

export function FailedIngestionSection({
  documents,
  error,
  isLoading,
  onReload,
  onRetry,
}: FailedIngestionSectionProps) {
  const [excerptDocumentId, setExcerptDocumentId] = useState<string | null>(
    null,
  );
  const [excerpt, setExcerpt] = useState("");
  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<RecoveryFeedback | null>(null);

  if (!isLoading && !error && documents.length === 0) {
    return null;
  }

  const retryDocument = async (
    document: FailedSourceDocument,
    content?: string,
  ) => {
    setActiveDocumentId(document.id);
    setFeedback(null);
    try {
      const result = await onRetry(
        document.id,
        retryInputFor(document, content),
      );
      setFeedback({
        documentId: document.id,
        kind: "success",
        message: result.duplicate
          ? "This signal is already tracked."
          : result.update
            ? "Signal recovered and analyzed."
            : "Recovery accepted; analysis is pending.",
      });
      setExcerptDocumentId(null);
      setExcerpt("");
      await onReload();
    } catch (caughtError) {
      setFeedback({
        documentId: document.id,
        kind: "error",
        message:
          caughtError instanceof Error
            ? caughtError.message
            : "The signal could not be recovered.",
      });
    } finally {
      setActiveDocumentId(null);
    }
  };

  const submitExcerpt = (
    event: FormEvent,
    document: FailedSourceDocument,
  ) => {
    event.preventDefault();
    const content = excerpt.trim();
    if (content.length < 20) {
      setFeedback({
        documentId: document.id,
        kind: "error",
        message: "Paste at least 20 characters from the source.",
      });
      return;
    }
    void retryDocument(document, content);
  };

  return (
    <section
      aria-labelledby="failed-ingestion-title"
      className="mt-7 overflow-hidden rounded-md border border-relay-negative/30 bg-relay-surface"
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-relay-border px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold" id="failed-ingestion-title">
            Failed ingestion
          </h2>
          <p className="mt-1 text-xs text-relay-muted">
            Recover failed signals explicitly. Relay never bypasses publisher
            protections.
          </p>
        </div>
        {error ? (
          <Button
            disabled={isLoading}
            onClick={() => void onReload()}
            variant="quiet"
          >
            <RefreshCw aria-hidden="true" className="size-3.5" />
            Reload
          </Button>
        ) : null}
      </header>

      {isLoading ? (
        <div
          className="flex items-center gap-2 px-4 py-4 text-xs text-relay-muted"
          role="status"
        >
          <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin" />
          Checking failed signals
        </div>
      ) : error ? (
        <div
          className="flex items-start gap-2 px-4 py-4 text-xs text-relay-negative"
          role="alert"
        >
          <AlertCircle
            aria-hidden="true"
            className="mt-0.5 size-3.5 shrink-0"
          />
          {error}
        </div>
      ) : (
        <ul className="divide-y divide-relay-border">
          {documents.map((document) => {
            const isActive = activeDocumentId === document.id;
            const isExcerptOpen = excerptDocumentId === document.id;
            const documentFeedback =
              feedback?.documentId === document.id ? feedback : null;
            return (
              <li className="px-4 py-4" key={document.id}>
                <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{document.title}</p>
                    <p className="mt-1 text-xs text-relay-muted">
                      {document.publisher} · Published{" "}
                      {formatFailedDocumentDate(document.publishedAt)} ·{" "}
                      {document.attemptCount}{" "}
                      {document.attemptCount === 1 ? "attempt" : "attempts"}
                    </p>
                    {document.sourceUrl ? (
                      <a
                        className="mt-2 inline-flex max-w-full items-center gap-1.5 text-xs text-relay-accent hover:text-relay-text"
                        href={document.sourceUrl}
                        rel="noreferrer"
                        target="_blank"
                      >
                        <span className="truncate">{document.sourceUrl}</span>
                        <ExternalLink
                          aria-hidden="true"
                          className="size-3 shrink-0"
                        />
                      </a>
                    ) : (
                      <p className="mt-2 text-xs text-relay-subtle">
                        No original URL recorded
                      </p>
                    )}
                    <p className="mt-2 flex items-start gap-1.5 text-xs leading-5 text-relay-negative">
                      <AlertCircle
                        aria-hidden="true"
                        className="mt-0.5 size-3.5 shrink-0"
                      />
                      {failedIngestionMessage(document.errorMessage)}
                    </p>
                    <p className="mt-1 text-[10px] text-relay-subtle">
                      Last attempted{" "}
                      {formatFailedDocumentDate(document.lastAttemptedAt)}
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Button
                      disabled={isActive || !document.sourceUrl}
                      onClick={() => void retryDocument(document)}
                      variant="quiet"
                    >
                      {isActive && !isExcerptOpen ? (
                        <LoaderCircle
                          aria-hidden="true"
                          className="size-3.5 animate-spin"
                        />
                      ) : (
                        <RefreshCw aria-hidden="true" className="size-3.5" />
                      )}
                      Retry URL
                    </Button>
                    <Button
                      disabled={isActive}
                      onClick={() => {
                        setExcerptDocumentId(
                          isExcerptOpen ? null : document.id,
                        );
                        setExcerpt("");
                        setFeedback(null);
                      }}
                      variant="primary"
                    >
                      <Quote aria-hidden="true" className="size-3.5" />
                      {isExcerptOpen ? "Cancel excerpt" : "Use excerpt"}
                    </Button>
                  </div>
                </div>

                {isExcerptOpen ? (
                  <form
                    className="mt-4 rounded-md border border-relay-border bg-relay-deep p-3"
                    onSubmit={(event) => submitExcerpt(event, document)}
                  >
                    <label className="block">
                      <span className="text-xs font-medium text-relay-muted">
                        Permitted source excerpt
                      </span>
                      <textarea
                        className="mt-2 min-h-32 w-full resize-y rounded-md border border-relay-border bg-relay-surface px-3 py-2 text-sm leading-6 placeholder:text-relay-subtle focus:border-relay-accent"
                        onChange={(event) => setExcerpt(event.target.value)}
                        placeholder="Paste the specific passage that contains the signal…"
                        required
                        value={excerpt}
                      />
                    </label>
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                      <p className="text-[10px] leading-4 text-relay-subtle">
                        The original URL and publication date stay attached as
                        provenance. Relay analyzes only the text you provide.
                      </p>
                      <Button
                        disabled={isActive}
                        type="submit"
                        variant="primary"
                      >
                        {isActive ? (
                          <LoaderCircle
                            aria-hidden="true"
                            className="size-3.5 animate-spin"
                          />
                        ) : (
                          <Quote aria-hidden="true" className="size-3.5" />
                        )}
                        Analyze excerpt
                      </Button>
                    </div>
                  </form>
                ) : null}

                {documentFeedback ? (
                  <div
                    className={`mt-3 flex items-start gap-2 text-xs ${
                      documentFeedback.kind === "success"
                        ? "text-relay-positive"
                        : "text-relay-negative"
                    }`}
                    role={
                      documentFeedback.kind === "success" ? "status" : "alert"
                    }
                  >
                    {documentFeedback.kind === "success" ? (
                      <Check aria-hidden="true" className="size-3.5 shrink-0" />
                    ) : (
                      <AlertCircle
                        aria-hidden="true"
                        className="size-3.5 shrink-0"
                      />
                    )}
                    {documentFeedback.message}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
