'use client';

import { Skeleton } from '@/components/ui/Skeleton';

export function SellerHubSkeleton() {
  return (
    <div aria-busy aria-label="Loading seller analytics">
      <Skeleton className="mt-8 h-3 w-28" />
      <Skeleton className="mt-3 h-12 w-48" />
      <div className="mt-6 flex gap-2">
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-8 w-32" />
      </div>
      <Skeleton className="mt-8 h-52 w-full" />
      <div className="mt-8 grid grid-cols-2 gap-px sm:grid-cols-5">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
      <div className="mt-10 space-y-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-3.5">
            <Skeleton className="h-14 w-14 rounded-md" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 w-14" />
          </div>
        ))}
      </div>
    </div>
  );
}
