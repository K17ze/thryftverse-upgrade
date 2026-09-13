import type { AuctionEffectiveState } from '../hooks/useServerClock';

export type SellerAuctionBucket = 'scheduled' | 'live' | 'pending' | 'sold' | 'unsold' | 'cancelled';

/** A bid or winner is not evidence of a completed sale. */
export function sellerAuctionBucket(state: AuctionEffectiveState, bidCount: number): SellerAuctionBucket {
  switch (state) {
    case 'upcoming': return 'scheduled';
    case 'live': return 'live';
    case 'settled': return 'sold';
    case 'cancelled': return 'cancelled';
    case 'reserve_not_met':
    case 'payment_expired': return 'unsold';
    case 'ended': return bidCount === 0 ? 'unsold' : 'pending';
    default: return 'pending';
  }
}
