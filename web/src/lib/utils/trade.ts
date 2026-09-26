/**
 * Co-Own trade math — ported from mobile utils/tradeFlow.ts.
 * Pure functions; money arithmetic in integer minor units (1/10000 GBP)
 * to avoid IEEE 754 drift, matching the mobile BigInt approach.
 */

import type {
  FeeSchedule,
  FillEstimate,
  OrderBookLevel,
  OrderType,
  TradeQuote,
  TradeSide,
} from '@/lib/contracts/coown';

export const CO_OWN_FEE_RATE = 0.01;
export const CO_OWN_MAX_UNITS = 20;

export const DEFAULT_FEE_SCHEDULE: FeeSchedule = { rate: CO_OWN_FEE_RATE, fixed: 0 };

type Minor = bigint;

const SCALE = 10000n;

export function gbpToMinor(gbp: number): Minor {
  return BigInt(Math.round(gbp * 10000));
}

export function minorToGbp(minor: Minor): number {
  return Number(minor) / Number(SCALE);
}

function mulUnits(priceMinor: Minor, units: number): Minor {
  // units are integers — exact multiply.
  return priceMinor * BigInt(units);
}

function feeFor(principalMinor: Minor, schedule: FeeSchedule): Minor {
  const rateMinor = gbpToMinor(schedule.rate);
  return (principalMinor * rateMinor) / SCALE + gbpToMinor(schedule.fixed);
}

/**
 * Walk the book to estimate a fill. Buy walks asks ascending; sell walks
 * bids descending. Returns null when the book cannot cover the order.
 */
export function estimateFill(
  side: TradeSide,
  quantity: number,
  bids: OrderBookLevel[], // descending price
  asks: OrderBookLevel[], // ascending price
): FillEstimate | null {
  const levels = side === 'buy' ? asks : bids;
  let remaining = quantity;
  let totalMinor: Minor = 0n;
  let worstPrice = 0;
  let unitsFilled = 0;

  for (const level of levels) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, level.units);
    const priceMinor = gbpToMinor(level.unitPriceGbp);
    totalMinor += mulUnits(priceMinor, take);
    worstPrice = level.unitPriceGbp;
    unitsFilled += take;
    remaining -= take;
  }

  if (unitsFilled === 0) return null;
  return {
    filledUnits: unitsFilled,
    remainingUnits: remaining,
    avgFillPriceGbp: minorToGbp(totalMinor / BigInt(unitsFilled)),
    worstPriceGbp: worstPrice,
  };
}

/** Executable depth within ±bandPct of the mid — the mobile's liquidity band. */
export function computeDepthWithinBand(
  side: TradeSide,
  bids: OrderBookLevel[],
  asks: OrderBookLevel[],
  bandPct = 0.02,
): { depthUnits: number; midPrice: number } {
  const bestBid = bids[0]?.unitPriceGbp ?? 0;
  const bestAsk = asks[0]?.unitPriceGbp ?? 0;
  if (bestBid <= 0 || bestAsk <= 0) return { depthUnits: 0, midPrice: 0 };
  const mid = (bestBid + bestAsk) / 2;
  const lower = mid * (1 - bandPct);
  const upper = mid * (1 + bandPct);
  const levels = side === 'buy' ? asks : bids;
  const depthUnits = levels
    .filter((l) => l.unitPriceGbp >= lower && l.unitPriceGbp <= upper)
    .reduce((sum, l) => sum + l.units, 0);
  return { depthUnits, midPrice: mid };
}

export interface TradeQuoteInput {
  side: TradeSide;
  orderType: OrderType;
  units: number;
  /** Required for limit orders. */
  limitPriceGbp?: number | null;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  feeSchedule?: FeeSchedule;
}

/**
 * The single authoritative quote calculation. For protected_market the
 * order price is the reference (mid) plus a 1.5% protection band; the
 * estimate walks the book but the obligation is capped at the protection
 * price — mirroring the mobile's protected market semantics.
 */
export function buildTradeQuote(input: TradeQuoteInput): TradeQuote {
  const schedule = input.feeSchedule ?? DEFAULT_FEE_SCHEDULE;
  const { side, orderType, units, bids, asks } = input;

  const bestBid = bids[0]?.unitPriceGbp ?? 0;
  const bestAsk = asks[0]?.unitPriceGbp ?? 0;
  const referencePriceGbp =
    bestBid > 0 && bestAsk > 0 ? (bestBid + bestAsk) / 2 : bestAsk > 0 ? bestAsk : bestBid;

  const estimate =
    orderType === 'limit' && input.limitPriceGbp
      ? estimateFillAtPrice(side, units, input.limitPriceGbp, bids, asks)
      : estimateFill(side, units, bids, asks);

  let orderPriceGbp: number;
  if (orderType === 'limit') orderPriceGbp = input.limitPriceGbp ?? 0;
  else if (orderType === 'protected_market')
    orderPriceGbp = side === 'buy' ? referencePriceGbp * 1.015 : referencePriceGbp * 0.985;
  else orderPriceGbp = referencePriceGbp;

  const grossNotionalGbp = orderPriceGbp * units;
  const feeGbp = minorToGbp(feeFor(gbpToMinor(grossNotionalGbp), schedule));
  const totalGbp = side === 'buy' ? grossNotionalGbp + feeGbp : grossNotionalGbp - feeGbp;

  return {
    side,
    orderType,
    units,
    limitPriceGbp: orderType === 'limit' ? (input.limitPriceGbp ?? null) : null,
    referencePriceGbp,
    orderPriceGbp,
    estimate,
    grossNotionalGbp,
    feeGbp,
    totalGbp,
  };
}

/** Limit fills only execute at the limit price or better. */
function estimateFillAtPrice(
  side: TradeSide,
  quantity: number,
  limitPrice: number,
  bids: OrderBookLevel[],
  asks: OrderBookLevel[],
): FillEstimate | null {
  const levels = (side === 'buy' ? asks : bids).filter((l) =>
    side === 'buy' ? l.unitPriceGbp <= limitPrice : l.unitPriceGbp >= limitPrice,
  );
  let remaining = quantity;
  let totalMinor: Minor = 0n;
  let worstPrice = 0;
  let unitsFilled = 0;
  for (const level of levels) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, level.units);
    totalMinor += mulUnits(gbpToMinor(level.unitPriceGbp), take);
    worstPrice = level.unitPriceGbp;
    unitsFilled += take;
    remaining -= take;
  }
  if (unitsFilled === 0) return null;
  return {
    filledUnits: unitsFilled,
    remainingUnits: remaining,
    avgFillPriceGbp: minorToGbp(totalMinor / BigInt(unitsFilled)),
    worstPriceGbp: worstPrice,
  };
}

/** Submit-gate — mirrors the mobile's evaluateTradeSubmit. */
export function evaluateTradeSubmit(input: {
  units: number;
  orderType: OrderType;
  limitPriceGbp: number | null;
  quote: TradeQuote | null;
}): { enabled: boolean; reason?: string } {
  if (!Number.isInteger(input.units) || input.units <= 0)
    return { enabled: false, reason: 'Enter a whole number of units' };
  if (input.units > CO_OWN_MAX_UNITS)
    return { enabled: false, reason: `Maximum ${CO_OWN_MAX_UNITS} units per order` };
  if (input.orderType === 'limit' && (input.limitPriceGbp == null || input.limitPriceGbp <= 0))
    return { enabled: false, reason: 'Set a limit price' };
  if (!input.quote) return { enabled: false, reason: 'No quote available' };
  if (input.quote.estimate && input.quote.estimate.remainingUnits > 0)
    return { enabled: false, reason: `Only ${input.quote.estimate.filledUnits} units available at this price` };
  return { enabled: true };
}
