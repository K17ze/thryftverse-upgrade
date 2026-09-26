/**
 * GalleriaSkeleton — mirrors the real page geometry while the query ticks:
 * full-bleed hero, collection rail, TOC rows, asset grid, archive covers.
 * No invented content — just the silhouettes.
 */

import { Skeleton } from '@/components/ui/Skeleton';

function SectionHeaderSkeleton() {
  return (
    <div className="flex items-baseline gap-3 border-b border-border-subtle pb-4">
      <Skeleton className="h-3 w-20" />
      <Skeleton className="h-5 w-40" />
    </div>
  );
}

export function GalleriaSkeleton() {
  return (
    <div aria-busy aria-label="Loading Galleria" className="pb-20">
      {/* Hero */}
      <Skeleton className="h-[72dvh] min-h-[440px] w-full rounded-none" />

      <div className="mx-auto w-full max-w-[1440px] px-4 sm:px-6">
        {/* Featured collections rail */}
        <div className="mt-14 md:mt-20">
          <SectionHeaderSkeleton />
          <div className="no-scrollbar mt-8 flex gap-4 overflow-hidden">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="w-[72vw] min-w-[240px] max-w-[320px] shrink-0 sm:w-[320px]">
                <Skeleton className="aspect-[4/5] w-full rounded-lg" />
                <div className="mt-2.5 flex items-center gap-2 px-0.5">
                  <Skeleton className="h-5 w-5 rounded-full" />
                  <Skeleton className="h-3 w-28" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Editorial TOC rows */}
        <div className="mt-14 md:mt-20">
          <SectionHeaderSkeleton />
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="flex items-center gap-4 border-b border-border-subtle py-5 last:border-b-0 sm:gap-6 sm:py-6"
            >
              <Skeleton className="h-3 w-7" />
              <Skeleton className="h-16 w-16 shrink-0 rounded-md sm:h-20 sm:w-28" />
              <div className="min-w-0 flex-1">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="mt-2 h-5 w-3/5" />
                <Skeleton className="mt-2 h-4 w-4/5" />
              </div>
            </div>
          ))}
        </div>

        {/* Featured assets grid */}
        <div className="mt-14 md:mt-20">
          <SectionHeaderSkeleton />
          <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-9 md:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i}>
                <Skeleton className="aspect-[4/5] w-full rounded-lg" />
                <Skeleton className="mt-3 h-3 w-16" />
                <Skeleton className="mt-2 h-4 w-4/5" />
                <Skeleton className="mt-2 h-5 w-12" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
