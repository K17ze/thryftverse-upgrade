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
  AuctionLifecycle,
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
import { CURRENT_USER, listingById } from '@/lib/data/fixtures';
import { DATA_MODE } from '@/lib/api/client';
import * as auctionsService from '@/lib/api/services/auctions';
import { mergeServerWatches } from '@/components/auctions/auctionWatchlist';
import { useSession } from '@/lib/session/SessionProvider';

const tick = (ms = 120) => new Promise((resolve) => setTimeout(resolve, ms));

// ============================================================================
// Session runtime — created auctions, placed bids, anti-sniping extensions
// ============================================================================

const runtimeAuctions: AuctionMarketItem[] = [];
const runtimeBids: AuctionBid[] = [];
const runtimeBidState = new Map<string, { currentBid: number; bidCount: number }>();
const runtimeEnds = new Map<string, number>();
/** Fixture-mode seller cancellations — session-scoped like the rest of
 *  the runtime: the row reads cancelled (terminalReason wins over the
 *  still-future endsAt) and lands in the seller's unsold bucket. */
const runtimeCancelled = new Set<string>();
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
    const cancelled = runtimeCancelled.has(auction.id);
    if (!overlay && extendedEnd == null && !cancelled) return auction;
    return {
      ...auction,
      currentBid: overlay?.currentBid ?? auction.currentBid,
      bidCount: overlay?.bidCount ?? auction.bidCount,
      endsAt:
        extendedEnd != null ? new Date(extendedEnd).toISOString() : auction.endsAt,
      ...(cancelled ? { terminalReason: 'cancelled' as const } : {}),
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
// Server clock — live responses stamp `serverNow`; paired with the
// query's dataUpdatedAt it approximates (server clock − device clock) at
// receipt. Countdown surfaces run on the corrected clock so a fast or
// slow device can't lie about the window. Fixture rows carry no stamp —
// skew resolves to 0.
// ============================================================================

function serverSkewMs(
  source: AuctionMarketItem | AuctionMarketItem[] | null | undefined,
  updatedAt: number,
): number {
  const list = source == null ? [] : Array.isArray(source) ? source : [source];
  const stamp = list.find((item) => item.serverNow)?.serverNow;
  const skew = stamp ? Date.parse(stamp) - updatedAt : NaN;
  return Number.isFinite(skew) ? skew : 0;
}

/** Union server-echoed watch flags into the local watchlist store — the
 *  same merge grammar the /auctions/watchlist seed runs (server truth on
 *  fetch; local flags are never deleted by a stale read). */
function mergeEchoedWatches(items: AuctionMarketItem[]): void {
  if (DATA_MODE !== 'live') return;
  mergeServerWatches(items.filter((item) => item.isWatched === true).map((item) => item.id));
}

/** Post-end states the server still mutates: an awaiting-payment run
 *  settles or expires on the sweep clock, a second-chance offer advances
 *  when its deadline lapses, and a reserve-not-met run converts the
 *  moment the seller accepts. These read 'ended' by timestamps but are
 *  not settled — the detail surface keeps polling until the server
 *  declares a terminal state. */
const POST_END_POLL_MS = new Map<string, number>([
  ['awaiting_payment', 15_000],
  ['second_chance_offered', 15_000],
  ['payment_expired', 15_000],
  ['reserve_not_met', 30_000],
]);

/** Lifecycle-keyed poll grammar — mirrors native useAuctionDetail:
 *  10s while live (rival bids, outbid state), 45s while upcoming (the
 *  window may open), and no polling once truly ended. Resolved through
 *  toViewModel so server-declared lifecycles decide, not timestamps. */
function auctionPollInterval(item: AuctionMarketItem | null | undefined): number | false {
  if (item === null) return false;
  if (item === undefined) return 10_000;
  const lifecycle = toViewModel(item, Date.now()).lifecycle;
  if (lifecycle === 'live') return 10_000;
  if (lifecycle === 'upcoming') return 45_000;
  return POST_END_POLL_MS.get(item.serverLifecycle ?? '') ?? false;
}

/** The detail serve carries its own bid ledger (top 20, with usernames).
 *  It seeds the bids cache so the first paint renders instantly; the
 *  standalone /bids route (≤200 rows, usernames included) is the
 *  full-history read that replaces it on resolve. */
const detailBidLedger = new Map<string, AuctionBid[]>();

// ============================================================================
// Queries
// ============================================================================

/** Hub board — sorted live → upcoming → ended, recomputed on every tick.
 *
 *  Live mode scopes the read server-side: each scope fetches its own
 *  60-row page instead of sharing one 30-row 'all' window (the bare board
 *  sorts ends_at ASC, so the oldest-ended auctions crowd out live
 *  inventory). `scope` maps to the route's status enum; `categories` is
 *  the CSV multi-select filter the route ANDs in. Zero-arg keeps the
 *  legacy unscoped read for non-board consumers. Fixture mode always
 *  returns the session runtime — the caller filters client-side. */
export function useAuctionBoard(
  scope?: AuctionLifecycle,
  options: { categories?: string; enabled?: boolean } = {},
) {
  const now = useNowTick(1000);
  const enabled = options.enabled ?? true;
  const categories = options.categories?.trim() || undefined;
  const status =
    scope === 'live'
      ? 'live'
      : scope === 'upcoming'
        ? 'scheduled'
        : scope === 'ended'
          ? 'ended'
          : undefined;
  // Results read newest-first — 'endingSoon' would lead with the oldest
  // ended run. Live/upcoming keep the time-sensitive ordering.
  const sort = scope === 'ended' ? 'newest' : 'endingSoon';
  const scopedLive = DATA_MODE === 'live' && (status !== undefined || categories != null);
  const { data, dataUpdatedAt, isLoading, isError, refetch } = useQuery({
    queryKey: scopedLive ? ['auctions', 'board', status, sort, categories] : ['auctions'],
    enabled,
    queryFn: async ({ signal }) => {
      if (DATA_MODE === 'live') {
        const page = await auctionsService.fetchAuctionBoard(
          scopedLive ? { status, sort, categories, limit: 60 } : undefined,
          signal,
        );
        mergeEchoedWatches(page.items);
        return page.items;
      }
      await tick();
      return allAuctions();
    },
  });
  const skew = serverSkewMs(data, dataUpdatedAt);
  const auctions = useMemo(
    () => sortAuctions((data ?? []).map((item) => toViewModel(item, now + skew))),
    [data, now, skew],
  );
  return { auctions, isLoading: enabled && isLoading, isError, refetch };
}

/**
 * Hub facets — GET /auctions/facets in live mode: scope counts over the
 * whole inventory (not the loaded page), the selectable categories with
 * counts, and the price spectrum. `categories` keeps the counts honest
 * while a filter is active (the route ignores a dimension's own
 * constraint, so category counts don't collapse under selection).
 * Fixture mode derives the same shape from the session runtime — the
 * counts are the real fixture board's, not invented numbers.
 */
export function useAuctionFacets(options: { categories?: string } = {}) {
  const now = useNowTick(60_000);
  const categories = options.categories?.trim() || undefined;
  const query = useQuery({
    queryKey: ['auctions', 'facets', DATA_MODE === 'live' ? (categories ?? '') : 'fixture'],
    queryFn: async ({ signal }) => {
      if (DATA_MODE === 'live') {
        return auctionsService.fetchAuctionFacets({ categories }, signal);
      }
      await tick();
      return null;
    },
  });
  const fixture = useMemo<auctionsService.AuctionFacets>(() => {
    const items = allAuctions().map((item) => toViewModel(item, now));
    const statusCounts = { live: 0, upcoming: 0, results: 0, watching: 0 };
    const categoryCounts = new Map<string, number>();
    let priceMin = Infinity;
    let priceMax = 0;
    for (const item of items) {
      if (item.lifecycle === 'ended') statusCounts.results += 1;
      else statusCounts[item.lifecycle] += 1;
      const category = listingById(item.listingId)?.category;
      if (category) categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1);
      priceMin = Math.min(priceMin, item.currentBid);
      priceMax = Math.max(priceMax, item.currentBid);
    }
    return {
      categories: [...categoryCounts.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([id, count]) => ({ id, label: id, count })),
      price: { min: items.length ? priceMin : 0, max: priceMax },
      statusCounts,
    };
  }, [now]);
  if (DATA_MODE === 'live') {
    return { facets: query.data ?? null, isLoading: query.isLoading };
  }
  return { facets: fixture, isLoading: false };
}

/**
 * The server's hub feed — attention pick (deduped across every rail),
 * per-viewer activity counts and the authored programmes. Live-mode only:
 * fixture mode derives the same strip locally and returns null.
 */
export function useAuctionHome() {
  const { data, dataUpdatedAt, isLoading, isError } = useQuery({
    queryKey: ['auctions', 'home'],
    enabled: DATA_MODE === 'live',
    staleTime: 30_000,
    queryFn: async ({ signal }) => auctionsService.fetchAuctionHome(signal),
  });
  // The feed stamps serverNow onto every item — skew resolves off any of
  // them so the attention item's countdown runs on the corrected clock.
  const skew = serverSkewMs(
    data
      ? [
          ...(data.attention?.item ? [data.attention.item] : []),
          ...data.closingSoon,
          ...data.live,
        ]
      : null,
    dataUpdatedAt,
  );
  return { home: data ?? null, skew, isLoading, isError };
}

export function useAuction(id: string, options?: { initialData?: AuctionMarketItem }) {
  const qc = useQueryClient();
  const now = useNowTick(1000);
  const { data, dataUpdatedAt, isLoading, isError, refetch } = useQuery({
    queryKey: ['auction', id],
    // Server-shell seed — stamped "now", never epoch 0: the countdown
    // skew math reads serverNow against dataUpdatedAt, so a 0 stamp
    // would misread the clock until the poll's first tick. The default
    // freshness window skips the redundant mount refetch; the lifecycle
    // poll (refetchInterval) stays the revalidation channel.
    initialData: options?.initialData,
    initialDataUpdatedAt: options?.initialData ? Date.now() : undefined,
    queryFn: async ({ signal }) => {
      if (DATA_MODE === 'live') {
        const bundle = await auctionsService.fetchAuctionDetailBundle(id, signal);
        if (!bundle) return null;
        mergeEchoedWatches([bundle.auction]);
        // The detail serve's own ledger (top 20) seeds the bids cache so
        // the first paint renders instantly; the dedicated /bids query
        // then replaces it with the full ≤200-row history.
        if (bundle.bids) {
          detailBidLedger.set(id, bundle.bids);
          qc.setQueryData<AuctionBid[]>(['auction-bids', id], bundle.bids);
        }
        return bundle.auction;
      }
      await tick();
      return allAuctions().find((a) => a.id === id) ?? null;
    },
    // Live-grammar poll (native parity): 10s while the hammer is up —
    // rival bids and outbid state land without a reload — 45s while
    // upcoming, nothing after the close.
    refetchInterval: (query) => auctionPollInterval(query.state.data),
  });
  const skew = serverSkewMs(data, dataUpdatedAt);
  const auction = useMemo(
    () => (data ? toViewModel(data, now + skew) : null),
    [data, now, skew],
  );
  return { auction, isLoading, isError, refetch };
}

export function useAuctionBids(auctionId: string) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: ['auction-bids', auctionId],
    queryFn: async ({ signal }) => {
      if (DATA_MODE === 'live') {
        // The standalone route IS the full-history read — detail's
        // bidActivity is a top-20 window and stays in the cache only as
        // the instant-paint seed (the query key already holds it). The
        // route's 200-row cap is the server's own ledger bound.
        return auctionsService.fetchAuctionBids(auctionId, { limit: 200 }, signal);
      }
      await tick();
      return allBids().filter((bid) => bid.auctionId === auctionId);
    },
    // Same lifecycle grammar as the detail poll, keyed off the resolved
    // auction so the ledger keeps pace while live and rests once ended.
    refetchInterval: () =>
      auctionPollInterval(
        qc.getQueryData<AuctionMarketItem | null>(['auction', auctionId]),
      ),
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
    dataUpdatedAt: auctionsUpdatedAt,
    isLoading,
    isError: auctionsError,
    refetch: refetchAuctions,
  } = useQuery({
    queryKey: ['auctions'],
    queryFn: async ({ signal }) => {
      if (DATA_MODE === 'live') {
        const page = await auctionsService.fetchAuctionBoard(undefined, signal);
        mergeEchoedWatches(page.items);
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
    queryFn: async ({ signal }) => {
      if (DATA_MODE === 'live') {
        return auctionsService.fetchMyAuctionBids('all', signal);
      }
      await tick();
      return allBids();
    },
  });

  const skew = serverSkewMs(auctions, auctionsUpdatedAt);
  const board = useMemo<MyBidsBoard>(() => {
    const correctedNow = now + skew;
    // The wire returns one row per BID — collapse to one row per auction
    // keeping the viewer's highest bid (its own bidState decides the
    // label, so the kept row is the honest one). A viewer who bid twice
    // on a lot otherwise renders duplicate keys with contradictory
    // states.
    const myBidApis = DATA_MODE === 'live'
      ? (() => {
          const perAuction = new Map<string, auctionsService.MyAuctionBidApi>();
          for (const b of (bids ?? []) as auctionsService.MyAuctionBidApi[]) {
            const existing = perAuction.get(b.auction.id);
            if (
              !existing ||
              b.amountGbp > existing.amountGbp ||
              (b.amountGbp === existing.amountGbp && b.createdAt > existing.createdAt)
            ) {
              perAuction.set(b.auction.id, b);
            }
          }
          return [...perAuction.values()];
        })()
      : [];
    const rows: MyBidRow[] =
      DATA_MODE === 'live'
        ? myBidApis.map((b) => {
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
            return { auction: toViewModel(item, correctedNow), myBid: b.amountGbp, status, placedAt: b.createdAt };
          })
        : myBidRows(
            (auctions ?? []).map((item) => toViewModel(item, correctedNow)),
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
  }, [auctions, bids, now, skew, viewerId]);

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
  const { data, dataUpdatedAt, isLoading, isError, refetch } = useQuery({
    // Live asks the backend for the seller's own page (seller=me) under
    // its own key — sharing ['auctions'] would let the filtered serve
    // overwrite the public board's cache. Fixture keeps the shared key
    // so session writes (created auctions, bid overlays) land here too.
    queryKey:
      DATA_MODE === 'live' ? ['auctions', 'seller', effectiveSellerId] : ['auctions'],
    // seller=me is authed-only — guests have no inventory to fetch.
    enabled: DATA_MODE !== 'live' || effectiveSellerId !== '',
    queryFn: async ({ signal }) => {
      if (DATA_MODE === 'live') {
        const page = await auctionsService.fetchAuctionBoard({ seller: 'me' }, signal);
        mergeEchoedWatches(page.items);
        return page.items;
      }
      await tick();
      return allAuctions();
    },
  });
  const skew = serverSkewMs(data, dataUpdatedAt);
  const auctions = useMemo(
    () =>
      (data ?? [])
        .filter((item) => item.sellerId === effectiveSellerId)
        .map((item) => toViewModel(item, now + skew)),
    [data, now, skew, effectiveSellerId],
  );
  return { auctions, isLoading, isError, refetch };
}

/**
 * Watching board — the viewer's watchlist as a server-side scope. Live
 * asks the backend (watchedOnly) so the tab isn't bounded by board page
 * 1; fixture keeps the local-store intersection. Locally-toggled ids the
 * server hasn't echoed yet resolve from the detail/board caches so an
 * optimistic watch surfaces immediately.
 */
export function useWatchedAuctionBoard(
  watched: ReadonlySet<string>,
  options: { enabled?: boolean } = {},
) {
  const { isGuest } = useSession();
  const qc = useQueryClient();
  const now = useNowTick(1000);
  // watchedOnly is authed-only — guests never hit the endpoint.
  const enabled = (options.enabled ?? true) && (DATA_MODE !== 'live' || !isGuest);
  const { data, dataUpdatedAt, isLoading, isError, refetch } = useQuery({
    queryKey: DATA_MODE === 'live' ? ['auctions', 'watched'] : ['auctions'],
    enabled,
    queryFn: async ({ signal }) => {
      if (DATA_MODE === 'live') {
        const page = await auctionsService.fetchAuctionBoard(
          { watchedOnly: true, limit: 60 },
          signal,
        );
        mergeEchoedWatches(page.items);
        return page.items;
      }
      await tick();
      return allAuctions();
    },
  });
  const skew = serverSkewMs(data, dataUpdatedAt);
  const auctions = useMemo(() => {
    const items = new Map<string, AuctionMarketItem>();
    for (const item of data ?? []) items.set(item.id, item);
    // Optimistic overlay — a watch toggled this session lands in the
    // local store before the next server read; pull the row from the
    // detail/board caches it was toggled on.
    for (const id of watched) {
      if (items.has(id)) continue;
      const cached =
        qc.getQueryData<AuctionMarketItem | null>(['auction', id]) ??
        qc.getQueryData<AuctionMarketItem[]>(['auctions'])?.find((a) => a.id === id);
      if (cached) items.set(id, cached);
    }
    return sortAuctions(
      [...items.values()]
        .filter((item) => watched.has(item.id))
        .map((item) => toViewModel(item, now + skew)),
    );
  }, [data, watched, now, skew, qc]);
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
  /** One stable key per form session — the caller mints it once and holds
   *  it across retries so a lost response replays the created auction
   *  server-side instead of double-listing. Fixture mode ignores it. */
  idempotencyKey?: string;
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
          // The caller supplies one key per form session; fall back to a
          // fresh one so a bare call can never go out unsigned.
          idempotencyKey:
            input.idempotencyKey ?? auctionsService.newAuctionCreateAttemptKey(),
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

// ============================================================================
// Seller lifecycle — cancel a running auction, accept a below-reserve hammer
// ============================================================================

/** Shared post-write refresh — every surface reading this auction
 *  (detail, hub scopes, seller board, my-bids) re-reads after a state
 *  transition the server owns. */
function invalidateAuctionSurfaces(qc: ReturnType<typeof useQueryClient>, auctionId: string) {
  qc.invalidateQueries({ queryKey: ['auction', auctionId] });
  qc.invalidateQueries({ queryKey: ['auctions'] });
  qc.invalidateQueries({ queryKey: ['auction-bids-all'] });
}

/**
 * POST /auctions/:auctionId/cancel — seller-only. The route refuses a
 * settled run and any run with a bound winner; surfaces only render this
 * while the auction can still legally cancel. Live hits the real route;
 * fixture marks the session auction cancelled (the row lands in Unsold —
 * an honest simulation of the same write, not a fake success).
 */
export function useCancelAuction(auctionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { reason?: string } = {}) => {
      if (DATA_MODE === 'live') {
        return auctionsService.cancelAuction(auctionId, input.reason);
      }
      await tick(300);
      runtimeCancelled.add(auctionId);
      return { ok: true as const, auctionId, cancelledAt: new Date().toISOString() };
    },
    onSuccess: () => invalidateAuctionSurfaces(qc, auctionId),
  });
}

/**
 * POST /auctions/:auctionId/accept-highest-bid — seller-only, and only
 * while the server holds status 'reserve_not_met'. Live-mode only by
 * construction: a fixture accept would mint a sale with no order behind
 * it, so the mutation refuses rather than fabricate one.
 */
export function useAcceptHighestBid(auctionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (DATA_MODE !== 'live') {
        throw new Error('Accepting bids isn’t supported in the demo');
      }
      return auctionsService.acceptHighestBid(auctionId);
    },
    onSuccess: () => {
      invalidateAuctionSurfaces(qc, auctionId);
      qc.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}
