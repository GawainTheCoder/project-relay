export function ConfidenceMeter({
  confidence,
  compact = false,
}: {
  confidence: number;
  compact?: boolean;
}) {
  const value = Math.min(100, Math.max(0, Math.round(confidence)));

  return (
    <div className={compact ? "min-w-28" : "w-full"}>
      <div className="flex items-center justify-between gap-3 font-mono text-[9px] uppercase tracking-[0.08em] text-relay-subtle">
        <span>Confidence</span>
        <span className="text-relay-text">{value}/100</span>
      </div>
      <div
        aria-label={`Confidence ${value} out of 100`}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={value}
        className={`mt-2 overflow-hidden rounded-full bg-relay-border ${
          compact ? "h-1" : "h-1.5"
        }`}
        role="meter"
      >
        <span
          className="block h-full rounded-full bg-relay-accent"
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}
