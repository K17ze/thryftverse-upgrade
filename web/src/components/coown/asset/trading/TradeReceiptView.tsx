'use client';

/**
 * TradeReceiptView — execution and placement receipt for Co-Own orders.
 * Shows filled vs resting status, average execution price, limit order
 * details, platform fees, order reference ID, and post-trade AML audit flags.
 */

import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import type { PlaceOrderResult } from '@/components/trading/useCoOwnTrading';
import type { OrderDuration, OrderType, TradeSide } from '@/lib/contracts/coown';
import { gbp } from '../../format';

const SIDE_LABEL: Record<TradeSide, string> = { buy: 'Buy', sell: 'Sell' };
const TYPE_LABEL: Record<OrderType, string> = { market: 'Market', limit: 'Limit', protected_market: 'Protected' };
const DURATION_LABEL: Record<OrderDuration, string> = {
  day: 'Day order',
  gtc: 'GTC · 90 days',
};

interface TradeReceiptViewProps {
  result: PlaceOrderResult;
  onDone: () => void;
}

export function TradeReceiptView({ result, onDone }: TradeReceiptViewProps) {
  const { order, plan, aml } = result;
  const est = plan && plan.filledUnits > 0 ? plan : null;
  const resting = plan?.restingUnits ?? 0;

  const headline =
    order.status === 'filled'
      ? 'Order filled'
      : order.status === 'partially_filled'
        ? 'Partially filled'
        : 'Order resting';
  const subline =
    order.status === 'open'
      ? `${SIDE_LABEL[order.side]} · ${TYPE_LABEL[order.orderType]} — waiting on the book`
      : `${SIDE_LABEL[order.side]} · ${TYPE_LABEL[order.orderType]}`;

  return (
    <div role="status" className="mt-5">
      <div className="flex items-center gap-2.5">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-success-subtle text-success-text">
          <Icon name={order.status === 'open' ? 'clock' : 'check'} filled size={20} />
        </span>
        <div>
          <p className="text-body-emphasis font-semibold text-text-primary">{headline}</p>
          <p className="text-meta text-text-secondary">{subline}</p>
        </div>
      </div>
      <dl className="mt-4 space-y-2 border-t border-border-subtle pt-4 text-body">
        <div className="flex items-baseline justify-between">
          <dt className="text-text-secondary">Units</dt>
          <dd className="text-text-primary tnum">
            {est ? `${order.filledUnits} filled of ${order.units}` : order.units}
          </dd>
        </div>
        {est ? (
          <div className="flex items-baseline justify-between">
            <dt className="text-text-secondary">Avg fill</dt>
            <dd className="text-text-primary tnum">{gbp(est.avgFillPriceGbp)}</dd>
          </div>
        ) : (
          <div className="flex items-baseline justify-between">
            <dt className="text-text-secondary">Limit price</dt>
            <dd className="text-text-primary tnum">{gbp(order.unitPriceGbp)}</dd>
          </div>
        )}
        {resting > 0 ? (
          <div className="flex items-baseline justify-between">
            <dt className="text-text-secondary">Resting</dt>
            <dd className="text-text-primary tnum">
              {resting} {resting === 1 ? 'unit' : 'units'} @ {gbp(order.unitPriceGbp)}
            </dd>
          </div>
        ) : null}
        {order.duration ? (
          <div className="flex items-baseline justify-between">
            <dt className="text-text-secondary">Time in force</dt>
            <dd className="text-text-primary">{DURATION_LABEL[order.duration]}</dd>
          </div>
        ) : null}
        <div className="flex items-baseline justify-between">
          <dt className="text-text-secondary">Fee</dt>
          <dd className="text-text-primary tnum">{gbp(order.feeGbp)}</dd>
        </div>
        <div className="flex items-baseline justify-between border-t border-border-subtle pt-2.5">
          <dt className="text-body-emphasis font-semibold text-text-primary">Total</dt>
          <dd className="text-body-emphasis font-semibold text-text-primary tnum">
            {gbp(order.totalGbp)}
          </dd>
        </div>
        <div className="flex items-baseline justify-between">
          <dt className="text-text-secondary">Reference</dt>
          <dd className="text-meta text-text-muted tnum">{order.id.toUpperCase().slice(0, 18)}</dd>
        </div>
      </dl>
      {/* Post-trade AML monitor flag — the trade executed and the server
          logged a review alert against it. Persistent on the receipt,
          not a disappearing toast; the alert id is the support ref. */}
      {aml ? (
        <p
          role="status"
          className="mt-4 flex items-start gap-2 rounded-md border border-warning-border bg-warning-subtle px-3 py-2.5 text-meta text-warning-text"
        >
          <Icon name="warning" size={14} className="mt-0.5 shrink-0" />
          <span>
            This trade was flagged for AML review.
            <span className="tnum text-text-muted"> Ref {aml.alertId}</span>
          </span>
        </p>
      ) : null}
      {order.status !== 'filled' ? (
        <p className="mt-3 text-meta text-text-muted">
          Open orders live under Portfolio — cancelling releases the remainder.
        </p>
      ) : null}
      <div className="mt-5 flex flex-col items-center gap-3">
        <Button variant="secondary" fullWidth onClick={onDone}>
          Done
        </Button>
        {order.status !== 'filled' ? (
          <Link
            href={`/co-own/orders?order=${encodeURIComponent(order.id)}`}
            className="pressable text-caption font-semibold text-text-secondary underline-offset-4 hover:text-text-primary hover:underline"
          >
            View in your orders
          </Link>
        ) : null}
      </div>
    </div>
  );
}
