'use client';

import { Skeleton } from '@/components/ui/Skeleton';

export function SectionHeader({ title, meta }: { title: string; meta?: string }) {
  return (
    <div className="mb-3 flex items-baseline justify-between">
      <h2 className="text-section-title font-semibold text-text-primary">{title}</h2>
      {meta ? <span className="tnum text-meta text-text-muted">{meta}</span> : null}
    </div>
  );
}

export function LiveSkeleton() {
  return (
    <div className="space-y-10" aria-busy aria-label="Loading live shopping">
      <div>
        <Skeleton className="mb-3 h-6 w-28" />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,8fr)_minmax(0,5fr)] lg:gap-8">
          <Skeleton className="aspect-[4/3] w-full rounded-xl sm:aspect-[16/9] lg:max-h-[560px]" />
          <div className="hidden lg:block">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3 py-2.5">
                <Skeleton className="h-14 w-[84px] shrink-0 rounded-md" />
                <div className="min-w-0 flex-1">
                  <Skeleton className="h-4 w-4/5" />
                  <Skeleton className="mt-2 h-3 w-2/5" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div>
        <Skeleton className="mb-3 h-6 w-32" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {[0, 1, 2, 3].map((i) => (
            <div key={i}>
              <Skeleton className="aspect-[4/5] w-full rounded-lg" />
              <Skeleton className="mt-2.5 h-4 w-4/5" />
              <Skeleton className="mt-2 h-3 w-2/5" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
