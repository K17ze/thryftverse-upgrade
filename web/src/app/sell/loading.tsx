import { Skeleton } from '@/components/ui/Skeleton';

/** Streaming skeleton for the sell segment — mirrors the flow's own
 *  Suspense fallback (media stage + fields) so the swap lands in place. */
export default function Loading() {
  return (
    <div
      className="mx-auto max-w-[860px] px-4 pb-16 pt-6 sm:px-6"
      aria-busy
      aria-label="Loading sell flow"
    >
      <Skeleton className="h-8 w-56" />
      <Skeleton className="mt-5 aspect-[4/3] w-full rounded-xl" />
      <div className="mt-6 space-y-4">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-11 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}
