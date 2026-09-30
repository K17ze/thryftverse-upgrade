import React from 'react';
import Link from 'next/link';
import type { NeedsAttentionRow } from '@/lib/hooks/seller-queries';
import { AppImage } from '@/components/ui/AppImage';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatCount } from '@/lib/utils/format';
import { SectionTitle } from './SellerAnalyticsPrimitives';

export function SellerAnalyticsAttentionSection({
  rows,
  isLoading,
}: {
  rows?: NeedsAttentionRow[];
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div
        className="mt-10 space-y-3"
        aria-busy
        aria-label="Loading listings needing attention"
      >
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  if (!rows || rows.length === 0) {
    return null;
  }

  return (
    <section aria-label="Needs attention" className="mt-10">
      <div className="flex items-baseline justify-between gap-3">
        <SectionTitle>Needs attention</SectionTitle>
        <span className="tnum text-meta text-text-muted">
          {rows.length} listing{rows.length === 1 ? '' : 's'}
        </span>
      </div>
      <p className="mt-1 text-meta text-text-muted">
        Active listings under the view floor in this range.
      </p>
      <ul className="mt-3 divide-y divide-border-subtle border-y border-border-subtle">
        {rows.map((row) => (
          <li key={row.listingId}>
            <Link
              href={`/seller-hub/listings/${row.listingId}`}
              className="pressable flex items-center gap-3.5 py-3"
            >
              <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md bg-surface-alt">
                <AppImage
                  src={row.imageUrl}
                  alt={row.title}
                  fill
                  sizes="48px"
                  fallbackIcon="tag"
                />
              </span>
              <span className="min-w-0 flex-1">
                <span className="clamp-1 block text-body-emphasis font-medium text-text-primary">
                  {row.title}
                </span>
                <span
                  className={`tnum mt-0.5 block text-meta ${
                    row.priority === 'high' ? 'text-warning-text' : 'text-text-muted'
                  }`}
                >
                  {formatCount(row.views)} views · {formatCount(row.likes)} likes
                  {row.offers > 0 ? ` · ${formatCount(row.offers)} offers` : ''}
                </span>
              </span>
              <Icon name="forward" size={16} className="shrink-0 text-text-muted" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
