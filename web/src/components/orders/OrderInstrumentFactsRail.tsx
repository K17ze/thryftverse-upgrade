'use client';

/**
 * OrderInstrumentFactsRail — the desktop sticky right-rail facts panel:
 * order number copy button, tender method used, and delivery address.
 */

import type { CommerceOrder, Address, PaymentMethod } from '@/lib/contracts/domain';
import type { OrderEnrichment } from '@/lib/data/fixtures-commerce';
import { Icon } from '@/components/ui/Icon';

interface OrderInstrumentFactsRailProps {
  order: CommerceOrder;
  isBuyer: boolean;
  paidWith?: PaymentMethod | null;
  deliveryAddress?: Address | null;
  enrichment: OrderEnrichment;
  onCopyOrderNumber: () => void;
}

export function OrderInstrumentFactsRail({
  order,
  isBuyer,
  paidWith,
  deliveryAddress,
  enrichment,
  onCopyOrderNumber,
}: OrderInstrumentFactsRailProps) {
  return (
    <section
      aria-label="Delivery and payment"
      className="hidden lg:order-2 lg:mt-5 lg:block lg:border-y lg:border-border-subtle lg:py-4"
    >
      <h2 className="mb-3 text-body-emphasis font-semibold text-text-primary">
        Delivery &amp; payment
      </h2>
      <div className="flex items-center justify-between">
        <span className="text-caption text-text-muted">Order number</span>
        <button
          type="button"
          onClick={onCopyOrderNumber}
          aria-label={`Copy order number ${order.id}`}
          className="pressable -my-2 flex items-center gap-1.5 rounded-sm py-2 text-caption text-text-secondary hover:text-text-primary"
        >
          <span className="tnum">{order.id}</span>
          <Icon name="document" size={14} />
        </button>
      </div>

      {isBuyer && paidWith ? (
        <div className="mt-2.5 flex items-center justify-between">
          <span className="text-caption text-text-muted">Paid with</span>
          <span className="flex items-center gap-1.5 text-caption text-text-secondary">
            <Icon name={paidWith.type === 'card' ? 'card' : 'wallet'} size={14} />
            {paidWith.type === 'bank_account'
              ? (paidWith.bankName ?? 'Bank account')
              : `${
                  paidWith.brand
                    ? paidWith.brand[0].toUpperCase() + paidWith.brand.slice(1)
                    : 'Card'
                } •••• ${paidWith.last4}`}
          </span>
        </div>
      ) : null}

      {isBuyer && deliveryAddress ? (
        <div className="mt-2.5 flex items-start justify-between gap-3">
          <span className="shrink-0 text-caption text-text-muted">Delivery address</span>
          <span className="text-right text-caption text-text-secondary">
            <span className="block font-medium text-text-primary">{deliveryAddress.name}</span>
            <span className="block">{deliveryAddress.street}</span>
            <span className="block">
              {deliveryAddress.city} {deliveryAddress.postcode}
            </span>
          </span>
        </div>
      ) : null}

      {!isBuyer &&
      (order.fulfilmentSnapshot?.destinationSummary ??
        enrichment.fulfilmentSnapshot?.destinationSummary) ? (
        <div className="mt-2.5 flex items-center justify-between">
          <span className="text-caption text-text-muted">Deliver to</span>
          <span className="text-caption text-text-secondary">
            {order.fulfilmentSnapshot?.destinationSummary ??
              enrichment.fulfilmentSnapshot?.destinationSummary}
          </span>
        </div>
      ) : null}
    </section>
  );
}
