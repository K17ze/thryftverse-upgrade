'use client';

/**
 * OrderDetailSkeleton — mirrors the detail layout: status header, the
 * purchase-summary box (item row, fee lines, order-number row), a banner
 * slot, the milestone trail, support rows and the action pair. Extracted
 * from the page so the loading shape tracks the real composition.
 */

import { Skeleton } from '@/components/ui/Skeleton';

export function OrderDetailSkeleton() {
  return (
    <div className="mx-auto max-w-[720px] px-4 py-8 sm:px-6" aria-busy aria-label="Loading order">
      {/* Header */}
      <Skeleton className="h-5 w-40" />
      <Skeleton className="mt-3 h-8 w-56" />
      <Skeleton className="mt-2 h-4 w-32" />

      {/* Purchase summary — item row, fee lines, order-number row */}
      <div className="mt-6 border-y border-border-subtle py-4">
        <Skeleton className="h-4 w-36" />
        <div className="mt-3 flex items-center gap-3">
          <Skeleton className="h-20 w-16 rounded-md" />
          <div className="flex-1">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="mt-1.5 h-3 w-1/3" />
          </div>
          <Skeleton className="h-4 w-14" />
        </div>
        <div className="mt-3 flex flex-col gap-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="flex justify-between">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-14" />
            </div>
          ))}
          <div className="mt-1 flex justify-between border-t border-border-subtle pt-3">
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-6 w-20" />
          </div>
        </div>
        <div className="mt-3 flex justify-between border-t border-border-subtle pt-3">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>

      {/* Banner + timeline + support + actions, as composed */}
      <div className="mt-4 flex flex-col gap-5">
        <Skeleton className="h-14 rounded-lg" />
        <Skeleton className="h-44 rounded-lg" />
        <Skeleton className="h-16 rounded-md" />
      </div>
    </div>
  );
}
