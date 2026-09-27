'use client';

/** MetricDelta — ▲/▼ period change, colored, tabular. Null renders quiet. */

export function MetricDelta({ delta }: { delta: number | null }) {
  if (delta == null || delta === 0) {
    return <span className="tnum text-meta text-text-muted">—</span>;
  }
  const up = delta > 0;
  return (
    <span
      className={`tnum inline-flex items-center gap-0.5 text-meta font-semibold ${
        up ? 'text-success-text' : 'text-danger-text'
      }`}
    >
      <span aria-hidden="true">{up ? '▲' : '▼'}</span>
      {Math.abs(delta)}%
      <span className="sr-only">{up ? ' up' : ' down'} vs previous period</span>
    </span>
  );
}
