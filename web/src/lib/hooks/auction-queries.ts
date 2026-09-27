'use client';

/**
 * Auction queries — the only path from auction surfaces to data.
 * Fixture mode runs on a session-scoped runtime store (the web mirror of
 * the mobile runtimeAuctions/runtimeState overlay): auctions created this
 * session, bids placed this session, and anti-sniping end extensions all
 * live here and dissolve on reload.
 */

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AuctionBid,
  AuctionMarketItem,
  CreateAuctionInput,
} from '@/lib/contracts/auction';
import {
  ANTI_SNIPING_EXTENSION_MS,
  ANTI_SNIPING_WINDOW_MS,
  BID_INCREMENT_RATE,
} from '@/lib/contracts/auction';
import { formatPrice } from '@/lib/utils/format';
import type { MyBidRow } from '@/lib/data/fixtures-auctions';
import {
  AUCTION_BIDS,
  AUCTIONS,
  buildAuction,
  minNextBid,
  myBidRows,
  sortAuctions,
  toViewModel,
} from '@/lib/data/fixtures-auctions';
import { CURRENT_USER } from '@/lib/data/fixtures';
import { DATA_MODE } from '@/lib/api/client';
import * as auctionsService from '@/lib/api/services/auctions';
import { useSession } from '@/lib/session/SessionProvider';

const tick = (ms = 120) => new Promise((resolve) => setTimeout(resolve, ms));

// ============================================================================
// Session runtime — created auctions, placed bids, anti-sniping extensions
// ============================================================================

const runtimeAuctions: AuctionMarketItem[] = [];
const runtimeBids: AuctionBid[] = [];
const runtimeBidState = new Map<string, { currentBid: number; bidCount: number }>();
const runtimeEnds = new Map<string, number>();
/**
 * The viewer's proxy ceiling per auction — the "Set maximum bid" value
 * this session submitted. Session-scoped like the rest of the runtime;
 * in live mode it records what we POSTed (the API doesn't echo it back),
 * in fixture mode it powers the honest "Automatic bidding" state. The
 * fixture runtime has no rival bidders, so the ceiling never auto-fires —
 * it is a user-declared preference, not a simulated outcome.
 */
const runtimeProxyMax = new Map<string, { bidderId: string; maxBid: number }>();

/** The viewer's declared proxy ceiling this session, if any. */
export function viewerProxyMax(auctionId: string, bidderId: string | undefined): number | null {
  if (!bidderId) return null;
  const entry = runtimeProxyMax.get(auctionId);
  return entry && entry.bidderId === bidderId ? entry.maxBid : null;
}

/** Every auction: session-created first, then the seeded board, overlaid. */
function allAuctions(): AuctionMarketItem[] {
  return [...runtimeAuctions, ...AUCTIONS].map((auction) => {
    const overlay = runtimeBidState.get(auction.id);
    const extendedEnd = runtimeEnds.get(auction.id);
    if (!overlay && extendedEnd == null) return auction;
    return {
      ...auction,
      currentBid: overlay?.currentBid ?? auction.currentBid,
      bidCount: overlay?.bidCount ?? auction.bidCount,
      endsAt:
        extendedEnd != null ? new Date(extendedEnd).toISOString() : auction.endsAt,
    };
  });
}

function allBids(): AuctionBid[] {
  return [...runtimeBids, ...AUCTION_BIDS].sort(
    (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),
  );
}

// ============================================================================
// Clock — starts from the fixture module NOW so SSR and first client render
// agree, then ticks locally.
// ============================================================================

export function useNowTick(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

// ============================================================================
// Queries
// ============================================================================

/** Hub board — sorted live → upcoming → ended, recomputed on every tick. */
export function useAuctionBoard() {
  const now = useNowTick(1000);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['auctions'],
    queryFn: async () => {
      if (DATA_MODE === 'live') {
        const page = await auctionsService.fetchAuctionBoard();
        return page.items;
      }
      await tick();
      return allAuctions();
    },
  });
  const auctions = useMemo(
    () => sortAuctions((data ?? []).map((item) => toViewModel(item, now))),
    [data, now],
  );
  return { auctions, isLoading, isError, refetch };
}

export function useAuction(id: string) {
  const now = useNowTick(1000);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['auction', id],
    queryFn: async () => {
      if (DATA_MODE === 'live') {
        return auctionsService.fetchAuctionDetail(id);
      }
      await tick();
      return allAuctions().find((a) => a.id === id) ?? null;
    },
  });
  const auction = useMemo(
    () => (data ? toViewModel(data, now) : null),
    [data, now],
  );
  return { auction, isLoading, isError, refetch };
}

export function useAuctionBids(auctionId: string) {
  return useQuery({
    queryKey: ['auction-bids', auctionId],
    queryFn: async () => {
      if (DATA_MODE === 'live') {
        return auctionsService.fetchAuctionBids(auctionId);
      }
      await tick();
      return allBids().filter((bid) => bid.auctionId === auctionId);
    },
  });
}

export interface MyBidsBoard {
  outbid: MyBidRow[];
  winning: MyBidRow[];
  /** Wire 'active' — a live bid whose lead the serve couldn't resolve.
   *  Kept distinct from 'winning' so the row never claims a lead it
   *  can't prove. */
  active: MyBidRow[];
  won: MyBidRow[];
  lost: MyBidRow[];
}

export function useMyBids(viewerId: string) {
  const now = useNowTick(30_000);
  const {
    data: auctions,
    isLoading,
    isError: auctionsError,
    refetch: refetchAuctions,
  } = useQuery({
    queryKey: ['auctions'],
    queryFn: async () => {
      if (DATA_MODE === 'live') {
        const page = await auctionsService.fetchAuctionBoard();
        return page.items;
      }
      await tick();
      return allAuctions();
    },
  });
  const { data: bids, isError: bidsError, refetch: refetchBids } = useQuery({
    queryKey: ['auction-bids-all', viewerId],
    // Guests have no ledger — never hit the authed endpoint for them.
    enabled: viewerId !== '' || DATA_MODE !== 'live',
    queryFn: async () => {
      if (DATA_MODE === 'live') {
        return auctionsService.fetchMyAuctionBids('all');
      }
      await tick();
      return allBids();
    },
  });

  const board = useMemo<MyBidsBoard>(() => {
    const rows: MyBidRow[] =
      DATA_MODE === 'live'
        ? ((bids ?? []) as auctionsService.MyAuctionBidApi[]).map((b) => {
            // The wire distinguishes 'leading' from 'active' (bid placed,
            // lead unresolved). Mapping 'active' into the winning bucket
            // would claim a lead the serve never reported — keep it
            // honest.
            const status: MyBidRow['status'] =
              b.bidState === 'won'
                ? 'won'
                : b.bidState === 'lost'
                  ? 'lost'
                  : b.bidState === 'outbid'
                    ? 'outbid'
                    : b.bidState === 'leading'
                      ? 'winning'
                      : 'active';
            const item: AuctionMarketItem = {
              id: b.auction.id,
              listingId: b.auction.id,
              sellerId: b.auction.sellerId,
              title: b.auction.title,
              image: b.auction.imageUrl ?? '',
              startsAt: b.auction.startsAt ?? b.createdAt,
              endsAt: b.auction.endsAt,
              startingBid: b.amountGbp,
              currentBid: b.auction.currentBidGbp,
              bidCount: b.auction.bidCount,
            };
            return { auction: toViewModel(item, now), myBid: b.amountGbp, status, placedAt: b.createdAt };
          })
        : myBidRows(
            (auctions ?? []).map((item) => toViewModel(item, now)),
            (bids ?? []) as AuctionBid[],
            viewerId,
          );
    const pick = (status: MyBidRow['status']) =>
      rows
        .filter((row) => row.status === status)
        .sort((a, b) => Date.parse(b.placedAt) - Date.parse(a.placedAt));
    return {
      outbid: pick('outbid'),
      winning: pick('winning'),
      active: pick('active'),
      won: pick('won'),
      lost: pick('lost'),
    };
  }, [auctions, bids, now, viewerId]);

  return {
    board,
    isLoading,
    // The board reads both queries — either leg failing means the ledger
    // is incomplete, so surface it as one retryable error, never as empty.
    isError: auctionsError || bidsError,
    refetch: () => {
      void refetchAuctions();
      void refetchBids();
    },
  };
}

/**
 * Seller's own board — the same 'auctions' cache as the hub, narrowed to
 * auctions the viewer is selling. Session-created auctions land here too:
 * creation stamps the session identity as seller-of-record.
 */
export function useSellerAuctionBoard(_sellerId: string = CURRENT_USER.id) {
  const now = useNowTick(1000);
  const { user } = useSession();
  // The board is the caller's own — the session identity decides. Guests
  // resolve to '' so they never borrow the fixture 'me' board.
  const effectiveSellerId = user?.id ?? '';
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['auctions'],
    queryFn: async () => {
      if (DATA_MODE === 'live') {
        const page = await auctionsService.fetchAuctionBoard();
        return page.items;
      }
      await tick();
      return allAuctions();
    },
  });
  const auctions = useMemo(
    () =>
      (data ?? [])
        .filter((item) => item.sellerId === effectiveSellerId)
        .map((item) => toViewModel(item, now)),
    [data, now, effectiveSellerId],
  );
  return { auctions, isLoading, isError, refetch };
}

// ============================================================================
// Place bid — optimistic commit with rollback, anti-sniping extension
// ============================================================================

interface BidSnapshot {
  bidState?: { currentBid: number; bidCount: number };
  bidsLength?: number;
  extendedEnd?: number;
}

/** What a bid placement carries: the visible bid, the idempotency key for
 *  this user-initiated attempt (one key per confirm — retries of the same
 *  attempt reuse it so the backend dedupe replays rather than
 *  double-commits), and the optional proxy ceiling. `maxBid` is a
 *  fixture-runtime preference only — the live bids schema
 *  (backend index.ts:37587, `additionalProperties: false`) has no proxy
 *  field, so it is never sent over the wire. */
export interface PlaceBidInput {
  amount: number;
  maxBid?: number;
  idempotencyKey?: string;
}

export function usePlaceBid(auctionId: string) {
  const qc = useQueryClient();
  const { user } = useSession();

  const refresh = () => {
    if (DATA_MODE === 'live') {
      qc.invalidateQueries({ queryKey: ['auctions'] });
      qc.invalidateQueries({ queryKey: ['auction', auctionId] });
      qc.invalidateQueries({ queryKey: ['auction-bids', auctionId] });
      qc.invalidateQueries({ queryKey: ['auction-bids-all'] });
      return;
    }
    qc.setQueryData<AuctionMarketItem[]>(['auctions'], allAuctions());
    qc.setQueryData<AuctionMarketItem | null>(['auction', auctionId], () =>
      allAuctions().find((a) => a.id === auctionId) ?? null,
    );
    qc.setQueryData<AuctionBid[]>(['auction-bids', auctionId], () =>
      allBids().filter((bid) => bid.auctionId === auctionId),
    );
    qc.invalidateQueries({ queryKey: ['auction-bids-all'] });
  };

  return useMutation({
    mutationFn: async (input: PlaceBidInput) => {
      if (DATA_MODE === 'live') {
        await auctionsService.placeAuctionBid(auctionId, {
          amountGbp: input.amount,
          // The caller supplies one key per attempt; fall back to a fresh
          // one so a bare call can never go out unsigned.
          idempotencyKey: input.idempotencyKey ?? auctionsService.newBidAttemptKey(),
        });
        return input;
      }
      await tick(350);
      return input;
    },
    onMutate: (input: PlaceBidInput): BidSnapshot => {
      const { amount, maxBid } = input;
      if (DATA_MODE === 'live') {
        // Live mode re-reads on settle — no client-side bid store to mirror.
        return {};
      }
      const auction = allAuctions().find((item) => item.id === auctionId);
      if (!auction) throw new Error('This auction is no longer available');
      // Real identity only — a guest must never land a bid under the
      // fixture 'me' identity, and the seller can't bid on their own lot.
      if (user == null) throw new Error('Sign in to place a bid');
      if (auction.sellerId === user.id) {
        throw new Error("You can't bid on your own auction");
      }
      // The same rejections a server would return — the fixture runtime
      // exercises the real failure path rather than only the happy one.
      const effectiveEndMs = runtimeEnds.get(auctionId) ?? Date.parse(auction.endsAt);
      if (Date.parse(auction.startsAt) > Date.now()) {
        throw new Error('Bidding opens when the auction goes live');
      }
      if (effectiveEndMs <= Date.now()) {
        throw new Error('This auction has ended');
      }
      const floor = minNextBid({ ...auction, currentBid: auction.currentBid });
      if (amount < floor) {
        // The +5% rationale only applies to the locally-derived floor —
        // a server-declared minimumNextBid is quoted without a guessed rule.
        throw new Error(
          auction.minimumNextBid != null
            ? `Bid must be at least ${formatPrice(floor)}`
            : `Bid must be at least ${formatPrice(floor)} — the current bid plus ${Math.round(BID_INCREMENT_RATE * 100)}%`,
        );
      }
      if (maxBid != null && maxBid < amount) {
        throw new Error("Your maximum bid can't sit below the bid you're placing");
      }
      const bidder = user;
      const snapshot: BidSnapshot = {
        bidState: runtimeBidState.get(auctionId),
        bidsLength: runtimeBids.length,
        extendedEnd: runtimeEnds.get(auctionId),
      };
      // Optimistic commit — the bid is visible before the round-trip lands.
      runtimeBidState.set(auctionId, {
        currentBid: amount,
        bidCount: auction.bidCount + 1,
      });
      runtimeBids.push({
        id: `rb-${Date.now().toString(36)}`,
        auctionId,
        bidderId: bidder.id,
        bidderName: bidder.username,
        bidderAvatar: bidder.avatar,
        amount,
        createdAt: new Date().toISOString(),
      });
      // Anti-sniping — a bid inside the final two minutes pushes the end out.
      if (effectiveEndMs - Date.now() < ANTI_SNIPING_WINDOW_MS) {
        runtimeEnds.set(auctionId, effectiveEndMs + ANTI_SNIPING_EXTENSION_MS);
      }
      refresh();
      return snapshot;
    },
    onError: (_error, _input, snapshot) => {
      if (snapshot?.bidState) runtimeBidState.set(auctionId, snapshot.bidState);
      else runtimeBidState.delete(auctionId);
      if (snapshot?.bidsLength != null && snapshot.bidsLength !== runtimeBids.length) {
        runtimeBids.splice(snapshot.bidsLength);
      }
      if (snapshot) {
        if (snapshot.extendedEnd != null) runtimeEnds.set(auctionId, snapshot.extendedEnd);
        else runtimeEnds.delete(auctionId);
      }
      refresh();
    },
    onSuccess: (input) => {
      // Record the viewer's proxy ceiling only once the placement
      // succeeded — a rejected bid leaves no "automatic bidding" state.
      // Fixture-runtime only: the live bids schema carries no proxy
      // field, so input.maxBid is never set in live mode.
      if (input.maxBid != null && user) {
        runtimeProxyMax.set(auctionId, { bidderId: user.id, maxBid: input.maxBid });
      }
      refresh();
    },
  });
}

// ============================================================================
// Create auction — simulated, session-scoped (fixture mode)
// ============================================================================

/** Session-scoped create input — `startsAt` widens the fixture contract
 *  so the create flow can schedule an auction ahead of the hammer (the
 *  service already accepts it; the shared contract type does not). */
export interface CreateAuctionSessionInput extends CreateAuctionInput {
  /** ISO — present when the auction is scheduled for later. */
  startsAt?: string;
}

export function useCreateAuction() {
  const qc = useQueryClient();
  const { user } = useSession();
  return useMutation({
    mutationFn: async (input: CreateAuctionSessionInput) => {
      const startsAtMs = input.startsAt ? Date.parse(input.startsAt) : Date.now();
      if (DATA_MODE === 'live') {
        // No reservePriceGbp — the live create schema drops it (backend
        // index.ts:37308). The create page gates the field in live mode
        // so this is also unreachable, but the contract stays honest at
        // the source.
        const auction = await auctionsService.createAuction({
          listingId: input.listingId,
          startsAt: new Date(startsAtMs).toISOString(),
          endsAt: new Date(startsAtMs + input.durationHours * 3_600_000).toISOString(),
          startingBidGbp: input.startingBid,
          buyNowPriceGbp: input.buyNowPrice,
        });
        return auction;
      }
      if (user == null) throw new Error('Sign in to create an auction');
      const created = buildAuction(input);
      if (!created) throw new Error('Pick one of your listings first');
      // Seller-of-record is the session identity — never a borrowed 'me'.
      // Scheduled auctions stamp their real window; buildAuction always
      // opens now, so a delayed start overrides both ends of the window.
      const stamped: AuctionMarketItem = {
        ...created,
        sellerId: user.id,
        startsAt: new Date(startsAtMs).toISOString(),
        endsAt: new Date(startsAtMs + input.durationHours * 3_600_000).toISOString(),
      };
      await tick(400);
      runtimeAuctions.unshift(stamped);
      return stamped;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['auctions'] });
      qc.invalidateQueries({ queryKey: ['auction-bids-all'] });
    },
  });
}
