import {
  ArrowDownRight,
  ArrowUpRight,
  CircleMinus,
  Dot,
} from "lucide-react";

import type {
  Materiality,
  Sentiment,
} from "../../../shared/contracts";
import { titleCase } from "../../lib/format";

export function SentimentBadge({ sentiment }: { sentiment: Sentiment }) {
  const styles: Record<Sentiment, string> = {
    bullish: "text-relay-positive border-relay-positive/25 bg-relay-positive/8",
    bearish: "text-relay-negative border-relay-negative/25 bg-relay-negative/8",
    neutral: "text-relay-warning border-relay-warning/25 bg-relay-warning/8",
    "not-material":
      "text-relay-muted border-relay-border bg-relay-surface-2",
  };
  const Icon =
    sentiment === "bullish"
      ? ArrowUpRight
      : sentiment === "bearish"
        ? ArrowDownRight
        : sentiment === "neutral"
          ? Dot
          : CircleMinus;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.08em] ${styles[sentiment]}`}
    >
      <Icon aria-hidden="true" className="size-3" strokeWidth={2} />
      {titleCase(sentiment)}
    </span>
  );
}

export function MaterialityBadge({
  materiality,
}: {
  materiality: Materiality;
}) {
  const styles: Record<Materiality, string> = {
    high: "text-relay-warning border-relay-warning/25 bg-relay-warning/8",
    medium: "text-relay-accent border-relay-accent/25 bg-relay-accent/8",
    low: "text-relay-muted border-relay-border bg-relay-surface-2",
    "not-material":
      "text-relay-subtle border-relay-border bg-relay-surface-2",
  };

  return (
    <span
      className={`inline-flex items-center rounded border px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.08em] ${styles[materiality]}`}
    >
      {titleCase(materiality)}
    </span>
  );
}
