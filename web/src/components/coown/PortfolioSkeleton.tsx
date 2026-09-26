import { Skeleton } from '@/components/ui/Skeleton';

/** Portfolio skeleton — mirrors summary, positions and orders geometry. */
export function PortfolioSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading portfolio">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <Skeleton className="h-9 w-44" />
        <Skeleton className="h-5 w-24" />
      </div>

      <div className="mt-8 border-b border-border-subtle pb-8" aria-hidden="true">
        <Skeleton className="h-10 w-52" />
        <Skeleton className="mt-2 h-4 w-32" />
        <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-5 border-t border-border-subtle pt-5 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i}>
              <Skeleton className="h-2.5 w-20" />
              <Skeleton className="mt-2 h-4 w-24" />
            </div>
          ))}
        </div>
        <Skeleton className="mt-6 h-2 w-full rounded-full" />
        <div className="mt-3 flex gap-4">
          <Skeleton className="h-3 w-36" />
          <Skeleton className="h-3 w-28" />
        </div>
      </div>

      <div className="mt-10">
        <Skeleton className="h-6 w-28" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 border-b border-border-subtle py-4">
            <Skeleton className="h-10 w-10 shrink-0 rounded-lg" />
            <Skeleton className="h-4 flex-1" style={{ maxWidth: `${44 - i * 8}%` }} />
            <Skeleton className="h-4 w-14" />
            <Skeleton className="hidden h-4 w-16 sm:block" />
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>

      <div className="mt-10">
        <Skeleton className="h-6 w-32" />
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 border-b border-border-subtle py-4">
            <Skeleton className="h-4 flex-1" style={{ maxWidth: `${38 - i * 10}%` }} />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-5 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}
