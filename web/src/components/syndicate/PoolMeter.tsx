/** Funding progress meter — one quiet bar + pct, same grammar as the
 * market rows' allocation meter. */
export function PoolMeter({ pct, className = '' }: { pct: number; className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className}`} role="meter" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-alt">
        <span className="block h-full rounded-full bg-text-primary" style={{ width: `${pct}%` }} />
      </span>
      <span className="w-9 text-right text-meta text-text-secondary tnum">{pct}%</span>
    </div>
  );
}
