'use client';

import { Button } from '@/components/ui/Button';
import type { CoOwnOrder } from '@/lib/contracts/coown';
import { gbp } from '../format';

interface AssetRestingOrdersProps {
  orders: CoOwnOrder[];
  confirmingId: string | null;
  cancellingId: string | null;
  onConfirmId: (id: string | null) => void;
  onCancel: (order: CoOwnOrder) => void;
}

function confirmCancelCopy(o: CoOwnOrder) {
  const remaining = o.units - o.filledUnits;
  return `Cancel this ${o.side} order — ${remaining} unfilled ${
    remaining === 1 ? 'unit is' : 'units are'
  } released right away.`;
}

export function AssetRestingOrders({
  orders,
  confirmingId,
  cancellingId,
  onConfirmId,
  onCancel,
}: AssetRestingOrdersProps) {
  if (orders.length === 0) return null;

  return (
    <section className="mt-10" aria-labelledby="resting-heading">
      <div className="flex items-baseline justify-between">
        <h2
          id="resting-heading"
          className="text-micro font-semibold uppercase tracking-[0.08em] text-text-muted"
        >
          Your resting orders
        </h2>
        <p className="text-meta text-text-muted tnum">{orders.length}</p>
      </div>
      <ul className="mt-3 divide-y divide-border-subtle border-y border-border-subtle">
        {orders.map((o) => {
          const confirming = confirmingId === o.id;
          const busy = cancellingId === o.id;
          return (
            <li
              key={o.id}
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3"
            >
              <p className="text-body text-text-primary tnum">
                <span
                  className={`font-semibold ${o.side === 'buy' ? 'text-coown-up' : 'text-coown-down'}`}
                >
                  {o.side === 'buy' ? 'Buy' : 'Sell'}
                </span>
                <span className="text-text-secondary">
                  {' '}
                  · {o.orderType === 'limit' ? 'Limit' : o.orderType === 'market' ? 'Market' : 'Protected'} ·{' '}
                  {gbp(o.unitPriceGbp)} · {o.units} {o.units === 1 ? 'unit' : 'units'}
                </span>
              </p>
              <div className="flex items-center gap-3">
                <span className="text-meta text-text-muted">
                  {o.status === 'open'
                    ? 'Open'
                    : `Partial — ${o.filledUnits} of ${o.units} filled`}
                </span>
                {confirming ? (
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="quiet"
                      onClick={() => onConfirmId(null)}
                      disabled={busy}
                    >
                      Keep
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => void onCancel(o)}
                      disabled={busy}
                    >
                      {busy ? 'Cancelling…' : 'Cancel order'}
                    </Button>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onConfirmId(o.id)}
                  >
                    Cancel
                  </Button>
                )}
              </div>
              {confirming ? (
                <p className="w-full text-meta text-text-secondary">
                  {confirmCancelCopy(o)}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
