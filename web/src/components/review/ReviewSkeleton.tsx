'use client';

/**
 * ReviewSkeleton — loading shape matching the composer: back row, order
 * context row, star row, tag chips, text block, footer button.
 */

import { Skeleton } from '@/components/ui/Skeleton';

export function ReviewSkeleton() {
  return (
    <div className="mx-auto max-w-[720px] px-4 py-8 sm:px-6" aria-busy aria-label="Loading review">
      <Skeleton className="h-5 w-40" />
      <Skeleton className="mt-3 h-8 w-32" />
      <div className="mt-6 flex items-center gap-3 border-b border-border-subtle pb-4">
        <Skeleton className="h-12 w-12 rounded-md" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>
      <Skeleton className="mt-6 h-6 w-44" />
      <div className="mt-3 flex gap-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-10 w-10 rounded-full" />
        ))}
      </div>
      <div className="mt-6 flex gap-2">
        <Skeleton className="h-9 w-32 rounded-full" />
        <Skeleton className="h-9 w-28 rounded-full" />
        <Skeleton className="h-9 w-36 rounded-full" />
      </div>
      <Skeleton className="mt-6 h-28 rounded-md" />
      <Skeleton className="mt-6 h-11 rounded-md" />
      <Skeleton className="mt-4 h-[52px] rounded-md" />
    </div>
  );
}
