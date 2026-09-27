import { Skeleton } from '@/components/ui/Skeleton';

/** AssetDetailSkeleton — mirrors the terminal geometry while queries settle. */
export function AssetDetailSkeleton() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-24 pt-6 sm:px-6 md:pt-8" aria-busy="true">
      <Skeleton className="h-5 w-24" />

      <div className="mt-5 flex items-start gap-4">
        <Skeleton className="h-[72px] w-[72px] rounded-lg" />
        <div className="flex-1 space-y-2.5 pt-1">
          <Skeleton className="h-8 w-3/4 max-w-md" />
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </div>

      <div className="mt-8 grid gap-10 lg:grid-cols-12">
        <div className="lg:col-span-7">
          {/* Quote hero + signed move */}
          <Skeleton className="h-8 w-44" />
          <Skeleton className="mt-2 h-4 w-32" />
          {/* Details strip */}
          <div
            className="mt-5 flex gap-8 border-y border-border-subtle py-3.5"
            aria-hidden="true"
          >
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="space-y-1.5">
                <Skeleton className="h-3 w-12" />
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>
          <Skeleton className="mt-3 h-3 w-64" />
          <Skeleton className="mt-5 h-9 w-56 rounded-full" />
          <Skeleton className="mt-4 h-[260px] w-full rounded-lg" />
          {/* Order book — tab row + ladder rows */}
          <div className="mt-10 flex gap-5 border-b border-border-subtle pb-2" aria-hidden="true">
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-4 w-14" />
          </div>
          <div className="mt-3 space-y-1.5" aria-hidden="true">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-9 w-full rounded-sm" />
            ))}
          </div>
        </div>

        <div className="lg:col-span-5">
          <Skeleton className="h-11 w-full rounded-md" />
          <Skeleton className="mt-4 h-10 w-full rounded-full" />
          <Skeleton className="mt-4 h-11 w-full rounded-lg" />
          <div className="mt-6 space-y-2.5 border-t border-border-subtle pt-5" aria-hidden="true">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-4 w-full" />
            ))}
          </div>
          <Skeleton className="mt-6 h-[52px] w-full rounded-md" />
        </div>
      </div>
    </div>
  );
}
