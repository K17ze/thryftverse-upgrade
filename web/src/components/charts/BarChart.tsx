'use client';

/**
 * BarChart — flat horizontal bar rows (AllocationBar grammar scaled up).
 * Real text for labels and values keeps the chart readable to assistive
 * tech without a hidden duplicate summary.
 */

export interface BarChartDatum {
  label: string;
  value: number;
  /** Optional secondary figure after the value (e.g. "3 items"). */
  hint?: string;
}

interface BarChartProps {
  bars: BarChartDatum[];
  formatValue?: (v: number) => string;
  ariaLabel: string;
  /** Shown when bars is empty. */
  emptyLabel?: string;
}

const defaultFormat = (v: number) => v.toLocaleString('en-GB');

export function BarChart({
  bars,
  formatValue = defaultFormat,
  ariaLabel,
  emptyLabel = 'No data for this period',
}: BarChartProps) {
  if (bars.length === 0) {
    return (
      <div className="flex h-24 items-center justify-center rounded-md border border-dashed border-border">
        <p className="text-meta text-text-muted">{emptyLabel}</p>
      </div>
    );
  }

  const max = Math.max(...bars.map((b) => b.value), 1);

  return (
    <ul className="space-y-3" aria-label={ariaLabel} role="list">
      {bars.map((bar) => {
        const widthPct = Math.max(2, (bar.value / max) * 100);
        return (
          <li
            key={bar.label}
            aria-label={`${bar.label}: ${formatValue(bar.value)}${bar.hint ? `, ${bar.hint}` : ''}`}
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="truncate text-body text-text-primary">{bar.label}</span>
              <span className="tnum shrink-0 text-meta text-text-secondary">
                {formatValue(bar.value)}
                {bar.hint ? <span className="text-text-muted"> · {bar.hint}</span> : null}
              </span>
            </div>
            <div
              className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-alt"
              aria-hidden="true"
            >
              <div className="h-full rounded-full bg-brand" style={{ width: `${widthPct}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
