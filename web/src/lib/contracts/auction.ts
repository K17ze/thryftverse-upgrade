/**
 * Auction contracts — mirrors frontend/src/data/tradeHub.ts 1:1.
 * Fixture-mode department contracts; the live API will adopt these shapes.
 */

export type AuctionLifecycle = 'upcoming' | 'live' | 'ended';

/** Countdown heat — normal → soon (under an hour) → final (under 5m). */
export type CountdownUrgency = 'normal' | 'soon' | 'final' | 'ended';

/**
 * Server-declared terminal reason — mirrors marketApi.ts
 * AuctionTerminalReason. Absent on fixture rows; when present it is
 * authoritative over timestamp-derived outcomes.
 */
export type AuctionTerminalReason =
  | 'cancelled'
  | 'seller_cancelled'
  | 'settled'
  | 'buy_now'
  | 'scheduled_end'
  | 'reserve_not_met'
  | 'payment_expired'
  | 'second_chance'
  | 'seller_accepted_below_reserve';

export interface AuctionMarketItem {
  id: string;
  /** The listing under the hammer — links the auction to the catalogue. */
  listingId: string;
  sellerId: string;
  title: string;
  image: string;
  startsAt: string;
  endsAt: string;
  startingBid: number;
  currentBid: number;
  bidCount: number;
  buyNowPrice?: number;
  /** Reserve floor — the hammer must reach it or nothing sells. Never
   *  surfaced as a number; only the met/not-met state is public. */
  reservePrice?: number;
  /** Server-computed minimum next bid — wins over the local +5% rule. */
  minimumNextBid?: number;
  /** Server lifecycle verbatim ('live', 'ended', 'reserve_not_met',
   *  'awaiting_payment', 'payment_expired', 'second_chance_offered',
   *  'settled', 'cancelled'). Needed because the post-end states are not
   *  expressible from timestamps alone. */
  serverLifecycle?: string;
  terminalReason?: AuctionTerminalReason | null;
  /** Winner's payment deadline (ISO) while a win awaits payment. */
  paymentDeadlineAt?: string | null;
  /** Viewer id the second-chance offer is addressed to. */
  secondChanceOfferedTo?: string | null;
  /** Winning bidder id when the server reports it. */
  winnerBidderId?: string | null;
}

export interface AuctionViewModel extends AuctionMarketItem {
  lifecycle: AuctionLifecycle;
  msToStart: number;
  msToEnd: number;
  /** 0–1 fraction of the auction window elapsed. */
  progress: number;
}

export interface AuctionBid {
  id: string;
  auctionId: string;
  bidderId: string;
  bidderName: string;
  bidderAvatar: string | null;
  amount: number;
  createdAt: string;
}

/** Viewer's relationship to an auction — derived, never stored. 'active'
 *  is the wire's "bid placed, still running, lead unresolved" state — it
 *  must never collapse into 'winning'. */
export type MyBidStatus = 'outbid' | 'winning' | 'won' | 'lost' | 'active';

export interface MyAuctionBid {
  auction: AuctionViewModel;
  /** Viewer's highest bid on the auction. */
  myBid: number;
  status: MyBidStatus;
  placedAt: string;
}

export interface CreateAuctionInput {
  listingId: string;
  startingBid: number;
  durationHours: number;
  buyNowPrice?: number;
  /** Optional reserve — the lowest hammer the seller will accept. */
  reservePrice?: number;
}

/** 5% minimum increment, rounded up to the pound — mirrors the mobile ladder. */
export const BID_INCREMENT_RATE = 0.05;
/** Anti-sniping: a bid inside this window extends the end by the same. */
export const ANTI_SNIPING_WINDOW_MS = 2 * 60 * 1000;
export const ANTI_SNIPING_EXTENSION_MS = 2 * 60 * 1000;
export const AUCTION_WINDOW_MS = 6 * 60 * 60 * 1000;
