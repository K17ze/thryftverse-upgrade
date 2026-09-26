import { Skeleton } from '@/components/ui/Skeleton';

/** Hub skeleton — mirrors hero, tab rail and six market rows. */
export function HubSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading Co-Own markets">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Skeleton className="h-9 w-44" />
          <Skeleton className="mt-3 h-4 w-64" />
        </div>
        <Skeleton className="h-5 w-40" />
      </div>

      <div className="mt-8 grid gap-6 md:grid-cols-12 md:gap-8" aria-hidden="true">
        <Skeleton className="aspect-[4/3] w-full rounded-xl md:col-span-7" />
        <div className="md:col-span-5">
          <Skeleton className="h-3.5 w-36" />
          <Skeleton className="mt-3 h-7 w-64" />
          <Skeleton className="mt-2 h-4 w-44" />
          <Skeleton className="mt-6 h-10 w-40" />
          <Skeleton className="mt-4 h-11 w-52" />
          <div className="mt-6 grid grid-cols-2 gap-4 border-t border-border-subtle pt-4 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i}>
                <Skeleton className="h-2.5 w-14" />
                <Skeleton className="mt-2 h-4 w-12" />
              </div>
            ))}
          </div>
          <div className="mt-6 flex gap-3">
            <Skeleton className="h-11 w-32" />
            <Skeleton className="h-11 w-36" />
          </div>
        </div>
      </div>

      <div className="mt-12 flex gap-2 border-b border-border-subtle pb-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-20 rounded-full" />
        ))}
      </div>

      <ul className="divide-y divide-border-subtle" aria-hidden="true">
        {Array.from({ length: 6 }).map((_, i) => (
          <li key={i} className="flex items-center gap-4 px-1 py-4">
            <Skeleton className="h-12 w-12 shrink-0 rounded-lg" />
            <div className="min-w-0 flex-1">
              <Skeleton className="h-4" style={{ maxWidth: `${52 - (i % 3) * 9}%` }} />
              <Skeleton className="mt-2 h-3 w-24" />
            </div>
            <Skeleton className="h-4 w-16" />
            <Skeleton className="hidden h-6 w-20 sm:block" />
            <Skeleton className="hidden h-4 w-12 md:block" />
            <Skeleton className="h-4 w-14" />
          </li>
        ))}
      </ul>
    </div>
  );
}
