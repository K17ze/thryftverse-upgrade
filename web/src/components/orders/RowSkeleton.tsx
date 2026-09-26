'use client';

/**
 * Shared list-row skeleton — orders and offers load against the same
 * geometry: thumb, title, meta + caption lines, then status badge, price
 * and chevron on the right, separated by the hairlines the real list uses.
 */

import { Skeleton } from '@/components/ui/Skeleton';

export function RowSkeleton({ count = 5 }: { count?: number }) {
  return (
    <ul
      className="divide-y divide-border-subtle border-y border-border-subtle"
      aria-busy
      aria-label="Loading"
    >
      {Array.from({ length: count }).map((_, i) => (
        <li key={i} className="flex items-center gap-3 py-4 sm:gap-4">
          <Skeleton className="h-[70px] w-14 shrink-0 rounded-md" />
          <div className="min-w-0 flex-1">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="mt-2 h-3 w-1/3" />
            <Skeleton className="mt-1.5 h-3 w-24" />
          </div>
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-4 w-4 rounded-sm" />
        </li>
      ))}
    </ul>
  );
}
