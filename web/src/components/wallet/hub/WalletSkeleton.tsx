'use client';

import { Skeleton } from '@/components/ui/Skeleton';

export function WalletSkeleton() {
  return (
    <div aria-busy aria-label="Loading wallet">
      <div className="lg:grid lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] lg:gap-x-12 xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] xl:gap-x-16">
        <div>
          <div className="px-4 pt-8 sm:px-6 md:pt-12">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="mt-4 h-12 w-56" />
            <Skeleton className="mt-4 h-5 w-72" />
            <div className="mt-6 grid grid-cols-3 gap-2">
              <Skeleton className="h-11" />
              <Skeleton className="h-11" />
              <Skeleton className="h-11" />
            </div>
          </div>
          <div className="mt-8 px-4 sm:px-6">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="mt-3 h-16 w-full" />
          </div>
          <div className="mt-8 px-4 sm:px-6">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-3 h-20 w-full" />
          </div>
        </div>
        <div className="mt-12 lg:mt-12">
          <div className="flex items-center justify-between px-4 sm:px-6">
            <Skeleton className="h-6 w-36" />
            <Skeleton className="h-4 w-16" />
          </div>
          <div className="mt-4 flex gap-2 px-4 sm:px-6">
            <Skeleton className="h-8 w-16 rounded-full" />
            <Skeleton className="h-8 w-20 rounded-full" />
            <Skeleton className="h-8 w-20 rounded-full" />
          </div>
          <div className="mt-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3.5 border-b border-border-subtle py-4">
                <Skeleton className="ml-4 h-9 w-9 rounded-full sm:ml-6" />
                <Skeleton className="h-4 flex-1" style={{ maxWidth: `${55 - i * 8}%` }} />
                <Skeleton className="mr-4 h-4 w-16 sm:mr-6" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
