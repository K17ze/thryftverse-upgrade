/**
 * MovePill — 24h move, tinted only when there is a move to show.
 * Neutral em dash when the market has not moved (or data is missing).
 */
export function MovePill({ pct, className = '' }: { pct: number | null; className?: string }) {
  if (pct == null) {
    return <span className={`tnum text-meta text-text-muted ${className}`}>—</span>;
  }
  const up = pct >= 0;
  return (
    <span
      className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-meta font-semibold tnum ${
        up ? 'bg-coown-up-subtle text-coown-up' : 'bg-coown-down-subtle text-coown-down'
      } ${className}`}
    >
      {pct > 0 ? '+' : '−'}
      {Math.abs(pct).toFixed(1)}%
    </span>
  );
}
