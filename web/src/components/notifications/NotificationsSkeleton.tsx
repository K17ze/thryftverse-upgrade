'use client';

/**
 * NotificationsSkeleton — row shapes matching the final layout:
 * leading visual, text line, right-aligned time.
 */

import { Skeleton } from '@/components/ui/Skeleton';

export function NotificationsSkeleton() {
  return (
    <div className="mt-6" aria-busy aria-label="Loading notifications">
      <Skeleton className="h-3 w-16" />
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="mt-1 flex items-start gap-3 px-2 py-3">
          <Skeleton className={`h-11 w-11 shrink-0 ${i === 2 || i === 4 ? 'rounded-full' : 'rounded-md'}`} />
          <div className="min-w-0 flex-1">
            <Skeleton className="h-3.5 w-4/5" />
            <Skeleton className="mt-1.5 h-3 w-1/2" />
          </div>
          <Skeleton className="h-3 w-8" />
        </div>
      ))}
    </div>
  );
}
