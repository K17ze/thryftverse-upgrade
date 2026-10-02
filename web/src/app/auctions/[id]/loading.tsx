import { AuctionDetailSkeleton } from '@/components/auctions/AuctionSkeletons';

/** Streaming skeleton for the auction room — media stage left,
 *  transaction rail right, matching the detail view's own frame. */
export default function Loading() {
  return <AuctionDetailSkeleton />;
}
