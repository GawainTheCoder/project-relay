import { Minus, TrendingDown, TrendingUp } from "lucide-react";

import type { ThesisMomentum } from "../../../shared/contracts";

const styles: Record<ThesisMomentum, string> = {
  strengthening:
    "border-relay-positive/35 bg-relay-positive/8 text-relay-positive",
  unchanged: "border-relay-control bg-relay-surface-2 text-relay-muted",
  weakening:
    "border-relay-negative/35 bg-relay-negative/8 text-relay-negative",
};

export function ThesisMomentumBadge({
  momentum,
}: {
  momentum: ThesisMomentum;
}) {
  const Icon =
    momentum === "strengthening"
      ? TrendingUp
      : momentum === "weakening"
        ? TrendingDown
        : Minus;

  return (
    <span
      className={`inline-flex min-h-7 items-center gap-1.5 rounded-md border px-2 text-xs font-medium capitalize ${styles[momentum]}`}
    >
      <Icon aria-hidden="true" className="size-3.5" />
      {momentum}
    </span>
  );
}
