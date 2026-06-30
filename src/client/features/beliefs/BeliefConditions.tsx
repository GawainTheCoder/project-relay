import {
  ArrowDownRight,
  ArrowUpRight,
  CircleHelp,
} from "lucide-react";

function ConditionList({
  empty,
  items,
  label,
  tone,
}: {
  empty: string;
  items: string[];
  label: string;
  tone: "accent" | "negative" | "positive";
}) {
  const dotClass = {
    accent: "bg-relay-accent",
    negative: "bg-relay-negative",
    positive: "bg-relay-positive",
  }[tone];

  return (
    <section className="min-w-0 p-5 sm:p-6">
      <h3 className="font-mono text-[10px] uppercase tracking-[0.1em] text-relay-muted">
        {label}
      </h3>
      {items.length ? (
        <ul className="mt-4 space-y-3">
          {items.map((item) => (
            <li
              className="flex gap-3 text-sm leading-6 text-relay-muted"
              key={item}
            >
              <span
                aria-hidden="true"
                className={`mt-[11px] size-1.5 shrink-0 rounded-full ${dotClass}`}
              />
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm leading-6 text-relay-subtle">{empty}</p>
      )}
    </section>
  );
}

export function BeliefConditions({
  strengthening,
  unknowns,
  weakening,
}: {
  strengthening: string[];
  unknowns: string[];
  weakening: string[];
}) {
  return (
    <div className="mt-9 space-y-6">
      <section className="border-y border-relay-border py-6">
        <h2 className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.1em] text-relay-muted">
          <CircleHelp aria-hidden="true" className="size-3.5 text-relay-accent" />
          Unknowns
        </h2>
        {unknowns.length ? (
          <ul className="mt-4 grid gap-x-8 gap-y-3 md:grid-cols-2">
            {unknowns.map((unknown) => (
              <li
                className="flex gap-3 text-sm leading-6 text-relay-muted"
                key={unknown}
              >
                <span className="font-mono text-[10px] text-relay-accent">?</span>
                {unknown}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm leading-6 text-relay-subtle">
            No explicit unknowns have been recorded for this thesis yet.
          </p>
        )}
      </section>

      <div className="grid overflow-hidden rounded-md border border-relay-border bg-relay-border md:grid-cols-2 md:gap-px">
        <div className="bg-relay-surface">
          <div className="flex items-center gap-2 border-b border-relay-border px-5 py-3 sm:px-6">
            <ArrowUpRight
              aria-hidden="true"
              className="size-3.5 text-relay-positive"
            />
            <span className="text-xs font-medium">Strengthens this thesis</span>
          </div>
          <ConditionList
            empty="No strengthening conditions recorded."
            items={strengthening}
            label="Future confirmation"
            tone="positive"
          />
        </div>
        <div className="bg-relay-surface">
          <div className="flex items-center gap-2 border-b border-relay-border px-5 py-3 sm:px-6">
            <ArrowDownRight
              aria-hidden="true"
              className="size-3.5 text-relay-negative"
            />
            <span className="text-xs font-medium">Weakens this thesis</span>
          </div>
          <ConditionList
            empty="No weakening conditions recorded."
            items={weakening}
            label="Future disconfirmation"
            tone="negative"
          />
        </div>
      </div>
    </div>
  );
}
