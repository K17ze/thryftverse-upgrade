/**
 * Auction contracts — mirrors frontend/src/data/tradeHub.ts 1:1.
 * Fixture-mode department contracts; the live API will adopt these shapes.
 */

export type AuctionLifecycle = 'upcoming' | 'live' | 'ended';

/** Countdown heat — normal → soon (under an hour) → final (under 5m). */
export type CountdownUrgency = 'normal' | 'soon' | 'final' | 'ended';

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

/** Viewer's relationship to an auction — derived, never stored. */
export type MyBidStatus = 'outbid' | 'winning' | 'won' | 'lost';

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
}

/** 5% minimum increment, rounded up to the pound — mirrors the mobile ladder. */
export const BID_INCREMENT_RATE = 0.05;
/** Anti-sniping: a bid inside this window extends the end by the same. */
export const ANTI_SNIPING_WINDOW_MS = 2 * 60 * 1000;
export const ANTI_SNIPING_EXTENSION_MS = 2 * 60 * 1000;
export const AUCTION_WINDOW_MS = 6 * 60 * 60 * 1000;
