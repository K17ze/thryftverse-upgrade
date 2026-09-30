'use client';

/**
 * ExchangeSkeleton — loading shimmer skeleton for currency pocket hydration.
 */

import { Skeleton } from '@/components/ui/Skeleton';

export function ExchangeSkeleton() {
  return (
    <div aria-busy aria-label="Loading exchange" className="mx-auto w-full max-w-xl lg:max-w-2xl">
      <div className="flex items-center gap-1 px-2 pt-1 sm:px-4">
        <Skeleton className="h-11 w-11 rounded-full" />
        <Skeleton className="h-7 w-32" />
      </div>
      <div className="px-4 pt-8 sm:px-6">
        <Skeleton className="h-3 w-36" />
        <Skeleton className="mt-3 h-12 w-52" />
        <div className="mt-6 flex gap-2">
          <Skeleton className="h-9 w-16 rounded-md" />
          <Skeleton className="h-9 w-16 rounded-md" />
          <Skeleton className="h-9 w-16 rounded-md" />
        </div>
        <Skeleton className="mt-6 h-24 w-full rounded-lg" />
        <Skeleton className="mt-8 h-[52px] w-full rounded-md" />
      </div>
    </div>
  );
}
