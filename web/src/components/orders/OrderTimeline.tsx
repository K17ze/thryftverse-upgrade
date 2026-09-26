'use client';

/**
 * OrderTimeline — ordered → paid → shipped → delivered milestone trail.
 * Completed milestones get a quiet check; the newest completed state is the
 * highlighted one (filled node, stronger label); future milestones stay
 * muted with an honest pending caption. Cancelled/refunded orders and
 * carrier failures render a single honest banner instead of a fake
 * timeline.
 */

import type { CommerceOrder } from '@/lib/contracts/domain';
import { Icon } from '@/components/ui/Icon';
import type { OrderDetailInfo } from '@/lib/data/fixtures-commerce';
import { formatDate } from '@/lib/utils/format';
import { isCarrierFailureStatus, isCancelledStatus, normaliseOrderStatus } from './orderCapabilities';

const STEPS = ['ordered', 'paid', 'shipped', 'delivered'] as const;
type StepKey = (typeof STEPS)[number];

const FALLBACK_LABEL: Record<StepKey, string> = {
  ordered: 'Order placed',
  paid: 'Paid',
  shipped: 'Shipped',
  delivered: 'Delivered',
};

const PENDING_CAPTION: Record<StepKey, string> = {
  ordered: 'Processing',
  paid: 'Awaiting payment',
  shipped: 'Awaiting dispatch',
  delivered: 'After dispatch',
};

/** Statuses where each milestone is genuinely reached. */
const PAID_REACHED = new Set([
  'paid', 'processing', 'preparing',
  'shipped', 'in transit', 'out for delivery',
  'delivered', 'completed', 'delivery failed', 'returned',
]);
const SHIPPED_REACHED = new Set([
  'shipped', 'in transit', 'out for delivery',
  'delivered', 'completed', 'delivery failed', 'returned',
]);
const DELIVERED_REACHED = new Set(['delivered', 'completed']);

export function OrderTimeline({ order, detail }: { order: CommerceOrder; detail: OrderDetailInfo }) {
  if (isCancelledStatus(order.status)) {
    const key = normaliseOrderStatus(order.status);
    return (
      <div className="flex items-center gap-2 rounded-lg bg-danger-subtle px-4 py-3 text-body text-danger-text">
        <Icon name="alert" size={16} />
        {key === 'refunded'
          ? 'This order was refunded.'
          : key === 'refunding'
            ? 'A refund is in progress for this order.'
            : 'This order was cancelled.'}
      </div>
    );
  }

  if (isCarrierFailureStatus(order.status)) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-danger-subtle px-4 py-3 text-body text-danger-text">
        <Icon name="warning" size={16} />
        {normaliseOrderStatus(order.status) === 'returned'
          ? 'The parcel was returned to the seller.'
          : 'Delivery was attempted but failed.'}
      </div>
    );
  }

  const key = normaliseOrderStatus(order.status);
  const reachedIndex = DELIVERED_REACHED.has(key)
    ? 3
    : SHIPPED_REACHED.has(key)
      ? 2
      : PAID_REACHED.has(key)
        ? 1
        : 0;

  // Fallback timestamps — fixture truth: payment is captured at order
  // placement; shipped/delivered prefer the server stamps when present.
  const fallbackAt = (stepKey: StepKey): string | null => {
    switch (stepKey) {
      case 'ordered':
        return order.createdAt;
      case 'paid':
        return order.createdAt;
      case 'shipped':
        return order.shippedAt ?? order.createdAt;
      case 'delivered':
        return order.deliveredAt ?? order.createdAt;
    }
  };

  return (
    <ol className="flex flex-col">
      {STEPS.map((stepKey, i) => {
        const step = detail.timeline.find((s) => s.key === stepKey);
        const at = step?.at ?? (i <= reachedIndex ? fallbackAt(stepKey) : null);
        const done = i <= reachedIndex && at != null;
        const current = done && i === reachedIndex;
        const isLast = i === STEPS.length - 1;
        return (
          <li key={stepKey} className="flex gap-3">
            <div className="flex w-5 flex-col items-center">
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                  current
                    ? 'bg-success text-white'
                    : done
                      ? 'bg-success-subtle text-success-text'
                      : 'bg-surface-alt text-text-muted'
                }`}
              >
                {done ? <Icon name="check" size={12} /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
              </span>
              {!isLast ? (
                <span className={`w-px flex-1 ${i < reachedIndex ? 'bg-success' : 'bg-border'}`} aria-hidden />
              ) : null}
            </div>
            <div className={isLast ? '' : 'pb-6'}>
              <p
                className={`text-body ${
                  current
                    ? 'font-semibold text-text-primary'
                    : done
                      ? 'font-medium text-text-secondary'
                      : 'font-medium text-text-muted'
                }`}
              >
                {step?.label ?? FALLBACK_LABEL[stepKey]}
              </p>
              {at ? (
                <p className="text-caption text-text-secondary">{formatDate(at)}</p>
              ) : (
                <p className="text-caption text-text-muted">{PENDING_CAPTION[stepKey]}</p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
