import type { QueryClient } from '@tanstack/react-query';
import type {
  ActivityEvent,
  CoOwnAsset,
  CoOwnOrder,
  CoOwnPosition,
  OrderBookSnapshot,
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
import type { WalletData } from '@/components/wallet/useWalletData';
import { walletKeys } from '@/components/wallet/walletKeys';
import { round2 } from '@/components/wallet/convertViewModel';
import type { ExecutionPlan } from './orderExecution';
import {
  ACTIVITY_KEY,
  ASSETS_KEY,
  assetKey,
  BOOK_KEY,
  gbpToIze,
  LEDGER_KEY,
  ORDERS_KEY,
  POSITIONS_KEY,
  TAPE_KEY,
} from './tradingModel';

/**
 * Pin the caches a fill touches so a remount can't re-seed them from
 * fixtures mid-session (the read hooks ship default staleTime).
 */
export function pinSessionKeys(
  queryClient: QueryClient,
  userId: string | undefined,
  assetId: string,
) {
  if (DATA_MODE === 'live') return;
  for (const key of [
    BOOK_KEY(assetId),
    LEDGER_KEY(assetId),
    TAPE_KEY,
    assetKey(assetId),
    ASSETS_KEY,
    ACTIVITY_KEY(assetId),
    ACTIVITY_KEY(),
    walletKeys.all(userId),
  ]) {
    queryClient.setQueryDefaults(key, { staleTime: Infinity, gcTime: Infinity });
  }
}

export interface ApplyFixtureSettlementParams {
  queryClient: QueryClient;
  user: { id: string; username?: string };
  asset: CoOwnAsset;
  side: TradeSide;
  units: number;
  order: CoOwnOrder;
  plan: ExecutionPlan;
  now: string;
}

export function applyFixtureOrderSettlement({
  queryClient,
  user,
  asset,
  side,
  units,
  order,
  plan,
  now,
}: ApplyFixtureSettlementParams) {
  pinSessionKeys(queryClient, user.id, asset.id);

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
          (p.realizedProfitGbp ?? 0) + plan.fillGrossGbp - plan.fillFeeGbp - costBasisGbp,
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
      // Session fills settle inline — mark them so they render as
      // cleared money, the same state the wire emits.
      settlementStatus: 'settled',
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
  queryClient.setQueryData<WalletData>(walletKeys.all(user.id), (old) => {
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
}
