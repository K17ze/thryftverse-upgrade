/**
 * SellerAuctionSkeleton — loading rows at the SellerAuctionRow rhythm:
 * 96px media frame, title + state line, hairline, price and meta lines.
 * Port of the mobile SellerAuctionEmptyState loading branch.
 */

import { Skeleton } from '@/components/ui/Skeleton';

export function SellerAuctionSkeleton({ count = 4 }: { count?: number }) {
  return (
    <ul
      className="divide-y divide-border-subtle border-y border-border-subtle"
      aria-busy
      aria-label="Loading your auctions"
    >
      {Array.from({ length: count }).map((_, i) => (
        <li key={i} className="flex items-start gap-4 py-3">
          <Skeleton className="h-24 w-24 shrink-0 rounded-md" />
          <div className="flex min-h-24 min-w-0 flex-1 flex-col">
            <div className="flex items-start justify-between gap-3">
              <Skeleton className="h-4 w-3/5" />
              <Skeleton className="h-3 w-12" />
            </div>
            <Skeleton className="mt-2 h-3 w-24" />
            <div className="mt-auto">
              <div className="my-2.5 h-px bg-border-subtle" aria-hidden="true" />
              <Skeleton className="h-5 w-28" />
              <Skeleton className="mt-2 h-3 w-32" />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
