'use client';

import React from 'react';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import type { AnalyticsPeriod, Completeness } from '@/lib/api/services/creatorAnalytics';

export const formatRate = (ratio: number) => `${(ratio * 100).toFixed(1)}%`;

export function formatDelta(changeRatio: number | null): string {
  if (changeRatio == null) return '';
  const pct = changeRatio * 100;
  if (pct === 0) return '0%';
  return `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`;
}

export const shortDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });

/** endExclusive is exclusive — the label shows the last included day. */
export function formatDateRange(range: { start: string; endExclusive: string }): string {
  const s = new Date(range.start);
  const e = new Date(range.endExclusive);
  e.setUTCDate(e.getUTCDate() - 1);
  const fmt = (d: Date) =>
    d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  return `${fmt(s)} – ${fmt(e)}`;
}

export function completenessLabel(c: Completeness): string {
  switch (c) {
    case 'complete': return 'Up to date';
    case 'provisional': return 'Provisional';
    case 'delayed': return 'Delayed';
    case 'unavailable': return 'No data yet';
  }
}

export function completenessTone(c: Completeness): string {
  switch (c) {
    case 'complete': return 'text-success-text';
    case 'provisional': return 'text-warning-text';
    case 'delayed': return 'text-warning-text';
    case 'unavailable': return 'text-text-muted';
  }
}

export function entryTypeLabel(t: string): string {
  switch (t) {
    case 'estimated': return 'Estimated';
    case 'earned': return 'Earned';
    case 'held': return 'Held';
    case 'adjustment': return 'Adjustment';
    case 'refund_reversal': return 'Refund';
    case 'chargeback_reversal': return 'Chargeback';
    case 'payout': return 'Payout';
    default: return t;
  }
}

export const SUPPRESSED_DIMENSION_LABELS: Record<string, string> = {
  audience: 'Audience',
};

export const SUPPRESSED_REASON_LABELS: Record<string, string> = {
  insufficient_data: 'hidden until you have more data',
};

export const PERIODS: { key: AnalyticsPeriod; label: string }[] = [
  { key: '7d', label: '7 days' },
  { key: '30d', label: '30 days' },
  { key: '90d', label: '90 days' },
];

/** Flat metric line — label left, value right, hairline separator. */
export function MetricLine({
  label,
  value,
  emphasis,
  last,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  last?: boolean;
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-3 py-3 ${
        last ? '' : 'border-b border-border-subtle'
      }`}
    >
      <span className="text-body text-text-secondary">{label}</span>
      <span
        className={`tnum text-right ${
          emphasis
            ? 'text-body-emphasis font-semibold text-text-primary'
            : 'text-body text-text-primary'
        }`}
      >
        {value}
      </span>
    </div>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-caption font-semibold text-text-secondary">{children}</h2>
  );
}

export function HeroDelta({
  changeRatio,
  onMedia,
}: {
  changeRatio: number | null;
  onMedia?: boolean;
}) {
  const label = formatDelta(changeRatio);
  if (!label) return null;
  const up = changeRatio !== null && changeRatio > 0;
  return (
    <span
      className={`tnum inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-meta font-semibold ${
        onMedia
          ? 'bg-black/35 text-scrim-text-primary'
          : up
            ? 'bg-brand-subtle text-success-text'
            : 'bg-brand-subtle text-danger-text'
      }`}
    >
      <Icon name={up ? 'arrowUp' : 'chevronDown'} size={11} />
      {label}
      <span className="sr-only">{up ? ' up' : ' down'} vs previous period</span>
    </span>
  );
}

export function AnalyticsSkeleton() {
  return (
    <div className="mt-8 space-y-8" aria-busy aria-label="Loading analytics">
      <Skeleton className="h-40 w-full rounded-xl" />
      <div className="space-y-1">
        <Skeleton className="h-4 w-24" />
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
      <Skeleton className="h-44 w-full rounded-md" />
      <div className="space-y-3">
        <Skeleton className="h-4 w-24" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-12 w-12 rounded-md" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
