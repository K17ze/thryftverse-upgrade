'use client';

/**
 * ChartTooltip — the shared readout chrome for SVG charts. Anchored by a
 * percentage so callers can clamp inside the plot bounds; purely
 * presentational, pointer-transparent.
 */

import type { ReactNode } from 'react';

interface ChartTooltipProps {
  /** Horizontal anchor as a 0–100 percentage of the chart width. */
  leftPct: number;
  children: ReactNode;
}

export function ChartTooltip({ leftPct, children }: ChartTooltipProps) {
  return (
    <div
      className="pointer-events-none absolute top-0 z-elevated -translate-x-1/2 rounded-md border border-border bg-surface-elevated px-2.5 py-1.5 shadow-subtle"
      style={{ left: `${Math.min(86, Math.max(14, leftPct))}%` }}
    >
      {children}
    </div>
  );
}
