/**
 * Order execution planning — the fill evaluator for the Co-Own market.
 * Pure functions over the order book; the mutation layer
 * (useCoOwnTrading) applies the plan to the shared caches, so the quote
 * the user confirms and the state that lands are one computation.
 *
 * Semantics:
 *  - market: walks the whole opposite side — must fill completely or the
 *    submit gate blocks it.
 *  - protected_market: same walk, capped at the ±1.5% protection band
 *    around the book mid (the mobile's protection price).
 *  - limit: fills every resting level at the limit price or better; the
 *    unfilled remainder rests on the book at the limit price.
 */

import type {
  CoOwnOrder,
  OrderBookLevel,
  OrderType,
  TradeSide,
} from '@/lib/contracts/coown';
import { CO_OWN_FEE_RATE, gbpToMinor, minorToGbp } from '@/lib/utils/trade';

/** Protected-market band — ±1.5% around the mid, matching trade.ts. */
export const PROTECTION_BAND_PCT = 0.015;

export interface LevelFill {
  priceGbp: number;
  units: number;
}

export interface ExecutionPlan {
  fills: LevelFill[];
  filledUnits: number;
  /** Units resting on the book at the limit price (limit orders only). */
  restingUnits: number;
  avgFillPriceGbp: number | null;
  worstFillPriceGbp: number | null;
  /** Mid (or touchline) used for the protection band and empty-book quotes. */
  referencePriceGbp: number;
  /** Effective price cap — limit price, protection price, or null (market). */
  capPriceGbp: number | null;
  /** GBP value of the executed portion. */
  fillGrossGbp: number;
  /** Fee charged on the executed portion (1%). */
  fillFeeGbp: number;
  /** Buy-side reserve for the resting remainder — released on cancel. */
  reserveGbp: number;
  /** Buy-side GBP obligation at placement: fills + fee + reserve. */
  requiredGbp: number;
  status: CoOwnOrder['status'];
  /** Opposite side consumed by fills + own side carrying the remainder. */
  nextBids: OrderBookLevel[];
  nextAsks: OrderBookLevel[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function feeOn(grossGbp: number): number {
  return minorToGbp(
    (gbpToMinor(grossGbp) * gbpToMinor(CO_OWN_FEE_RATE)) / 10000n,
  );
}

/** Insert or merge a resting level on the order's own side. */
function addRestingLevel(
  levels: OrderBookLevel[],
  side: TradeSide,
  priceGbp: number,
  units: number,
): OrderBookLevel[] {
  const existing = levels.find((l) => l.unitPriceGbp === priceGbp);
  const next = existing
    ? levels.map((l) =>
        l.unitPriceGbp === priceGbp
          ? { ...l, units: l.units + units, orderCount: l.orderCount + 1 }
          : l,
      )
    : [...levels, { side, unitPriceGbp: priceGbp, units, orderCount: 1 }];
  return next.sort((a, b) =>
    side === 'buy'
      ? b.unitPriceGbp - a.unitPriceGbp
      : a.unitPriceGbp - b.unitPriceGbp,
  );
}

/**
 * Evaluate an order against the book. Fills only execute at the cap
 * price or better — a buy limit ≥ best ask fills immediately, a sell ≤
 * best bid hits the bid side. The remainder of a limit order rests.
 */
export function planExecution(input: {
  side: TradeSide;
  orderType: OrderType;
  units: number;
  limitPriceGbp: number | null;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
}): ExecutionPlan {
  const { side, orderType, units, limitPriceGbp, bids, asks } = input;

  const bestBid = bids[0]?.unitPriceGbp ?? 0;
  const bestAsk = asks[0]?.unitPriceGbp ?? 0;
  const referencePriceGbp =
    bestBid > 0 && bestAsk > 0
      ? (bestBid + bestAsk) / 2
      : bestAsk > 0
        ? bestAsk
        : bestBid;

  const capPriceGbp =
    orderType === 'limit'
      ? limitPriceGbp
      : orderType === 'protected_market'
        ? side === 'buy'
          ? referencePriceGbp * (1 + PROTECTION_BAND_PCT)
          : referencePriceGbp * (1 - PROTECTION_BAND_PCT)
        : null;

  // Walk the opposite side within the cap — buys lift asks ascending,
  // sells hit bids descending.
  const bookSide = side === 'buy' ? asks : bids;
  const within = (price: number) =>
    capPriceGbp == null
      ? true
      : side === 'buy'
        ? price <= capPriceGbp + 1e-9
        : price >= capPriceGbp - 1e-9;

  const fills: LevelFill[] = [];
  const consumed = new Map<number, number>();
  let remaining = units;
  for (const level of bookSide) {
    if (remaining <= 0 || !within(level.unitPriceGbp)) continue;
    const take = Math.min(remaining, level.units);
    fills.push({ priceGbp: level.unitPriceGbp, units: take });
    consumed.set(level.unitPriceGbp, take);
    remaining -= take;
  }

  const filledUnits = units - remaining;
  const restingUnits = orderType === 'limit' ? remaining : 0;
  const fillGrossGbp = round2(
    fills.reduce((sum, f) => sum + f.priceGbp * f.units, 0),
  );
  const fillFeeGbp = feeOn(fillGrossGbp);
  const avgFillPriceGbp = filledUnits > 0 ? fillGrossGbp / filledUnits : null;
  const reserveGbp =
    side === 'buy' && restingUnits > 0 ? round2(restingUnits * (limitPriceGbp ?? 0)) : 0;
  const requiredGbp =
    side === 'buy' ? round2(fillGrossGbp + fillFeeGbp + reserveGbp) : 0;

  // Post-trade book: consume the walked levels, then rest the remainder.
  const consume = (levels: OrderBookLevel[]): OrderBookLevel[] =>
    levels
      .map((l) => {
        const took = consumed.get(l.unitPriceGbp);
        return took ? { ...l, units: l.units - took } : l;
      })
      .filter((l) => l.units > 0);

  let nextBids = side === 'buy' ? bids.map((l) => ({ ...l })) : consume(bids);
  let nextAsks = side === 'buy' ? consume(asks) : asks.map((l) => ({ ...l }));
  if (restingUnits > 0 && limitPriceGbp != null) {
    if (side === 'buy') {
      nextBids = addRestingLevel(nextBids, 'buy', limitPriceGbp, restingUnits);
    } else {
      nextAsks = addRestingLevel(nextAsks, 'sell', limitPriceGbp, restingUnits);
    }
  }

  const status: CoOwnOrder['status'] =
    filledUnits === units
      ? 'filled'
      : filledUnits > 0 && restingUnits > 0
        ? 'partially_filled'
        : restingUnits > 0
          ? 'open'
          : 'partially_filled';

  return {
    fills,
    filledUnits,
    restingUnits,
    avgFillPriceGbp: avgFillPriceGbp == null ? null : round2(avgFillPriceGbp),
    worstFillPriceGbp: fills.length > 0 ? fills[fills.length - 1]!.priceGbp : null,
    referencePriceGbp,
    capPriceGbp,
    fillGrossGbp,
    fillFeeGbp,
    reserveGbp,
    requiredGbp,
    status,
    nextBids,
    nextAsks,
  };
}
