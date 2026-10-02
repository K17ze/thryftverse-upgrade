import { AuctionBoardSkeleton } from '@/components/auctions/AuctionSkeletons';
import { Skeleton } from '@/components/ui/Skeleton';

/** Streaming skeleton for the auction hall — header line over the board
 *  grid's own tile rhythm. */
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 pb-16 pt-6 sm:px-6">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="mt-2 h-4 w-72" />
      <div className="mt-6">
        <AuctionBoardSkeleton />
      </div>
    </div>
  );
}
