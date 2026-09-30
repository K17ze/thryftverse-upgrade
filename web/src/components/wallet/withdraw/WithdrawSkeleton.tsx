'use client';

/**
 * WithdrawSkeleton — loading shimmer skeleton for wallet withdrawal surface.
 */

import { Skeleton } from '@/components/ui/Skeleton';

export function WithdrawSkeleton() {
  return (
    <div aria-busy aria-label="Loading withdraw" className="mx-auto w-full max-w-xl lg:max-w-2xl">
      <div className="flex items-center gap-1 px-2 pt-1 sm:px-4">
        <Skeleton className="h-11 w-11 rounded-full" />
        <Skeleton className="h-7 w-40" />
      </div>
      <div className="px-4 pt-8 sm:px-6">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="mt-4 h-16 w-full rounded-lg" />
        <Skeleton className="mt-4 h-9 w-48 rounded-full" />
      </div>
      <div className="mt-10 px-4 sm:px-6">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="mt-3 h-[52px] w-full" />
        <Skeleton className="mt-px h-[52px] w-full" />
      </div>
    </div>
  );
}
