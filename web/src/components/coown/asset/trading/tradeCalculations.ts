import type {
  OrderBookLevel,
  OrderType,
  TradeSide,
} from '@/lib/contracts/coown';
import type { ExecutionPlan } from '@/components/trading/orderExecution';
import { round2 } from '@/components/wallet/convertViewModel';
import type { PreparedLiveOrder } from '@/components/trading/useCoOwnTrading';
import type { QuoteDisplay } from './TradeQuoteCard';

export function buildEffectiveAsks(
  asks: OrderBookLevel[],
  side: TradeSide,
  availableUnits: number,
  unitPriceGbp: number,
  isLive: boolean,
): OrderBookLevel[] {
  if (!isLive || side !== 'buy' || availableUnits <= 0) return asks;
  const poolUnits = availableUnits;
  const poolPrice = unitPriceGbp;
  const merged = asks.map((l) =>
    l.unitPriceGbp === poolPrice ? { ...l, units: l.units + poolUnits } : l,
  );
  if (!asks.some((l) => l.unitPriceGbp === poolPrice)) {
    merged.push({
      side: 'sell',
      unitPriceGbp: poolPrice,
      units: poolUnits,
      orderCount: 1,
    });
  }
  return merged.sort((a, b) => a.unitPriceGbp - b.unitPriceGbp);
}

export function calculateQuote(
  plan: ExecutionPlan,
  limitPriceGbp: number | null,
  side: TradeSide,
  orderType: OrderType,
  feeRate: number,
): QuoteDisplay {
  const restingGross = plan.restingUnits * (limitPriceGbp ?? 0);
  const gross = round2(plan.fillGrossGbp + restingGross);
  const fee = round2(gross * feeRate);
  return {
    side,
    orderType,
    estimate:
      plan.filledUnits > 0
        ? {
            filledUnits: plan.filledUnits,
            avgFillPriceGbp: plan.avgFillPriceGbp ?? 0,
            worstPriceGbp: plan.worstFillPriceGbp ?? 0,
          }
        : null,
    restingUnits: plan.restingUnits,
    grossNotionalGbp: gross,
    feeGbp: fee,
    feeRatePct: Number((feeRate * 100).toFixed(2)),
    totalGbp: side === 'buy' ? round2(gross + fee) : round2(gross - fee),
  };
}

export function calculateQuoteDrift({
  prepared,
  reviewing,
  side,
  effectiveAsks,
  bestBid,
  limitPriceGbp,
}: {
  prepared: PreparedLiveOrder | null;
  reviewing: boolean;
  side: TradeSide;
  effectiveAsks: OrderBookLevel[];
  bestBid: number | null;
  limitPriceGbp: number | null;
}) {
  const lockedRefPrice = prepared?.preview.estimatedFill.filledUnits
    ? prepared.preview.estimatedFill.avgFillPrice
    : (prepared?.preview.estimatedFill.worstPrice ?? limitPriceGbp ?? null);
  const liveBestPrice = reviewing
    ? side === 'buy'
      ? (effectiveAsks[0]?.unitPriceGbp ?? null)
      : bestBid
    : null;
  const quoteDriftPct =
    lockedRefPrice != null && liveBestPrice != null
      ? side === 'buy'
        ? ((lockedRefPrice - liveBestPrice) / lockedRefPrice) * 100
        : ((liveBestPrice - lockedRefPrice) / liveBestPrice) * 100
      : null;
  const marketMoved = quoteDriftPct != null && quoteDriftPct > 2;

  return { liveBestPrice, marketMoved };
}
