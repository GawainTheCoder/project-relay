import type {
  PortfolioDecisionAction,
  ThesisReview,
} from "../../../shared/contracts";

export interface PortfolioDecisionDraft {
  action: PortfolioDecisionAction | null;
  rationale: string;
}

const holdingActions: PortfolioDecisionAction[] = [
  "add",
  "hold",
  "reduce",
  "sell",
];
const watchlistActions: PortfolioDecisionAction[] = ["buy", "hold"];

export function PortfolioDecisionFieldset({
  disabled,
  item,
  onChange,
  value,
}: {
  disabled: boolean;
  item: ThesisReview["affectedPortfolioItems"][number];
  onChange: (next: PortfolioDecisionDraft) => void;
  value: PortfolioDecisionDraft;
}) {
  const actions: Array<PortfolioDecisionAction | null> =
    item.status === "holding" ? holdingActions : [null, ...watchlistActions];
  const descriptionId = `decision-description-${item.id}`;

  return (
    <fieldset
      className="rounded-lg border border-relay-border bg-relay-deep p-4"
      disabled={disabled}
    >
      <legend className="px-1 text-sm font-semibold">
        {item.symbol ?? item.name}
        {item.symbol ? (
          <span className="ml-2 font-normal text-relay-muted">{item.name}</span>
        ) : null}
      </legend>
      <p className="mt-1 text-xs leading-5 text-relay-muted" id={descriptionId}>
        {item.status === "holding"
          ? `${item.allocationPercent?.toFixed(0) ?? "—"}% current allocation`
          : "Future candidate"}
      </p>

      <div
        aria-describedby={descriptionId}
        className="mt-3 flex flex-wrap gap-2"
      >
        {actions.map((action) => (
          <label className="cursor-pointer" key={action ?? "none"}>
            <input
              checked={value.action === action}
              className="peer sr-only"
              name={`portfolio-decision-${item.id}`}
              onChange={() => onChange({ ...value, action })}
              type="radio"
              value={action ?? ""}
            />
            <span className="inline-flex min-h-11 items-center rounded-md border border-relay-control bg-relay-surface px-3 text-sm capitalize text-relay-muted transition-colors peer-checked:border-relay-accent peer-checked:bg-relay-accent/10 peer-checked:text-relay-accent peer-focus-visible:ring-2 peer-focus-visible:ring-relay-accent peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-relay-bg peer-disabled:cursor-not-allowed peer-disabled:opacity-45">
              {action ?? "No action"}
            </span>
          </label>
        ))}
      </div>

      <label className="mt-4 block">
        <span className="text-xs font-medium text-relay-muted">
          Decision rationale
        </span>
        <textarea
          className="mt-2 min-h-24 w-full resize-y rounded-md border border-relay-control bg-relay-surface px-3 py-2.5 text-sm leading-6 text-relay-text placeholder:text-relay-subtle disabled:cursor-not-allowed disabled:opacity-45"
          disabled={disabled || value.action === null}
          onChange={(event) =>
            onChange({ ...value, rationale: event.target.value })
          }
          placeholder="Why is this the right action at the current allocation?"
          value={value.rationale}
        />
      </label>
    </fieldset>
  );
}
