/**
 * Co-Own query hooks — fixture-backed with simulated latency in fixture
 * mode; live mode targets the shared /co-own/* surface the mobile app uses.
 */

import { useMemo } from 'react';
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CandlePoint,
  CoOwnAsset,
  CoOwnBuyoutOffer,
  CoOwnDripEnrollment,
  CoOwnEligibility,
  CoOwnOrder,
  CoOwnPosition,
  CoOwnRecourse,
  CorporateAction,
  DistributionReceipt,
  DueDiligenceProfile,
  OrderBookSnapshot,
  PriceWindow,
  RiskDisclosureDocument,
  StoredPriceAlert,
  TradeLedgerEntry,
  VoteChoice,
} from '@/lib/contracts/coown';
import {
  buyoutOffersFor,
  CO_OWN_ACTIVITY,
  CO_OWN_ASSETS,
  CO_OWN_OPEN_ORDERS,
  CO_OWN_POSITIONS,
  CORPORATE_ACTIONS,
  DISTRIBUTIONS,
  DISTRIBUTION_RECEIPTS,
  DUE_DILIGENCE,
  MARKET_LEDGER,
  ORDER_BOOKS,
  priceWindow,
} from '@/lib/data/fixtures-coown';
import { DATA_MODE } from '@/lib/api/client';
import { ApiRequestError } from '@/lib/api/http';
import * as coownService from '@/lib/api/services/coown';
import { useSession } from '@/lib/session/SessionProvider';
import { useCoOwnVotes } from '@/lib/store/coownVotes';
import { useHydrated } from '@/lib/store/useStore';

const tick = (ms = 120) => new Promise((r) => setTimeout(r, ms));

/** Web price-window → backend OHLCV interval. */
const WINDOW_INTERVAL: Record<PriceWindow, '1h' | '4h' | '1d' | '1w'> = {
  '1D': '1h',
  '1W': '4h',
  '1M': '1d',
  ALL: '1w',
};

export function useCoOwnAssets() {
  return useQuery({
    queryKey: ['coown', 'assets'],
    queryFn: async () => {
      if (DATA_MODE === 'live') {
        const page = await coownService.fetchCoOwnAssets();
        return page.items;
      }
      await tick();
      return CO_OWN_ASSETS;
    },
  });
}

export function useCoOwnAsset(id: string) {
  return useQuery({
    queryKey: ['coown', 'asset', id],
    queryFn: async (): Promise<CoOwnAsset | null> => {
      if (DATA_MODE === 'live') {
        return coownService.fetchCoOwnAsset(id);
      }
      await tick(140);
      return CO_OWN_ASSETS.find((a) => a.id === id) ?? null;
    },
  });
}

export function useOrderBook(assetId: string) {
  const { isGuest } = useSession();
  return useQuery({
    queryKey: ['coown', 'book', assetId],
    queryFn: async (): Promise<OrderBookSnapshot | null> => {
      if (DATA_MODE === 'live') {
        return coownService.fetchCoOwnOrderBook(assetId);
      }
      await tick(90);
      return ORDER_BOOKS[assetId] ?? null;
    },
    // Guests can't hold the SSE transport (the stream route 401s without
    // a session even though the topic itself is public), so their book
    // refreshes on a short REST poll instead of going permanently stale.
    // Authenticated viewers get freshness from useCoOwnOrderBookStream.
    refetchInterval: DATA_MODE === 'live' && isGuest ? 5_000 : false,
  });
}

export function usePriceHistory(assetId: string, window: PriceWindow) {
  return useQuery({
    queryKey: ['coown', 'price', assetId, window],
    queryFn: ({ signal }) => fetchCandles(assetId, window, signal),
  });
}

/** Candle series for a set of assets at one window — screener/leaderboard
 *  grids read this once instead of a hook per row. */
export function usePriceHistoryMap(assetIds: readonly string[], window: PriceWindow) {
  return useQueries({
    queries: assetIds.map((assetId) => ({
      queryKey: ['coown', 'price', assetId, window] as const,
      queryFn: ({ signal }: { signal?: AbortSignal }) => fetchCandles(assetId, window, signal),
      staleTime: DATA_MODE === 'live' ? undefined : Infinity,
    })),
    combine: (results) =>
      assetIds.map((id, i) => ({ assetId: id, candles: results[i]?.data ?? [] })),
  });
}

/** Backend candles arrive in minor units + ISO timestamps — the web chart
 *  works in GBP numbers + Unix ms, converted once here at the boundary. */
async function fetchCandles(
  assetId: string,
  window: PriceWindow,
  signal?: AbortSignal,
): Promise<CandlePoint[]> {
  if (DATA_MODE === 'live') {
    const { candles } = await coownService.fetchCoOwnPriceHistory(
      assetId,
      { interval: WINDOW_INTERVAL[window] },
      signal,
    );
    return candles.map((c) => ({
      t: Date.parse(c.timestamp),
      o: c.openGbpMinor / 100,
      h: c.highGbpMinor / 100,
      l: c.lowGbpMinor / 100,
      c: c.closeGbpMinor / 100,
      v: c.volumeUnits,
    }));
  }
  await tick(90);
  return priceWindow(assetId, window);
}

export function useCoOwnPositions() {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: ['coown', 'positions'],
    queryFn: async (): Promise<CoOwnPosition[]> => {
      if (DATA_MODE === 'live') {
        const { positions, partial } = await coownService.fetchCoOwnPortfolio();
        // The `partial` flag is portfolio-level meta, not a position row —
        // park it in a sibling cache entry so surfaces can render the
        // "positions may be incomplete" banner without changing this key's
        // shape (session ledger writes treat it as CoOwnPosition[]).
        queryClient.setQueryData(PORTFOLIO_META_KEY, { partial });
        return positions;
      }
      await tick(120);
      return CO_OWN_POSITIONS;
    },
    // Session store posture in fixture mode — buyout acceptances write back
    // here, so the cache must not re-seed from fixtures on remount.
    staleTime: DATA_MODE === 'live' ? undefined : Infinity,
    gcTime: DATA_MODE === 'live' ? undefined : Infinity,
  });
}

const PORTFOLIO_META_KEY = ['coown', 'portfolio-meta'] as const;

/**
 * Portfolio-level flags hydrated alongside positions. `partial` is true
 * when the backend projection degraded (e.g. a marks source failed) —
 * the portfolio banner reads this so a degraded read never renders as a
 * complete one.
 */
export function useCoOwnPortfolioMeta() {
  return useQuery({
    queryKey: PORTFOLIO_META_KEY,
    queryFn: () => ({ partial: false }),
    // The positions queryFn is the only writer — this observer never
    // fetches itself; it just surfaces whatever meta landed last.
    staleTime: Infinity,
    gcTime: Infinity,
  });
}

export function useCoOwnOrders() {
  const { user } = useSession();
  return useQuery({
    queryKey: ['coown', 'orders', user?.id ?? 'anon'],
    // my-orders is an authenticated read — a guest has no open orders,
    // so don't fan out on markets that can't answer.
    enabled: DATA_MODE !== 'live' || !!user,
    queryFn: async (): Promise<CoOwnOrder[]> => {
      if (DATA_MODE === 'live') {
        // There is no aggregate "my orders" route — fan out per asset,
        // bounded. Candidates: held positions (orders can exist on assets
        // with zero units only for unfilled buys, so also the first
        // market page — the same bound useCoOwnActivity('all') uses).
        const [assetsPage, portfolio] = await Promise.all([
          coownService.fetchCoOwnAssets({ limit: 12 }),
          coownService.fetchCoOwnPortfolio(),
        ]);
        const assetIds = [
          ...portfolio.positions.map((p) => p.assetId),
          ...assetsPage.items.map((a) => a.id),
        ];
        return coownService.fetchCoOwnOrders(assetIds);
      }
      await tick(120);
      return CO_OWN_OPEN_ORDERS;
    },
    // Fixture mode: the cache is the session ledger — cancellations write
    // back here, so it must not re-seed from fixtures on remount.
    staleTime: DATA_MODE === 'live' ? undefined : Infinity,
    gcTime: DATA_MODE === 'live' ? undefined : Infinity,
  });
}

// Order cancellation lives in @/components/trading/useCoOwnTrading — the
// release-aware path (restores position units / wallet reserve / book
// depth). Do NOT re-add a status-only cancel here: it would silently
// strand reservations for session orders.

export function useCoOwnActivity(assetId?: string) {
  return useQuery({
    queryKey: ['coown', 'activity', assetId ?? 'all'],
    queryFn: async () => {
      if (DATA_MODE === 'live') {
        if (!assetId) {
          // No global activity endpoint — aggregate per-asset activity,
          // bounded to the first page slice so the feed can't fan out
          // unboundedly as the market count grows.
          const page = await coownService.fetchCoOwnAssets({ limit: 12 });
          const nested = await Promise.all(
            page.items.map((a) => coownService.fetchCoOwnActivity(a.id).catch(() => [])),
          );
          return nested.flat().sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
        }
        return coownService.fetchCoOwnActivity(assetId);
      }
      await tick(120);
      return assetId ? CO_OWN_ACTIVITY.filter((e) => e.assetId === assetId) : CO_OWN_ACTIVITY;
    },
  });
}

/**
 * Distributions for one asset (or all markets) — live reads return the
 * page verbatim: per-recipient rows for signed-in holders, public
 * per-asset aggregates for anonymous callers. Consumers must not assume
 * `items` is populated for guests — render `aggregates` then.
 */
export function useDistributions(assetId?: string) {
  const { user } = useSession();
  return useQuery({
    queryKey: ['coown', 'distributions', assetId ?? 'all', user?.id ?? 'anon'],
    queryFn: async (): Promise<coownService.CoOwnDistributionsPage> => {
      if (DATA_MODE === 'live') {
        return coownService.fetchCoOwnDistributions(assetId);
      }
      await tick(120);
      return {
        items: assetId ? DISTRIBUTIONS.filter((d) => d.assetId === assetId) : DISTRIBUTIONS,
        aggregates: [],
      };
    },
  });
}

export function useCorporateActions(assetId?: string) {
  return useQuery({
    queryKey: ['coown', 'actions', assetId ?? 'all'],
    queryFn: async (): Promise<CorporateAction[]> => {
      if (DATA_MODE === 'live') {
        return coownService.fetchCoOwnCorporateActions(assetId);
      }
      await tick(120);
      return assetId ? CORPORATE_ACTIONS.filter((a) => a.assetId === assetId) : CORPORATE_ACTIONS;
    },
  });
}

export const corporateActionVotesKey = (actionId: string) =>
  ['coown', 'action-votes', actionId] as const;

/**
 * Server-authoritative governance tally for one action — vote counts,
 * the viewer's recorded vote and eligibility. Live mode only: fixture
 * actions carry their own tallies and votes stay session-local, so the
 * query is disabled (data stays undefined) under fixtures.
 */
export function useCorporateActionVotes(actionId: string) {
  return useQuery({
    queryKey: corporateActionVotesKey(actionId),
    enabled: DATA_MODE === 'live',
    queryFn: ({ signal }) => coownService.fetchGovernanceVotes(actionId, signal),
  });
}

/** The public tape for one market — execution prints off coOwn_trades
 *  (GET /co-own/assets/:id/executions), newest first. The wire carries
 *  no aggressor side; side-less prints render the tick direction. */
export function useMarketLedger(assetId: string) {
  return useQuery({
    queryKey: ['coown', 'ledger', assetId],
    queryFn: async (): Promise<TradeLedgerEntry[]> => {
      if (DATA_MODE === 'live') {
        return coownService.fetchCoOwnExecutions(assetId, 50);
      }
      await tick(110);
      return MARKET_LEDGER[assetId] ?? [];
    },
  });
}

/**
 * The market-wide tape — every market's prints folded into one stream,
 * newest first. Fixture mode reads each asset's session cache first so
 * prints written this session surface alongside the seeded tape; live
 * mode hits the bounded global executions endpoint — no per-asset fan-out.
 */
export function useMarketTape() {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: ['coown', 'tape'],
    queryFn: async (): Promise<TradeLedgerEntry[]> => {
      if (DATA_MODE === 'live') {
        return coownService.fetchCoOwnGlobalExecutions(150);
      }
      await tick(120);
      return CO_OWN_ASSETS.flatMap(
        (a) =>
          queryClient.getQueryData<TradeLedgerEntry[]>(['coown', 'ledger', a.id]) ??
          MARKET_LEDGER[a.id] ??
          [],
      ).sort((a, b) => Date.parse(b.executedAt) - Date.parse(a.executedAt));
    },
    // Session prints write into this cache — it must not re-seed.
    staleTime: DATA_MODE === 'live' ? undefined : Infinity,
    gcTime: DATA_MODE === 'live' ? undefined : Infinity,
  });
}

/** Authentication, condition, custody and appraisal docs for one asset. */
export function useDueDiligence(assetId: string) {
  return useQuery({
    queryKey: ['coown', 'diligence', assetId],
    queryFn: async (): Promise<DueDiligenceProfile | null> => {
      if (DATA_MODE === 'live') {
        // The detail endpoint carries the trust dossier (custody,
        // authenticity, appraisal, protection) — project it onto the
        // web profile shape. No separate dossier endpoint exists.
        const asset = await coownService.fetchCoOwnAsset(assetId);
        if (!asset) return null;
        const dossier = asset.dossier;
        const hasDossier =
          dossier != null && Object.values(dossier).some((v) => v != null);
        return {
          assetId,
          authenticatedBy: null,
          authenticatedAt: dossier?.authenticityVerifiedAt ?? null,
          conditionGrade: dossier?.conditionGrade ?? null,
          conditionSummary: asset.custodyNote ?? dossier?.provenance ?? null,
          documents: [],
          dossier: hasDossier ? dossier : undefined,
        };
      }
      await tick(110);
      return DUE_DILIGENCE[assetId] ?? null;
    },
  });
}

/** The viewer's income receipts across all holdings — newest ex-date first. */
export function useDistributionReceipts() {
  return useQuery({
    queryKey: ['coown', 'receipts'],
    queryFn: async (): Promise<DistributionReceipt[]> => {
      if (DATA_MODE === 'live') {
        // The distributions endpoint is platform-wide — it carries the pot
        // and per-unit rate, not the viewer's entitlement. Project receipts
        // only where the holding is real: a distribution on an asset the
        // portfolio shows zero units of can't pay the viewer anything.
        const [distributions, { positions }] = await Promise.all([
          coownService.fetchCoOwnDistributions(),
          coownService.fetchCoOwnPortfolio(),
        ]);
        const held = new Map(positions.map((p) => [p.assetId, p.units]));
        return distributions.items
          // The wire row already knows the record-date units — prefer it;
          // the portfolio holding is only the fallback for older payloads.
          // A holder who sold out since the snapshot still earned the
          // payout, so unitsAtRecord > 0 keeps the receipt visible.
          .filter((d) => (d.unitsAtRecord ?? held.get(d.assetId) ?? 0) > 0)
          .map((d) => {
            const unitsHeld = d.unitsAtRecord ?? held.get(d.assetId)!;
            return {
              id: d.id,
              assetId: d.assetId,
              kind: d.kind,
              rawType: d.rawType,
              amountPerUnitGbp: d.amountPerUnitGbp,
              unitsHeld,
              // The wire's per-recipient amount (amountGbpMinor mapped to
              // GBP) — recomputing units × rate would re-derive a figure
              // the server already settled.
              totalGbp: d.totalPotGbp,
              exDate: d.exDate ?? d.scheduledFor,
              paidAt: d.paidAt,
              status: d.status,
            };
          });
      }
      await tick(120);
      return [...DISTRIBUTION_RECEIPTS].sort(
        (a, b) => Date.parse(b.exDate) - Date.parse(a.exDate),
      );
    },
  });
}

// ── Buyout offers ─────────────────────────────────────────────────────
// Fixture mode: react-query cache doubles as the session store (same as
// syndicate-queries). Live mode reads /co-own/assets/:id/buyout-offers and
// posts to /co-own/buyout-offers/:id/accept.

const buyoutKey = (assetId: string) => ['coown', 'buyout', assetId] as const;

function seedOffers(assetId: string): CoOwnBuyoutOffer[] {
  return buyoutOffersFor(assetId).map((o) => ({ ...o }));
}

/** Active buyout offers on one asset — newest first. */
export function useBuyoutOffers(assetId: string) {
  const { user } = useSession();
  return useQuery({
    queryKey: buyoutKey(assetId),
    queryFn: async (): Promise<CoOwnBuyoutOffer[]> => {
      if (DATA_MODE === 'live') {
        return coownService.fetchCoOwnBuyoutOffers(assetId, user?.id);
      }
      await tick(110);
      return seedOffers(assetId);
    },
    staleTime: DATA_MODE === 'live' ? undefined : Infinity,
    gcTime: DATA_MODE === 'live' ? undefined : Infinity,
  });
}

export interface NewBuyoutOfferInput {
  bidderUsername: string;
  offerPriceGbp: number;
  /** Defaults to every unit the bidder doesn't hold. */
  targetUnits: number;
}

let buyoutSeq = 0;
const nextBuyoutId = (assetId: string) =>
  `${assetId}-bo-${Date.now().toString(36)}-${(buyoutSeq++).toString(36)}`;

export function useBuyoutActions() {
  const queryClient = useQueryClient();
  const { user } = useSession();

  return {
    /**
     * Post an offer for the remaining units — expires in 24h like mobile.
     * Live: POSTs the strict backend schema ({bidderUserId, offerPriceGbp,
     * targetUnits?, expiresInHours?} — the server rejects extra keys and
     * 403s a bidder that isn't the session user), resolves with the real
     * server offer, and rejects with the server's error verbatim.
     */
    createOffer(assetId: string, input: NewBuyoutOfferInput): Promise<CoOwnBuyoutOffer> | CoOwnBuyoutOffer {
      if (DATA_MODE === 'live') {
        if (!user) throw new ApiRequestError('Sign in to post a buyout offer', 401, { code: 'AUTH_REQUIRED' });
        return coownService
          .createBuyoutOffer(assetId, {
            bidderUserId: user.id,
            offerPriceGbp: Math.round(input.offerPriceGbp * 100) / 100,
            targetUnits: input.targetUnits,
            // The confirm sheet tells the holder the offer lapses in 24h —
            // send it rather than relying on the schema default drifting.
            expiresInHours: 24,
          })
          .then((offer) => {
            void queryClient.invalidateQueries({ queryKey: buyoutKey(assetId) });
            // The create response has no bidder username join — fill it
            // from the session for the first paint; the refetch overwrites.
            return offer.bidderUsername ? offer : { ...offer, bidderUsername: input.bidderUsername };
          });
      }
      const now = Date.now();
      const offer: CoOwnBuyoutOffer = {
        id: nextBuyoutId(assetId),
        assetId,
        bidderUsername: input.bidderUsername,
        mine: true,
        offerPriceGbp: Math.round(input.offerPriceGbp * 100) / 100,
        targetUnits: input.targetUnits,
        acceptedUnits: 0,
        status: 'open',
        expiresAt: new Date(now + 24 * 3_600_000).toISOString(),
        createdAt: new Date(now).toISOString(),
      };
      queryClient.setQueryData<CoOwnBuyoutOffer[]>(buyoutKey(assetId), (old) => [
        offer,
        ...(old ?? seedOffers(assetId)),
      ]);
      return offer;
    },

    /**
     * A holder commits units against an open offer. Updates the offer's
     * accepted tally (filled when the target is met) and draws the units
     * out of the viewer's position so holdings stay consistent.
     * Live: resolves with the server's post-acceptance tally; rejects with
     * the server's error verbatim — never a swallowed false.
     */
    acceptOffer(
      offerId: string,
      assetId: string,
      units: number,
    ): boolean | Promise<{ acceptedUnits: number; status: string }> {
      if (DATA_MODE === 'live') {
        if (!user) {
          return Promise.reject(
            new ApiRequestError('Sign in to accept a buyout offer', 401, { code: 'AUTH_REQUIRED' }),
          );
        }
        return coownService
          .acceptBuyoutOffer(offerId, { holderUserId: user.id, units })
          .then((result) => {
            void queryClient.invalidateQueries({ queryKey: buyoutKey(assetId) });
            void queryClient.invalidateQueries({ queryKey: ['coown', 'positions'] });
            return result;
          });
      }
      const offers = queryClient.getQueryData<CoOwnBuyoutOffer[]>(buyoutKey(assetId)) ?? seedOffers(assetId);
      const offer = offers.find((o) => o.id === offerId);
      const position = (queryClient.getQueryData<CoOwnPosition[]>(['coown', 'positions'])
        ?? CO_OWN_POSITIONS).find((p) => p.assetId === assetId);
      if (!offer || offer.status !== 'open' || Date.parse(offer.expiresAt) <= Date.now()) return false;
      const headroom = Math.min(position?.units ?? 0, offer.targetUnits - offer.acceptedUnits);
      if (units <= 0 || units > headroom) return false;

      queryClient.setQueryData<CoOwnBuyoutOffer[]>(buyoutKey(assetId), (old) =>
        (old ?? offers).map((o) =>
          o.id === offerId
            ? {
                ...o,
                acceptedUnits: o.acceptedUnits + units,
                status: o.acceptedUnits + units >= o.targetUnits ? 'filled' : o.status,
              }
            : o,
        ),
      );
      queryClient.setQueryData<CoOwnPosition[]>(['coown', 'positions'], (old) =>
        (old ?? CO_OWN_POSITIONS).map((p) =>
          p.assetId === assetId ? { ...p, units: Math.max(0, p.units - units) } : p,
        ),
      );
      return true;
    },
  };
}

// ── Governance votes ────────────────────────────────────────────────
// Mirrors the mobile ballot split: the corporate-action row is the
// record, the votes endpoint (live) / persisted store (fixture) is the
// ballot. Re-voting while open replaces the previous choice — the
// backend upserts, the fixture layer moves the viewer's units between
// buckets exactly once.

/**
 * Fold the viewer's persisted ballot into an action row for display.
 * Idempotent: when the row already carries the stored vote (post-cast
 * cache write), the tally is left untouched — never double-counted.
 */
export function withViewerVote(
  action: CorporateAction,
  stored: { vote: VoteChoice; votingPowerUnits: number } | undefined,
): CorporateAction {
  if (!stored) return action;
  if (stored.vote === action.yourVote) return { ...action, yourVote: stored.vote };
  const power = stored.votingPowerUnits;
  const next = { ...action };
  if (action.yourVote === 'for') next.votesFor = Math.max(0, action.votesFor - power);
  else if (action.yourVote === 'against') next.votesAgainst = Math.max(0, action.votesAgainst - power);
  else if (action.yourVote === 'abstain') next.votesAbstain = Math.max(0, action.votesAbstain - power);
  if (stored.vote === 'for') next.votesFor += power;
  else if (stored.vote === 'against') next.votesAgainst += power;
  else next.votesAbstain += power;
  next.yourVote = stored.vote;
  return next;
}

/**
 * Corporate actions as the viewer sees them — the persisted ballot store
 * folded into each row. In live mode the backend is authoritative and
 * the local store is bypassed (it only echoes a just-cast vote until the
 * refetch lands).
 */
export function useGovernanceActions(assetId?: string) {
  const query = useCorporateActions(assetId);
  const hydrated = useHydrated();
  const stored = useCoOwnVotes((s) => s.votes);
  const data = useMemo(
    () =>
      query.data?.map((a) =>
        DATA_MODE === 'live' ? a : withViewerVote(a, hydrated ? stored[a.id] : undefined),
      ),
    [query.data, stored, hydrated],
  );
  return { ...query, data };
}

/**
 * The live governance tally for one action — votes endpoint, enabled
 * only when the backend is connected. Fixture mode derives the same
 * figures from the action row + persisted store, so the views never
 * fabricate a second source of truth.
 */
export function useGovernanceVotes(actionId: string) {
  return useQuery({
    queryKey: ['coown', 'votes', actionId],
    queryFn: ({ signal }) => coownService.fetchGovernanceVotes(actionId, signal),
    enabled: DATA_MODE === 'live',
  });
}

/**
 * Cast (or re-cast) a ballot. Fixture mode writes the persisted store —
 * the durable record — then rewrites the actions caches so the tally the
 * viewer sees matches what the overlay will derive on remount. Live mode
 * posts the vote and re-reads the affected queries.
 */
export function useCastCorporateVote() {
  const queryClient = useQueryClient();
  const { user } = useSession();
  const castVoteStore = useCoOwnVotes((s) => s.castVote);

  const cast = async (input: {
    actionId: string;
    assetId: string;
    vote: VoteChoice;
    votingPowerUnits: number;
  }): Promise<boolean> => {
    if (!user || input.votingPowerUnits <= 0) return false;

    if (DATA_MODE === 'live') {
      try {
        await coownService.castGovernanceVote(input.actionId, {
          assetId: input.assetId,
          vote: input.vote,
        });
      } catch {
        return false;
      }
      // Local echo until the refetch lands — cleared implicitly by the
      // server-authoritative read in useGovernanceActions.
      castVoteStore(input.actionId, input.vote, input.votingPowerUnits);
      for (const key of [
        ['coown', 'actions', input.assetId],
        ['coown', 'actions', 'all'],
        ['coown', 'votes', input.actionId],
      ]) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
      return true;
    }

    const prior = useCoOwnVotes.getState().votes[input.actionId];
    castVoteStore(input.actionId, input.vote, input.votingPowerUnits);

    const apply = (list: CorporateAction[] | undefined) =>
      (list ?? CORPORATE_ACTIONS).map((a) => {
        if (a.id !== input.actionId) return a;
        // Displayed truth before this cast — raw row + prior stored ballot.
        const base = withViewerVote(a, prior);
        const removePower = base.yourVote
          ? (prior?.votingPowerUnits ?? input.votingPowerUnits)
          : 0;
        const next = { ...base };
        if (base.yourVote === 'for') next.votesFor = Math.max(0, next.votesFor - removePower);
        else if (base.yourVote === 'against')
          next.votesAgainst = Math.max(0, next.votesAgainst - removePower);
        else if (base.yourVote === 'abstain')
          next.votesAbstain = Math.max(0, next.votesAbstain - removePower);
        if (input.vote === 'for') next.votesFor += input.votingPowerUnits;
        else if (input.vote === 'against') next.votesAgainst += input.votingPowerUnits;
        else next.votesAbstain += input.votingPowerUnits;
        next.yourVote = input.vote;
        return next;
      });
    queryClient.setQueryData<CorporateAction[]>(['coown', 'actions', input.assetId], apply);
    queryClient.setQueryData<CorporateAction[]>(['coown', 'actions', 'all'], apply);
    return true;
  };

  return { cast };
}

// ── Price alerts (server-persisted in live mode) ─────────────────────
// The backend owns evaluation + delivery — the web layer reads and
// mutates rows. Fixture mode stays on the device-local alertStore.

export type CoOwnPriceAlert = StoredPriceAlert & { triggeredAt: string | null };

export function useCoOwnPriceAlerts() {
  const { user } = useSession();
  return useQuery({
    queryKey: ['coown', 'price-alerts', user?.id],
    enabled: DATA_MODE === 'live' && !!user,
    queryFn: ({ signal }): Promise<CoOwnPriceAlert[]> =>
      coownService.fetchCoOwnPriceAlerts(signal),
  });
}

export function useCoOwnPriceAlertActions() {
  const queryClient = useQueryClient();
  const { user } = useSession();
  const key = ['coown', 'price-alerts', user?.id];

  const refresh = () =>
    void queryClient.invalidateQueries({ queryKey: ['coown', 'price-alerts'] });

  return {
    createAlert: async (input: {
      assetId: string;
      direction: 'above' | 'below';
      targetPriceGbp: number;
    }): Promise<boolean> => {
      try {
        await coownService.createCoOwnPriceAlert(input);
      } catch {
        return false;
      }
      refresh();
      return true;
    },
    // Server-side toggle — a fired alert re-arms (triggered_at clears).
    toggleAlert: async (alert: CoOwnPriceAlert): Promise<boolean> => {
      // Optimistic flip, then re-read — the server re-arms on activate.
      queryClient.setQueryData<CoOwnPriceAlert[]>(key, (old) =>
        (old ?? []).map((a) =>
          a.id === alert.id
            ? { ...a, active: !a.active, triggeredAt: a.active ? a.triggeredAt : null }
            : a,
        ),
      );
      try {
        await coownService.setCoOwnPriceAlertActive(alert.id, !alert.active);
      } catch {
        refresh();
        return false;
      }
      refresh();
      return true;
    },
    removeAlert: async (id: string): Promise<boolean> => {
      queryClient.setQueryData<CoOwnPriceAlert[]>(key, (old) =>
        (old ?? []).filter((a) => a.id !== id),
      );
      try {
        await coownService.deleteCoOwnPriceAlert(id);
      } catch {
        refresh();
        return false;
      }
      refresh();
      return true;
    },
  };
}

// ── Recourse — the holder-protection dossier ──────────────────────────
// Authenticated endpoint; in fixture mode no record exists (the dossier
// section fails closed rather than inventing liability terms).

export function useCoOwnRecourse(assetId: string) {
  const { user } = useSession();
  return useQuery({
    queryKey: ['coown', 'recourse', assetId, user?.id],
    enabled: DATA_MODE === 'live' && !!user,
    queryFn: ({ signal }): Promise<CoOwnRecourse> =>
      coownService.fetchCoOwnRecourse(assetId, signal),
  });
}

// ── Eligibility — the server's advisory verdict for this viewer ───────

export function useCoOwnEligibility(assetId: string) {
  const { user } = useSession();
  return useQuery({
    queryKey: ['coown', 'eligibility', assetId, user?.id],
    enabled: DATA_MODE === 'live' && !!user,
    queryFn: ({ signal }): Promise<CoOwnEligibility> =>
      coownService.fetchCoOwnEligibility(assetId, signal),
    // The decision is short-lived (server TTL) — don't serve it stale.
    staleTime: 30_000,
  });
}

// ── Policy — the versioned order/buyout caps the server enforces ─────

export function useCoOwnPolicy() {
  return useQuery({
    queryKey: ['coown', 'policy'],
    enabled: DATA_MODE === 'live',
    queryFn: ({ signal }): Promise<coownService.CoOwnPolicy> =>
      coownService.fetchCoOwnPolicy(signal),
    // Policy is versioned — effectively static within a session.
    staleTime: 5 * 60_000,
  });
}

// ── DRIP — per-asset dividend reinvestment enrolment ──────────────────

export function useDripEnrollments() {
  const { user } = useSession();
  return useQuery({
    queryKey: ['coown', 'drip', user?.id],
    enabled: DATA_MODE === 'live' && !!user,
    queryFn: ({ signal }): Promise<CoOwnDripEnrollment[]> =>
      coownService.fetchDripEnrollments(signal),
  });
}

export function useSetDripEnrollment() {
  const queryClient = useQueryClient();
  const { user } = useSession();
  const key = ['coown', 'drip', user?.id];

  return async (assetId: string, enrolled: boolean): Promise<boolean> => {
    queryClient.setQueryData<CoOwnDripEnrollment[]>(key, (old) => {
      const list = old ?? [];
      const found = list.some((e) => e.assetId === assetId);
      return found
        ? list.map((e) =>
            e.assetId === assetId
              ? { ...e, enrolled, enrolledAt: enrolled ? new Date().toISOString() : null }
              : e,
          )
        : [
            ...list,
            { assetId, enrolled, enrolledAt: enrolled ? new Date().toISOString() : null },
          ];
    });
    try {
      await coownService.setDripEnrollment(assetId, enrolled);
    } catch {
      void queryClient.invalidateQueries({ queryKey: key });
      return false;
    }
    return true;
  };
}

// ── Risk disclosure — the active document + the viewer's consent ──────
// Live mode only: consent is a server-side record, so fixture mode never
// asks. `accepted` starts false until the consent read resolves.

export function useRiskDisclosure() {
  const { user } = useSession();
  return useQuery({
    queryKey: ['compliance', 'risk-disclosure', user?.id],
    enabled: DATA_MODE === 'live' && !!user,
    queryFn: async ({ signal }): Promise<{
      document: RiskDisclosureDocument | null;
      accepted: boolean;
    }> => {
      const document = await coownService.fetchActiveRiskDisclosure(signal);
      if (!document || !user) return { document, accepted: false };
      const consent = await coownService
        .fetchUserConsent(user.id, document.id, signal)
        .catch(() => null);
      return { document, accepted: consent?.accepted ?? false };
    },
    staleTime: 60_000,
  });
}
