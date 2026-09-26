import { Skeleton } from '@/components/ui/Skeleton';

/** Hub skeleton — media frames + metadata lines at the grid rhythm. */
export function AuctionBoardSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div
      className="grid grid-cols-2 gap-x-3 gap-y-8 md:grid-cols-3 xl:grid-cols-4"
      aria-busy
      aria-label="Loading auctions"
    >
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex flex-col gap-2">
          <Skeleton className="aspect-[0.8] w-full rounded-lg" />
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}

/** Activity row skeleton — matches the MyBidRow rhythm. */
export function AuctionRowSkeleton() {
  return (
    <div className="flex items-center gap-3 py-3.5" aria-busy aria-label="Loading bids">
      <Skeleton className="h-16 w-16 shrink-0 rounded-md" />
      <div className="flex flex-1 flex-col gap-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-3 w-32" />
      </div>
      <Skeleton className="h-4 w-14" />
    </div>
  );
}

/** Detail skeleton — media stage left, transaction rail right. */
export function AuctionDetailSkeleton() {
  return (
    <div className="grid gap-8 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-10">
      <div className="flex flex-col gap-3">
        <Skeleton className="aspect-[0.8] w-full rounded-xl" />
        <div className="flex gap-2">
          <Skeleton className="h-16 w-16 rounded-md" />
          <Skeleton className="h-16 w-16 rounded-md" />
        </div>
        <Skeleton className="mt-2 h-6 w-3/4" />
        <Skeleton className="h-4 w-40" />
      </div>
      <div className="flex flex-col gap-4">
        <Skeleton className="h-7 w-36" />
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-4 w-56" />
        <Skeleton className="h-12 w-full rounded-lg" />
        <div className="flex gap-2">
          <Skeleton className="h-9 flex-1 rounded-md" />
          <Skeleton className="h-9 flex-1 rounded-md" />
          <Skeleton className="h-9 flex-1 rounded-md" />
        </div>
        <Skeleton className="h-[52px] w-full rounded-md" />
      </div>
    </div>
  );
}
