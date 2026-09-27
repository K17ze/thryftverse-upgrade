'use client';

/**
 * Co-Own order lifecycle — the single write path for trades and cancels.
 * Fixture mode treats the react-query cache as the session ledger (same
 * posture as the coown query hooks): a confirmed order writes the order
 * row, updates the position, prints to the market tape + activity feed,
 * mutates the book, and settles against the wallet's 1ZE pocket — all in
 * one pass, so a receipt can never claim a fill no state supports.
 *
 * Live mode posts to /co-own/* and re-reads the affected queries.
 */

import { useQueryClient } from '@tanstack/react-query';
import type {
  ActivityEvent,
  CoOwnAsset,
  CoOwnOrder,
  CoOwnPosition,
  OrderBookLevel,
  OrderBookSnapshot,
  OrderDuration,
  OrderType,
  TradeLedgerEntry,
  TradeSide,
} from '@/lib/contracts/coown';
import {
  CO_OWN_ACTIVITY,
  CO_OWN_ASSETS,
  CO_OWN_OPEN_ORDERS,
  CO_OWN_POSITIONS,
  MARKET_LEDGER,
} from '@/lib/data/fixtures-coown';
import { DATA_MODE } from '@/lib/api/client';
import * as coownService from '@/lib/api/services/coown';
import { useSession } from '@/lib/session/SessionProvider';
import type { WalletData } from '@/components/wallet/useWalletData';
import { walletKeys } from '@/components/wallet/walletKeys';
import { GBP_PER_USD, round2 } from '@/components/wallet/convertViewModel';
import { planExecution, type ExecutionPlan } from './orderExecution';

// ── Shared cache addresses — must match lib/hooks/coown-queries ──────

const ASSETS_KEY = ['coown', 'assets'] as const;
const assetKey = (id: string) => ['coown', 'asset', id] as const;
const BOOK_KEY = (id: string) => ['coown', 'book', id] as const;
const ORDERS_KEY = ['coown', 'orders'] as const;
const POSITIONS_KEY = ['coown', 'positions'] as const;
const LEDGER_KEY = (id: string) => ['coown', 'ledger', id] as const;
const TAPE_KEY = ['coown', 'tape'] as const;
const ACTIVITY_KEY = (id?: string) => ['coown', 'activity', id ?? 'all'] as const;

/** Session order ids carry this prefix so cancels know a release is owed
 *  (fixture seeds were never reserved against — they only flip status). */
const SESSION_PREFIX = 'sess-';
let seq = 0;
const nextOrderId = () =>
  `${SESSION_PREFIX}${Date.now().toString(36)}-${(seq++).toString(36)}`;

/** GBP obligation → 1ZE settlement units (1ZE is USD-par). */
const gbpToIze = (gbp: number) => round2(gbp / GBP_PER_USD);

export interface PlaceOrderInput {
  asset: CoOwnAsset;
  side: TradeSide;
  orderType: OrderType;
  units: number;
  limitPriceGbp: number | null;
  /** Time-in-force for the resting remainder — limit orders only.
   *  'day' maps to GFD, 'gtc' to GTC90 on the wire. */
  duration?: OrderDuration;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  /** Stable per attempt — the server dedupes on it, so callers mint one
   *  key when the user confirms an order and reuse it across retries. */
  idempotencyKey?: string;
}

export interface PlaceOrderResult {
  order: CoOwnOrder;
  /** The evaluated plan — null in live mode (the server owns fills). */
  plan: ExecutionPlan | null;
}

export function usePlaceCoOwnOrder() {
  const queryClient = useQueryClient();
  const { user } = useSession();

  /**
   * Pin the caches a fill touches so a remount can't re-seed them from
   * fixtures mid-session (the read hooks ship default staleTime).
   */
  const pinSessionKeys = (assetId: string) => {
    if (DATA_MODE === 'live') return;
    for (const key of [
      BOOK_KEY(assetId),
      LEDGER_KEY(assetId),
      TAPE_KEY,
      assetKey(assetId),
      ASSETS_KEY,
      ACTIVITY_KEY(assetId),
      ACTIVITY_KEY(),
      walletKeys.all(user?.id),
    ]) {
      queryClient.setQueryDefaults(key, { staleTime: Infinity, gcTime: Infinity });
    }
  };

  const placeOrder = async (input: PlaceOrderInput): Promise<PlaceOrderResult> => {
    const { asset, side, orderType, units, limitPriceGbp } = input;
    // Duration is only meaningful when part of the order can rest.
    const duration = orderType === 'limit' ? (input.duration ?? 'gtc') : undefined;
    const plan = planExecution({ side, orderType, units, limitPriceGbp, bids: input.bids, asks: input.asks });

    // Ledger-level enforcement — the composer gate is UX; the write path
    // re-checks whatever state it settles against so a stale UI can't
    // push an order the ledger wouldn't honour.
    if (!user) throw new Error('auth_required');
    if (DATA_MODE !== 'live') {
      // Every order settles against the 1ZE pocket — if the wallet entry
      // or its pocket isn't in the cache there's nothing truthful to
      // debit/credit.
      const wallet = queryClient.getQueryData<WalletData>(walletKeys.all(user.id));
      if (!wallet?.ize) throw new Error('wallet_unavailable');
      if (side === 'sell') {
        const positions =
          queryClient.getQueryData<CoOwnPosition[]>([...POSITIONS_KEY]) ?? CO_OWN_POSITIONS;
        const held = positions.find((p) => p.assetId === asset.id)?.units ?? 0;
        if (units > held) throw new Error('insufficient_units');
      } else {
        const availableIze = round2(wallet.ize.settled - wallet.ize.reserved);
        if (gbpToIze(plan.requiredGbp) > availableIze + 0.005) {
          throw new Error('insufficient_funds');
        }
      }
    }

    if (DATA_MODE === 'live') {
      const order = await coownService.placeCoOwnOrder({
        assetId: asset.id,
        side,
        orderType,
        units,
        limitPriceGbp: limitPriceGbp ?? undefined,
        // The plan's cap IS the protection price for protected orders.
        protectionPriceGbp:
          orderType === 'protected_market' ? plan.capPriceGbp ?? undefined : undefined,
        timeInForce: duration === 'day' ? 'GFD' : duration === 'gtc' ? 'GTC90' : undefined,
        // Missing keys fail closed — a real money command without a
        // dedupe key is refused rather than sent unreconcilable.
        idempotencyKey:
          input.idempotencyKey ??
          (() => {
            throw new Error('idempotency_key_required');
          })(),
      });
      for (const key of [
        ORDERS_KEY,
        POSITIONS_KEY,
        BOOK_KEY(asset.id),
        LEDGER_KEY(asset.id),
        TAPE_KEY,
        assetKey(asset.id),
        ASSETS_KEY,
        ACTIVITY_KEY(asset.id),
        walletKeys.root,
      ]) {
        void queryClient.invalidateQueries({ queryKey: [...key] });
      }
      return { order, plan: null };
    }

    const now = new Date().toISOString();
    const restingPrice = plan.restingUnits > 0 ? (limitPriceGbp ?? 0) : 0;
    const fullGross = round2(plan.fillGrossGbp + plan.restingUnits * restingPrice);
    const fullFee = round2(fullGross * 0.01);

    const order: CoOwnOrder = {
      id: nextOrderId(),
      assetId: asset.id,
      side,
      orderType,
      unitPriceGbp:
        orderType === 'limit'
          ? (limitPriceGbp ?? plan.referencePriceGbp)
          : (plan.avgFillPriceGbp ?? plan.referencePriceGbp),
      units,
      filledUnits: plan.filledUnits,
      status: plan.status,
      // Fee charged to date — the resting remainder's fee lands at fill.
      feeGbp: plan.fillFeeGbp,
      totalGbp: side === 'buy' ? round2(fullGross + fullFee) : round2(fullGross - fullFee),
      duration,
      placedAt: now,
    };

    pinSessionKeys(asset.id);

    // 1 · the order row — every surface that lists orders reads this.
    queryClient.setQueryData<CoOwnOrder[]>(ORDERS_KEY, (old) => [
      order,
      ...(old ?? CO_OWN_OPEN_ORDERS),
    ]);

    // 2 · positions — buys blend avg entry; sells lock the full request
    //    in the order (the unfilled remainder returns on cancel).
    queryClient.setQueryData<CoOwnPosition[]>(POSITIONS_KEY, (old) => {
      const list = old ?? CO_OWN_POSITIONS;
      if (side === 'buy') {
        if (plan.filledUnits === 0) return list;
        const existing = list.find((p) => p.assetId === asset.id);
        if (!existing) {
          return [
            ...list,
            {
              assetId: asset.id,
              units: plan.filledUnits,
              // Cost basis is fee-inclusive — gross + the 1% buy fee —
              // so reported P&L is net of what the units actually cost.
              avgEntryPriceGbp: round2(
                (plan.fillGrossGbp + plan.fillFeeGbp) / plan.filledUnits,
              ),
              realizedProfitGbp: 0,
            },
          ];
        }
        return list.map((p) =>
          p.assetId === asset.id
            ? {
                ...p,
                units: p.units + plan.filledUnits,
                // Blend fee-inclusive cost — the buy fee is part of basis.
                avgEntryPriceGbp: round2(
                  (p.units * p.avgEntryPriceGbp + plan.fillGrossGbp + plan.fillFeeGbp) /
                    (p.units + plan.filledUnits),
                ),
              }
            : p,
        );
      }
      return list.map((p) => {
        if (p.assetId !== asset.id) return p;
        // Realized P&L is proceeds minus the cost basis of the units sold —
        // average cost, the same basis the position rows display. A losing
        // sale books a negative figure; proceeds alone are never profit.
        const costBasisGbp = plan.filledUnits * p.avgEntryPriceGbp;
        return {
          ...p,
          units: Math.max(0, p.units - units),
          realizedProfitGbp: round2(
            p.realizedProfitGbp + plan.fillGrossGbp - plan.fillFeeGbp - costBasisGbp,
          ),
        };
      });
    });

    // 3 · the book — fills consume depth; the resting remainder adds a level.
    queryClient.setQueryData<OrderBookSnapshot | null>(BOOK_KEY(asset.id), (old) => {
      const base: OrderBookSnapshot =
        old ?? {
          assetId: asset.id,
          bids: [],
          asks: [],
          serverTime: now,
          source: 'fallback',
          reconciliationState: 'reconciled',
        };
      return {
        ...base,
        bids: plan.nextBids,
        asks: plan.nextAsks,
        serverTime: now,
      };
    });

    // 4 · the public tape — one print per level walked, newest first.
    if (plan.fills.length > 0) {
      const prints: TradeLedgerEntry[] = plan.fills.map((f, i) => ({
        id: `${order.id}-f${i}`,
        assetId: asset.id,
        side,
        units: f.units,
        unitPriceGbp: f.priceGbp,
        executedAt: now,
      }));
      queryClient.setQueryData<TradeLedgerEntry[]>(LEDGER_KEY(asset.id), (old) => [
        ...prints,
        ...(old ?? MARKET_LEDGER[asset.id] ?? []),
      ]);

      // Market-wide tape — prepend the prints when the aggregated cache
      // is warm; a cold cache re-aggregates from the per-asset ledgers on
      // mount, so seeding here is unnecessary.
      queryClient.setQueryData<TradeLedgerEntry[]>(TAPE_KEY, (old) =>
        old ? [...prints, ...old] : old,
      );

      // 5 · activity feed — the trade shows in the asset's history.
      const event: ActivityEvent = {
        id: `${order.id}-ev`,
        assetId: asset.id,
        kind: side,
        actorUsername: user?.username ?? 'you',
        units: plan.filledUnits,
        unitPriceGbp: plan.avgFillPriceGbp,
        note: null,
        at: now,
      };
      const seedFor = (key: readonly unknown[]) =>
        key[2] === 'all'
          ? CO_OWN_ACTIVITY
          : CO_OWN_ACTIVITY.filter((e) => e.assetId === asset.id);
      for (const key of [ACTIVITY_KEY(asset.id), ACTIVITY_KEY()]) {
        queryClient.setQueryData<ActivityEvent[]>(key, (old) => [
          event,
          ...(old ?? seedFor(key)),
        ]);
      }
    }

    // 6 · asset snapshot — last price + top of book stay consistent with
    //    the book the trade just wrote.
    const project = (a: CoOwnAsset): CoOwnAsset =>
      a.id !== asset.id
        ? a
        : {
            ...a,
            unitPriceGbp: plan.avgFillPriceGbp ?? a.unitPriceGbp,
            bestBidGbp: plan.nextBids[0]?.unitPriceGbp ?? null,
            bestAskGbp: plan.nextAsks[0]?.unitPriceGbp ?? null,
            bidDepthUnits: plan.nextBids.reduce((s, l) => s + l.units, 0),
            askDepthUnits: plan.nextAsks.reduce((s, l) => s + l.units, 0),
          };
    queryClient.setQueryData<CoOwnAsset | null>(assetKey(asset.id), (old) =>
      old ? project(old) : project(asset),
    );
    queryClient.setQueryData<CoOwnAsset[]>(ASSETS_KEY, (old) =>
      (old ?? CO_OWN_ASSETS).map(project),
    );

    // 7 · settlement — buys debit settled 1ZE and reserve the resting
    //    remainder; sells credit pending (proceeds await settlement).
    queryClient.setQueryData<WalletData>(walletKeys.all(user?.id), (old) => {
      if (!old?.ize) return old;
      const ize = { ...old.ize };
      if (side === 'buy') {
        ize.settled = round2(ize.settled - gbpToIze(plan.fillGrossGbp + plan.fillFeeGbp));
        ize.reserved = round2(ize.reserved + gbpToIze(plan.reserveGbp));
      } else {
        ize.pending = round2(ize.pending + gbpToIze(plan.fillGrossGbp - plan.fillFeeGbp));
      }
      return { ...old, ize };
    });

    return { order, plan };
  };

  return { placeOrder };
}

/**
 * Cancel a resting order — flips the status, then releases whatever the
 * order still holds: unfilled sell units return to the position, a buy's
 * 1ZE reserve is freed, and the resting depth leaves the book.
 */
export function useCancelCoOwnOrder() {
  const queryClient = useQueryClient();
  const { user } = useSession();

  const cancelOrder = async (orderId: string): Promise<boolean> => {
    const orders =
      queryClient.getQueryData<CoOwnOrder[]>([...ORDERS_KEY]) ?? CO_OWN_OPEN_ORDERS;
    const order = orders.find((o) => o.id === orderId);
    if (!order || (order.status !== 'open' && order.status !== 'partially_filled')) {
      return false;
    }

    if (DATA_MODE === 'live') {
      try {
        await coownService.cancelCoOwnOrder(orderId);
      } catch {
        return false;
      }
    }

    const unfilled = order.units - order.filledUnits;

    queryClient.setQueryData<CoOwnOrder[]>(ORDERS_KEY, (old) =>
      (old ?? orders).map((o) =>
        o.id === orderId ? { ...o, status: 'cancelled' as const } : o,
      ),
    );

    // Session orders hold real locks — release them. Fixture seeds were
    // never debited, so they only transition status.
    //
    // Only a limit order can rest on the book (orderExecution.ts:
    // restingUnits is 0 for market/protected), and only a resting buy
    // ever held a 1ZE reserve. A partially-filled market/protected order
    // keeps neither depth nor reserve — releasing anyway would shave
    // reserves held by other open orders.
    const rested = order.orderType === 'limit';
    if (DATA_MODE !== 'live' && order.id.startsWith(SESSION_PREFIX) && unfilled > 0) {
      if (rested) {
        const releaseBookLevel = (level: OrderBookLevel) => {
          const units = Math.max(0, level.units - unfilled);
          return { ...level, units, orderCount: Math.max(1, level.orderCount - 1) };
        };
        queryClient.setQueryData<OrderBookSnapshot | null>(BOOK_KEY(order.assetId), (old) => {
          if (!old) return old;
          const side = order.side === 'buy' ? 'bids' : 'asks';
          const next = old[side]
            .map((l) => (l.unitPriceGbp === order.unitPriceGbp ? releaseBookLevel(l) : l))
            .filter((l) => l.units > 0);
          return { ...old, [side]: next };
        });
      }

      if (order.side === 'sell') {
        // The full request was locked out of the position at placement —
        // the unfilled remainder returns for any order type.
        queryClient.setQueryData<CoOwnPosition[]>(POSITIONS_KEY, (old) =>
          (old ?? CO_OWN_POSITIONS).map((p) =>
            p.assetId === order.assetId ? { ...p, units: p.units + unfilled } : p,
          ),
        );
      } else if (rested) {
        queryClient.setQueryData<WalletData>(walletKeys.all(user?.id), (old) =>
          old?.ize
            ? {
                ...old,
                ize: {
                  ...old.ize,
                  reserved: Math.max(
                    0,
                    round2(old.ize.reserved - gbpToIze(unfilled * order.unitPriceGbp)),
                  ),
                },
              }
            : old,
        );
      }
    }

    if (DATA_MODE === 'live') {
      for (const key of [ORDERS_KEY, POSITIONS_KEY, BOOK_KEY(order.assetId), walletKeys.root]) {
        void queryClient.invalidateQueries({ queryKey: [...key] });
      }
    }
    return true;
  };

  return { cancelOrder };
}
