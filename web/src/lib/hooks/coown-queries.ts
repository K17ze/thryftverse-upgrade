/**
 * Co-Own query hooks — fixture-backed with simulated latency in fixture
 * mode; live mode targets the shared /co-own/* surface the mobile app uses.
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
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
    queryFn: async (): Promise<CandlePoint[]> => {
      if (DATA_MODE === 'live') {
        const res = await fetchJsonWithCandles(assetId, WINDOW_INTERVAL[window]);
        return res;
      }
      await tick(90);
      return priceWindow(assetId, window);
    },
  });
}

/** Backend candles arrive in minor units + ISO timestamps — the web chart
 *  works in GBP numbers + Unix ms, converted once here at the boundary. */
async function fetchJsonWithCandles(
  assetId: string,
  interval: '1h' | '4h' | '1d' | '1w',
): Promise<CandlePoint[]> {
  const { candles } = await coownService.fetchCoOwnPriceHistory(assetId, { interval });
  return candles.map((c) => ({
    t: Date.parse(c.timestamp),
    o: c.openGbpMinor / 100,
    h: c.highGbpMinor / 100,
    l: c.lowGbpMinor / 100,
    c: c.closeGbpMinor / 100,
    v: c.volumeUnits,
  }));
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

const ORDERS_KEY = ['coown', 'orders'] as const;

/**
 * Cancel a resting order. Mirrors the mobile contract
 * (cancelCoOwnOrder → the row transitions to 'cancelled' only on
 * acknowledgment; unfilled units are released). Fixture mode treats the
 * cache write as the ledger; live mode posts the cancel, marks the row
 * so the acknowledged state is visible immediately, then refetches.
 */
export function useCancelCoOwnOrder() {
  const queryClient = useQueryClient();
  return {
    async cancelOrder(orderId: string): Promise<boolean> {
      if (DATA_MODE === 'live') {
        try {
          await coownService.cancelCoOwnOrder(orderId);
        } catch {
          return false;
        }
      }
      queryClient.setQueryData<CoOwnOrder[]>(ORDERS_KEY, (old) =>
        (old ?? CO_OWN_OPEN_ORDERS).map((o) =>
          o.id === orderId ? { ...o, status: 'cancelled' as const } : o,
        ),
      );
      if (DATA_MODE === 'live') {
        void queryClient.invalidateQueries({ queryKey: ORDERS_KEY });
      }
      return true;
    },
  };
}

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
        // Receipts project from the distribution stream — per-viewer units
        // come back with the distribution when settled.
        const distributions = await coownService.fetchCoOwnDistributions();
        return distributions.map((d) => ({
          id: d.id,
          assetId: d.assetId,
          kind: d.kind,
          amountPerUnitGbp: d.amountPerUnitGbp,
          unitsHeld: 0,
          totalGbp: d.totalPotGbp,
          exDate: d.scheduledFor,
          paidAt: d.paidAt,
          status: d.status,
        }));
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
