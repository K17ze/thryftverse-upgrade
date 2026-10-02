'use client';

import { Skeleton } from '@/components/ui/Skeleton';

export function BagSkeleton() {
  return (
    <div
      className="mx-auto max-w-[1100px] px-4 py-8 sm:px-6"
      aria-busy
      aria-label="Loading bag"
    >
      <Skeleton className="h-8 w-24" />
      <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* Seller groups — header + hairline-bordered rows, as rendered */}
        <div className="flex flex-col gap-7">
          {Array.from({ length: 2 }).map((_, g) => (
            <div key={g}>
              <Skeleton className="h-4 w-36" />
              <div className="mt-2 divide-y divide-border-subtle border-y border-border-subtle">
                {Array.from({ length: 2 }).map((_, i) => (
                  <div key={i} className="flex items-start gap-3 py-3">
                    <Skeleton className="h-20 w-16 rounded-md" />
                    <div className="flex-1">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="mt-1.5 h-3 w-1/3" />
                      <Skeleton className="mt-2 h-3 w-28" />
                    </div>
                    <Skeleton className="h-4 w-14" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        {/* Ledger — flat lines + CTA, not a fake panel */}
        <div>
          <div className="flex flex-col gap-2.5 border-y border-border-subtle py-5">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex justify-between">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-14" />
              </div>
            ))}
          </div>
          <Skeleton className="mt-4 h-12 rounded-md" />
        </div>
      </div>
    </div>
  );
}
