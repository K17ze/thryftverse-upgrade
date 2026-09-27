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
  CoOwnOrder,
  CoOwnPosition,
  CorporateAction,
  Distribution,
  DistributionReceipt,
  DueDiligenceProfile,
  OrderBookSnapshot,
  PriceWindow,
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
  return useQuery({
    queryKey: ['coown', 'book', assetId],
    queryFn: async (): Promise<OrderBookSnapshot | null> => {
      if (DATA_MODE === 'live') {
        return coownService.fetchCoOwnOrderBook(assetId);
      }
      await tick(90);
      return ORDER_BOOKS[assetId] ?? null;
    },
  });
}

export function usePriceHistory(assetId: string, window: PriceWindow) {
  return useQuery({
    queryKey: ['coown', 'price', assetId, window],
    queryFn: () => fetchCandles(assetId, window),
  });
}

/** Candle series for a set of assets at one window — screener/leaderboard
 *  grids read this once instead of a hook per row. */
export function usePriceHistoryMap(assetIds: readonly string[], window: PriceWindow) {
  return useQueries({
    queries: assetIds.map((assetId) => ({
      queryKey: ['coown', 'price', assetId, window] as const,
      queryFn: () => fetchCandles(assetId, window),
      staleTime: DATA_MODE === 'live' ? undefined : Infinity,
    })),
    combine: (results) =>
      assetIds.map((id, i) => ({ assetId: id, candles: results[i]?.data ?? [] })),
  });
}

/** Backend candles arrive in minor units + ISO timestamps — the web chart
 *  works in GBP numbers + Unix ms, converted once here at the boundary. */
async function fetchCandles(assetId: string, window: PriceWindow): Promise<CandlePoint[]> {
  if (DATA_MODE === 'live') {
    const { candles } = await coownService.fetchCoOwnPriceHistory(assetId, {
      interval: WINDOW_INTERVAL[window],
    });
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
  return useQuery({
    queryKey: ['coown', 'positions'],
    queryFn: async (): Promise<CoOwnPosition[]> => {
      if (DATA_MODE === 'live') {
        const { positions } = await coownService.fetchCoOwnPortfolio();
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

export function useCoOwnOrders() {
  return useQuery({
    queryKey: ['coown', 'orders'],
    queryFn: async (): Promise<CoOwnOrder[]> => {
      if (DATA_MODE === 'live') {
        return coownService.fetchCoOwnOrders();
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
          // No global activity endpoint — aggregate per-asset executions.
          const page = await coownService.fetchCoOwnAssets();
          const nested = await Promise.all(
            page.items.map((a) => coownService.fetchCoOwnActivity(a.id)),
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

export function useDistributions(assetId?: string) {
  return useQuery({
    queryKey: ['coown', 'distributions', assetId ?? 'all'],
    queryFn: async (): Promise<Distribution[]> => {
      if (DATA_MODE === 'live') {
        return coownService.fetchCoOwnDistributions(assetId);
      }
      await tick(120);
      return assetId ? DISTRIBUTIONS.filter((d) => d.assetId === assetId) : DISTRIBUTIONS;
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
    queryFn: () => coownService.fetchGovernanceVotes(actionId),
  });
}

/** The public tape for one market — masked counterparties, newest first. */
export function useMarketLedger(assetId: string) {
  return useQuery({
    queryKey: ['coown', 'ledger', assetId],
    queryFn: async (): Promise<TradeLedgerEntry[]> => {
      if (DATA_MODE === 'live') {
        return coownService.fetchCoOwnExecutions(assetId);
      }
      await tick(110);
      return MARKET_LEDGER[assetId] ?? [];
    },
  });
}

/**
 * The market-wide tape — every per-asset ledger folded into one stream,
 * newest first. Fixture mode reads each asset's session cache first so
 * prints written this session surface alongside the seeded tape; live
 * mode aggregates the per-asset executions endpoints (there is no global
 * tape endpoint).
 */
export function useMarketTape() {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: ['coown', 'tape'],
    queryFn: async (): Promise<TradeLedgerEntry[]> => {
      if (DATA_MODE === 'live') {
        const page = await coownService.fetchCoOwnAssets();
        const nested = await Promise.all(
          page.items.map((a) => coownService.fetchCoOwnExecutions(a.id).catch(() => [])),
        );
        return nested
          .flat()
          .sort((a, b) => Date.parse(b.executedAt) - Date.parse(a.executedAt));
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
        // The backend asset row carries trust/custody fields — project them
        // onto the web profile shape. No separate dossier endpoint exists.
        const asset = await coownService.fetchCoOwnAsset(assetId);
        if (!asset) return null;
        return {
          assetId,
          authenticatedBy: null,
          authenticatedAt: null,
          conditionGrade: null,
          conditionSummary: asset.custodyNote,
          documents: [],
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
        return distributions
          .filter((d) => (held.get(d.assetId) ?? 0) > 0)
          .map((d) => {
            const unitsHeld = held.get(d.assetId)!;
            return {
              id: d.id,
              assetId: d.assetId,
              kind: d.kind,
              amountPerUnitGbp: d.amountPerUnitGbp,
              unitsHeld,
              totalGbp: Math.round(unitsHeld * d.amountPerUnitGbp * 100) / 100,
              exDate: d.scheduledFor,
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

  return {
    /** Post an offer for the remaining units — expires in 24h like mobile. */
    createOffer(assetId: string, input: NewBuyoutOfferInput): Promise<CoOwnBuyoutOffer> | CoOwnBuyoutOffer {
      if (DATA_MODE === 'live') {
        // Server-owned creation — the cache refetches on success.
        return coownService
          .createBuyoutOffer(assetId, {
            offerPriceGbp: Math.round(input.offerPriceGbp * 100) / 100,
            targetUnits: input.targetUnits,
          })
          .then(() => {
            void queryClient.invalidateQueries({ queryKey: buyoutKey(assetId) });
            // Return a pending placeholder; the real row lands on refetch.
            const now = Date.now();
            return {
              id: `pending-${now.toString(36)}`,
              assetId,
              bidderUsername: input.bidderUsername,
              mine: true,
              offerPriceGbp: input.offerPriceGbp,
              targetUnits: input.targetUnits,
              acceptedUnits: 0,
              status: 'open' as const,
              expiresAt: new Date(now + 24 * 3_600_000).toISOString(),
              createdAt: new Date(now).toISOString(),
            };
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
     */
    acceptOffer(offerId: string, assetId: string, units: number): boolean | Promise<boolean> {
      if (DATA_MODE === 'live') {
        return coownService
          .acceptBuyoutOffer(offerId, units)
          .then(() => {
            void queryClient.invalidateQueries({ queryKey: buyoutKey(assetId) });
            void queryClient.invalidateQueries({ queryKey: ['coown', 'positions'] });
            return true;
          })
          .catch(() => false);
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
    queryFn: () => coownService.fetchGovernanceVotes(actionId),
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
