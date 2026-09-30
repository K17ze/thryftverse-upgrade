'use client';

/**
 * TradeQuoteCard — quotation display for Co-Own orders.
 * Shows estimated fill price, worst-case price, resting book remainder,
 * gross notional, platform fee with bps rate, and total settlement amount.
 */

import type { OrderType, TradeSide } from '@/lib/contracts/coown';
import { gbp } from '../../format';

export interface QuoteDisplay {
  side: TradeSide;
  orderType: OrderType;
  /** Null when nothing on the book crosses the order. */
  estimate: {
    filledUnits: number;
    avgFillPriceGbp: number;
    worstPriceGbp: number;
  } | null;
  restingUnits: number;
  grossNotionalGbp: number;
  feeGbp: number;
  /** Platform trading fee as a percentage figure — display only. */
  feeRatePct: number;
  totalGbp: number;
}

export function TradeQuoteCard({ quote }: { quote: QuoteDisplay }) {
  const est = quote.estimate;
  return (
    <dl className="mt-5 space-y-2 border-t border-border-subtle pt-4 text-body">
      {est ? (
        <>
          <div className="flex items-baseline justify-between">
            <dt className="text-text-secondary">Est. fill</dt>
            <dd className="text-text-primary tnum">
              {est.filledUnits} units @ {gbp(est.avgFillPriceGbp)}
            </dd>
          </div>
          <div className="flex items-baseline justify-between">
            <dt className="text-text-secondary">Worst price</dt>
            <dd className="text-text-primary tnum">{gbp(est.worstPriceGbp)}</dd>
          </div>
        </>
      ) : quote.orderType === 'limit' ? (
        <div className="flex items-baseline justify-between">
          <dt className="text-text-secondary">Resting</dt>
          <dd className="text-text-primary">Waits for a match on the book</dd>
        </div>
      ) : null}
      {quote.restingUnits > 0 && est ? (
        <div className="flex items-baseline justify-between">
          <dt className="text-text-secondary">Resting</dt>
          <dd className="text-text-primary tnum">{quote.restingUnits} units on the book</dd>
        </div>
      ) : null}
      <div className="flex items-baseline justify-between">
        <dt className="text-text-secondary">Gross</dt>
        <dd className="text-text-primary tnum">{gbp(quote.grossNotionalGbp)}</dd>
      </div>
      <div className="flex items-baseline justify-between">
        <dt className="text-text-secondary">Platform fee ({quote.feeRatePct}%)</dt>
        <dd className="text-text-primary tnum">{gbp(quote.feeGbp)}</dd>
      </div>
      <div className="flex items-baseline justify-between border-t border-border-subtle pt-2.5">
        <dt className="text-body-emphasis font-semibold text-text-primary">Total</dt>
        <dd className="text-body-emphasis font-semibold text-text-primary tnum" aria-live="polite">
          {gbp(quote.totalGbp)}
        </dd>
      </div>
    </dl>
  );
}
