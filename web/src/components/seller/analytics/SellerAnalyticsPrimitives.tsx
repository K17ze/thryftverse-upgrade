import React from 'react';
import type { SellerAnalyticsRange } from '@/lib/hooks/seller-queries';
import { formatCount } from '@/lib/utils/format';

export type AnalyticsPreset = '7d' | '30d' | '90d' | 'custom';

export const isoDay = (d: Date): string => d.toISOString().slice(0, 10);

export function presetRange(preset: Exclude<AnalyticsPreset, 'custom'>): SellerAnalyticsRange {
  const days = preset === '7d' ? 7 : preset === '30d' ? 30 : 90;
  const to = new Date();
  const from = new Date(to.getTime() - (days - 1) * 86_400_000);
  return { from: isoDay(from), to: isoDay(to) };
}

export const shortDate = (iso: string): string =>
  new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });

export function calculateStepPct(num: number | null, den: number | null): number | null {
  return num != null && den != null && den > 0
    ? Math.round((num / den) * 1000) / 10
    : null;
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-section-title font-semibold text-text-primary">{children}</h2>
  );
}

/** Funnel row — bar scaled to the first stage, step % from the stage
 *  above; the honest stage names stay visible. */
export function FunnelRow({
  label,
  value,
  widthPct,
  stepPct,
}: {
  label: string;
  value: number | null;
  widthPct: number;
  stepPct: number | null;
}) {
  return (
    <li>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-body text-text-primary">{label}</span>
        <span className="tnum text-meta text-text-secondary">
          {value != null ? formatCount(value) : '—'}
          {stepPct != null ? (
            <span className="text-text-muted"> · {stepPct}% of stage above</span>
          ) : null}
        </span>
      </div>
      <div className="mt-1 h-1.5 w-full rounded-full bg-surface-alt" aria-hidden="true">
        <div
          className="h-full rounded-full bg-brand"
          style={{ width: `${Math.max(1.5, widthPct)}%` }}
        />
      </div>
    </li>
  );
}
