'use client';

/**
 * PdpSkeleton — loading state matching the PDP layout: breadcrumb, media
 * stage left, evidence column below it, buy panel pinned right. No
 * spinners — geometry stands in.
 */

import { Skeleton } from '@/components/ui/Skeleton';

export function PdpSkeleton() {
  return (
    <div className="mx-auto max-w-[1280px]" aria-busy aria-label="Loading item">
      {/* Breadcrumb — desktop only, like the populated state */}
      <div className="hidden px-4 pt-4 sm:px-6 lg:block">
        <Skeleton className="h-3 w-48" />
      </div>

      <div className="grid gap-6 px-4 py-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-x-10 lg:gap-y-8">
        {/* Media stage */}
        <div className="flex gap-3 lg:col-start-1 lg:row-start-1">
          <div className="hidden w-[72px] shrink-0 flex-col gap-2 lg:flex">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="aspect-[0.8] w-full rounded-md" />
            ))}
          </div>
          <Skeleton className="aspect-[0.8] min-w-0 flex-1 rounded-xl lg:max-h-[75vh]" />
        </div>

        {/* Buy column — identity, price, facts, seller, CTAs, shipping */}
        <div className="flex flex-col gap-4 lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-7 w-4/5" />
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-4 w-44" />
          <div className="border-y border-border-subtle py-4">
            <div className="grid grid-cols-3 gap-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-8" />
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Skeleton className="h-11 w-11 rounded-full" />
            <div className="flex-1">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="mt-1.5 h-3 w-24" />
            </div>
          </div>
          <Skeleton className="h-[52px] rounded-md" />
          <Skeleton className="h-11 rounded-md" />
          {/* Shipping + protection, matching the buy column */}
          <div className="flex flex-col gap-2 border-t border-border-subtle pt-4">
            <Skeleton className="h-3.5 w-3/4" />
            <Skeleton className="h-3.5 w-2/5" />
          </div>
        </div>

        {/* Evidence column — specifics ledger + a review row */}
        <div className="flex flex-col gap-2.5 lg:col-start-1 lg:row-start-2">
          <Skeleton className="h-5 w-36" />
          <div className="grid grid-cols-1 gap-y-2.5 sm:grid-cols-2 sm:gap-x-10">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex justify-between border-b border-border-subtle pb-2.5">
                <Skeleton className="h-3.5 w-16" />
                <Skeleton className="h-3.5 w-24" />
              </div>
            ))}
          </div>
          <Skeleton className="mt-3 h-3.5 w-full" />
          <Skeleton className="h-3.5 w-4/5" />
        </div>
      </div>
    </div>
  );
}
