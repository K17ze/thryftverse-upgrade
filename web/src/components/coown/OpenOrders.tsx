'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import type { CoOwnOrder } from '@/lib/contracts/coown';
import { timeAgo } from '@/lib/utils/format';
import { gbp } from './format';

const GRID =
  'hidden md:grid md:grid-cols-[minmax(0,1fr)_4.5rem_5.5rem_5.5rem_4.5rem_6.5rem_6.5rem_9rem]';

const SIDE_LABEL = { buy: 'Buy', sell: 'Sell' } as const;
const SIDE_TONE = { buy: 'text-coown-up', sell: 'text-coown-down' } as const;
const TYPE_LABEL = {
  limit: 'Limit',
  market: 'Market',
  protected_market: 'Protected',
} as const;

function statusLabel(order: CoOwnOrder): string {
  return order.status === 'open' ? 'Open' : order.status === 'partially_filled' ? 'Part filled' : order.status;
}

/**
 * The viewer's resting orders — price, units, fills, age, status and a
 * cancellable action. Cancel is a two-tap confirm (like the mobile
 * ConfirmationSheet): first tap arms the row, the confirm releases the
 * order. `onCancel` resolves when the ledger accepts the cancellation.
 */
export function OpenOrders({
  orders,
  assetTitle,
  onCancel,
}: {
  orders: CoOwnOrder[];
  assetTitle: (assetId: string) => string;
  /** Resolves when the ledger accepts the cancellation (sync in fixture mode). */
  onCancel: (id: string) => void | Promise<void>;
}) {
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const confirm = (order: CoOwnOrder) => {
    setBusyId(order.id);
    // Sync in fixture mode, async against the API — either way the row
    // leaves the open list when the order's status flips to cancelled.
    Promise.resolve(onCancel(order.id)).finally(() => {
      setBusyId(null);
      setConfirmingId(null);
    });
  };

  const confirmCopy = (order: CoOwnOrder) =>
    `Cancel this ${SIDE_LABEL[order.side].toLowerCase()} order — ${order.units - order.filledUnits} unfilled ${
      order.units - order.filledUnits === 1 ? 'unit is' : 'units are'
    } released right away.`;

  return (
    <section aria-labelledby="open-orders-heading">
      <div className="flex items-baseline justify-between">
        <h2 id="open-orders-heading" className="text-section-title font-semibold text-text-primary">
          Open orders
        </h2>
        <p className="text-meta text-text-muted tnum">{orders.length} resting</p>
      </div>

      {orders.length === 0 ? (
        <EmptyState
          compact
          icon="clock"
          title="No open orders"
          subtitle="Limit orders you place on any market will rest here until filled or cancelled."
        />
      ) : (
        <>
          <div className={`${GRID} mt-4 gap-4 border-b border-border-subtle px-1 pb-2`}>
            <span className="text-micro font-semibold uppercase tracking-[0.08em] text-text-muted">Asset</span>
            <span className="text-micro font-semibold uppercase tracking-[0.08em] text-text-muted">Side</span>
            <span className="text-micro font-semibold uppercase tracking-[0.08em] text-text-muted">Type</span>
            <span className="text-right text-micro font-semibold uppercase tracking-[0.08em] text-text-muted">Price</span>
            <span className="text-right text-micro font-semibold uppercase tracking-[0.08em] text-text-muted">Units</span>
            <span className="text-right text-micro font-semibold uppercase tracking-[0.08em] text-text-muted">Placed</span>
            <span className="text-micro font-semibold uppercase tracking-[0.08em] text-text-muted">Status</span>
            <span className="sr-only">Cancel</span>
          </div>
          <ul className="divide-y divide-border-subtle">
            {orders.map((order) => {
              const confirming = confirmingId === order.id;
              const busy = busyId === order.id;
              return (
                <li key={order.id}>
                  {/* Mobile */}
                  <div className="py-4 md:hidden">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="clamp-1 text-body-emphasis font-semibold text-text-primary">
                          {assetTitle(order.assetId)}
                        </p>
                        <p className="mt-0.5 text-meta text-text-secondary tnum">
                          <span className={`font-semibold ${SIDE_TONE[order.side]}`}>
                            {SIDE_LABEL[order.side]}
                          </span>
                          {' · '}
                          {TYPE_LABEL[order.orderType]} · {order.units} units @ {gbp(order.unitPriceGbp)}
                        </p>
                      </div>
                      <Badge variant="neutral">{statusLabel(order)}</Badge>
                    </div>
                    {order.filledUnits > 0 ? (
                      <p className="mt-1 text-meta text-text-muted tnum">
                        {order.filledUnits} of {order.units} filled
                      </p>
                    ) : null}
                    <div className="mt-2.5 flex items-center justify-between gap-3">
                      <p className="text-meta text-text-muted tnum">Placed {timeAgo(order.placedAt)}</p>
                      {confirming ? (
                        <div className="flex items-center gap-2">
                          <Button size="sm" variant="quiet" onClick={() => setConfirmingId(null)} disabled={busy}>
                            Keep
                          </Button>
                          <Button size="sm" variant="danger" onClick={() => confirm(order)} disabled={busy}>
                            {busy ? 'Cancelling…' : 'Cancel order'}
                          </Button>
                        </div>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => setConfirmingId(order.id)}>
                          Cancel
                        </Button>
                      )}
                    </div>
                    {confirming ? (
                      <p className="mt-1.5 text-meta text-text-secondary">{confirmCopy(order)}</p>
                    ) : null}
                  </div>

                  {/* Desktop — row swaps to a confirm strip when armed */}
                  {confirming ? (
                    <div className="hidden items-center justify-between gap-4 border-l-2 border-danger-border px-1 py-3.5 md:flex">
                      <p className="text-body text-text-secondary">
                        {confirmCopy(order)}
                      </p>
                      <div className="flex shrink-0 items-center gap-2">
                        <Button size="sm" variant="quiet" onClick={() => setConfirmingId(null)} disabled={busy}>
                          Keep
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => confirm(order)} disabled={busy}>
                          {busy ? 'Cancelling…' : 'Cancel order'}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className={`${GRID} hidden items-center gap-4 px-1 py-3.5 md:grid`}>
                      <p className="clamp-1 text-body-emphasis font-semibold text-text-primary">
                        {assetTitle(order.assetId)}
                      </p>
                      <p className={`text-body font-semibold tnum ${SIDE_TONE[order.side]}`}>
                        {SIDE_LABEL[order.side]}
                      </p>
                      <p className="text-body text-text-secondary">{TYPE_LABEL[order.orderType]}</p>
                      <p className="text-right text-body text-text-primary tnum">{gbp(order.unitPriceGbp)}</p>
                      <p className="text-right text-body text-text-secondary tnum">
                        {order.units}
                        {order.filledUnits > 0 ? (
                          <span className="block text-meta text-text-muted">{order.filledUnits} filled</span>
                        ) : null}
                      </p>
                      <p className="text-right text-meta text-text-secondary tnum">{timeAgo(order.placedAt)}</p>
                      <Badge variant="neutral">{statusLabel(order)}</Badge>
                      <div className="justify-self-end">
                        <Button size="sm" variant="outline" onClick={() => setConfirmingId(order.id)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
