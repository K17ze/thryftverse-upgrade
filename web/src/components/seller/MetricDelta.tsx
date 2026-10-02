'use client';

import { Icon } from '@/components/ui/Icon';

/** MetricDelta — caret + % period change, colored, tabular. Null renders quiet. */

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
      <Icon name={up ? 'deltaUp' : 'deltaDown'} size={10} filled />
      {Math.abs(delta)}%
      <span className="sr-only">{up ? ' up' : ' down'} vs previous period</span>
    </span>
  );
}
