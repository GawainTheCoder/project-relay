import { AlertCircle, RefreshCw } from "lucide-react";

import { Button } from "./Button";

export function PageLoading({ label = "Loading intelligence" }: { label?: string }) {
  return (
    <div
      aria-live="polite"
      className="grid min-h-[60vh] place-items-center px-6"
      role="status"
    >
      <div className="flex items-center gap-3 text-sm text-relay-muted">
        <span className="size-2 animate-pulse rounded-full bg-relay-accent" />
        {label}
      </div>
    </div>
  );
}

export function PageError({
  error,
  onRetry,
}: {
  error: string;
  onRetry: () => void;
}) {
  return (
    <div className="grid min-h-[60vh] place-items-center px-6">
      <section className="max-w-md border-l border-relay-negative pl-5">
        <AlertCircle
          aria-hidden="true"
          className="mb-4 size-5 text-relay-negative"
        />
        <h1 className="text-xl font-semibold tracking-tight">
          Relay could not load the workspace
        </h1>
        <p className="mt-2 text-sm leading-6 text-relay-muted">{error}</p>
        <Button className="mt-5" onClick={onRetry}>
          <RefreshCw aria-hidden="true" className="size-3.5" />
          Try again
        </Button>
      </section>
    </div>
  );
}

export function EmptyState({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <div className="grid min-h-48 place-items-center border-y border-relay-border px-6 text-center">
      <div className="max-w-sm">
        <h2 className="text-sm font-medium text-relay-text">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-relay-muted">{body}</p>
      </div>
    </div>
  );
}
