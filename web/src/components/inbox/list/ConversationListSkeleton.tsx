'use client';

import { Skeleton } from '@/components/ui/Skeleton';

export function ConversationListSkeleton() {
  return (
    <div className="px-4" aria-busy aria-label="Loading conversations">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 py-[var(--density-row-py)]">
          <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <Skeleton className="h-3.5 w-2/5" />
              <Skeleton className="h-3 w-8" />
            </div>
            <Skeleton className="mt-2 h-3 w-4/5" />
          </div>
          {i % 2 === 0 ? <Skeleton className="h-10 w-10 shrink-0 rounded-md" /> : null}
        </div>
      ))}
    </div>
  );
}
