import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { FailedSourceDocument } from "../../lib/api";
import { FailedIngestionSection } from "./FailedIngestionSection";
import {
  failedIngestionMessage,
  retryInputFor,
} from "./failed-ingestion";

const failedDocument: FailedSourceDocument = {
  id: "document-58abc050-4a5e-45f1-9b64-5c91f13d5944",
  title: "AI infrastructure spending rises",
  publisher: "Bloomberg",
  sourceUrl: "https://example.com/article",
  publishedAt: "2026-07-01T00:00:00.000Z",
  sourceKind: "other",
  errorMessage: "HTTP 403: Are you a robot?",
  ingestedAt: "2026-07-01T10:00:00.000Z",
  attemptCount: 2,
  lastAttemptedAt: "2026-07-01T10:05:00.000Z",
};

describe("FailedIngestionSection", () => {
  it("shows durable provenance and explicit recovery choices", () => {
    const markup = renderToStaticMarkup(
      <FailedIngestionSection
        documents={[failedDocument]}
        error={null}
        isLoading={false}
        onReload={async () => undefined}
        onRetry={async () => ({
          documentId: failedDocument.id,
          duplicate: false,
          status: "analyzed",
        })}
      />,
    );

    expect(markup).toContain("Failed ingestion");
    expect(markup).toContain("Bloomberg");
    expect(markup).toContain("Published Jul 1, 2026");
    expect(markup).toContain("2 attempts");
    expect(markup).toContain("https://example.com/article");
    expect(markup).toContain("Retry URL");
    expect(markup).toContain("Use excerpt");
    expect(markup).toContain(
      "Publisher blocked automated retrieval—paste an excerpt.",
    );
  });

  it("preserves source metadata when retrying with an excerpt", () => {
    expect(
      retryInputFor(
        failedDocument,
        "A permitted excerpt long enough to analyze.",
      ),
    ).toEqual({
      title: failedDocument.title,
      publisher: failedDocument.publisher,
      sourceUrl: failedDocument.sourceUrl,
      publishedAt: failedDocument.publishedAt,
      sourceKind: failedDocument.sourceKind,
      content: "A permitted excerpt long enough to analyze.",
    });
  });

  it("normalizes common publisher-block responses", () => {
    expect(failedIngestionMessage("HTTP 401 from DataDome captcha")).toBe(
      "Publisher blocked automated retrieval—paste an excerpt.",
    );
  });
});
