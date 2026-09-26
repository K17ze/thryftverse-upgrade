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
} from '@/lib/contracts/auction';
import type { MyBidRow } from '@/lib/data/fixtures-auctions';
import {
  AUCTION_BIDS,
  AUCTIONS,
  buildAuction,
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
  const { data, isLoading } = useQuery({
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
  return { auctions, isLoading };
}

export function useAuction(id: string) {
  const now = useNowTick(1000);
  const { data, isLoading } = useQuery({
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
  return { auction, isLoading };
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
  won: MyBidRow[];
  lost: MyBidRow[];
}

export function useMyBids(viewerId: string) {
  const now = useNowTick(30_000);
  const { data: auctions, isLoading } = useQuery({
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
  const { data: bids } = useQuery({
    queryKey: ['auction-bids-all', viewerId],
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
            const status: MyBidRow['status'] =
              b.bidState === 'won'
                ? 'won'
                : b.bidState === 'lost'
                  ? 'lost'
                  : b.bidState === 'outbid'
                    ? 'outbid'
                    : 'winning';
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
      won: pick('won'),
      lost: pick('lost'),
    };
  }, [auctions, bids, now, viewerId]);

  return { board, isLoading };
}

/**
 * Seller's own board — the same 'auctions' cache as the hub, narrowed to
 * auctions the viewer is selling. Session-created auctions land here too:
 * buildAuction() stamps sellerId 'me'.
 */
export function useSellerAuctionBoard(sellerId: string = CURRENT_USER.id) {
  const now = useNowTick(1000);
  const { user } = useSession();
  const effectiveSellerId = DATA_MODE === 'live' ? (user?.id ?? sellerId) : sellerId;
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
    mutationFn: async (amount: number) => {
      if (DATA_MODE === 'live') {
        await auctionsService.placeAuctionBid(auctionId, amount);
        return amount;
      }
      await tick(350);
      return amount;
    },
    onMutate: (amount: number): BidSnapshot => {
      if (DATA_MODE === 'live') {
        // Live mode re-reads on settle — no client-side bid store to mirror.
        return {};
      }
      const auction = allAuctions().find((item) => item.id === auctionId);
      if (!auction) throw new Error('This auction is no longer available');
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
        bidderId: user?.id ?? CURRENT_USER.id,
        bidderName: user?.username ?? CURRENT_USER.username,
        bidderAvatar: user?.avatar ?? CURRENT_USER.avatar,
        amount,
        createdAt: new Date().toISOString(),
      });
      // Anti-sniping — a bid inside the final two minutes pushes the end out.
      const effectiveEndMs = runtimeEnds.get(auctionId) ?? Date.parse(auction.endsAt);
      if (effectiveEndMs - Date.now() < ANTI_SNIPING_WINDOW_MS) {
        runtimeEnds.set(auctionId, effectiveEndMs + ANTI_SNIPING_EXTENSION_MS);
      }
      refresh();
      return snapshot;
    },
    onError: (_error, _amount, snapshot) => {
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
    onSuccess: () => refresh(),
  });
}

// ============================================================================
// Create auction — simulated, session-scoped (fixture mode)
// ============================================================================

export function useCreateAuction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateAuctionInput) => {
      if (DATA_MODE === 'live') {
        const now = Date.now();
        const auction = await auctionsService.createAuction({
          listingId: input.listingId,
          startsAt: new Date(now).toISOString(),
          endsAt: new Date(now + input.durationHours * 3_600_000).toISOString(),
          startingBidGbp: input.startingBid,
          buyNowPriceGbp: input.buyNowPrice,
        });
        return auction;
      }
      const created = buildAuction(input);
      if (!created) throw new Error('Pick one of your listings first');
      await tick(400);
      runtimeAuctions.unshift(created);
      return created;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['auctions'] });
      qc.invalidateQueries({ queryKey: ['auction-bids-all'] });
    },
  });
}
