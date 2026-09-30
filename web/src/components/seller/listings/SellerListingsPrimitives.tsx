'use client';

import { Skeleton } from '@/components/ui/Skeleton';
import type { ListingStatusFilter } from '@/components/seller/listingManagementModel';
import { bulkReasonCopy } from '@/components/seller/listingManagementModel';
import type { BulkActionResult } from '@/lib/hooks/seller-queries';

export const EMPTY_COPY: Record<Exclude<ListingStatusFilter, 'all'>, { title: string; subtitle: string }> = {
  active: {
    title: 'No active listings',
    subtitle: 'Everything you have live will show here.',
  },
  paused: {
    title: 'Nothing paused',
    subtitle: 'Paused listings stay yours — buyers can’t see or buy them until you resume.',
  },
  sold: {
    title: 'Nothing sold yet',
    subtitle: 'Sold pieces land here — keep listings fresh to move them.',
  },
  draft: {
    title: 'No drafts saved',
    subtitle: 'Half-finished listings you save in the sell flow wait here.',
  },
};

export function ListingsSkeleton() {
  return (
    <ul
      className="divide-y divide-border-subtle border-y border-border-subtle"
      aria-busy
      aria-label="Loading listings"
    >
      {[0, 1, 2].map((i) => (
        <li key={i} className="flex items-center gap-3.5 py-3">
          <Skeleton className="h-14 w-14 rounded-md" />
          <div className="min-w-0 flex-1">
            <Skeleton className="h-4 w-44" />
            <Skeleton className="mt-1.5 h-3 w-32" />
          </div>
          <Skeleton className="hidden h-4 w-20 sm:block" />
          <Skeleton className="h-8 w-24" />
        </li>
      ))}
    </ul>
  );
}

/** Per-item receipt rollup — "Paused 2 · 1 skipped (already sold)". The
 *  batch command's honest vocabulary, compressed for a toast. */
export function receiptSummary(verb: string, result: BulkActionResult): string {
  const applied = result.results.filter((r) => r.state === 'applied').length;
  const rejected = result.results.filter((r) => r.state !== 'applied');
  if (!rejected.length) return `${verb} ${applied}`;
  const reasons = [...new Set(rejected.map((r) => bulkReasonCopy(r.reason)))].join(', ');
  return `${verb} ${applied} · ${rejected.length} skipped (${reasons})`;
}
