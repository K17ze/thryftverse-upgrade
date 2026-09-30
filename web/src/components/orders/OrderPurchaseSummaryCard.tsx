'use client';

/**
 * OrderPurchaseSummaryCard — the eBay/Vinted-grade purchase/sale summary box:
 * item line with thumbnail and per-unit price, postage line with carrier,
 * itemized buyer protection fees, total, copyable order number,
 * payment method used, and delivery address (mobile-mode inline facts).
 */

import Link from 'next/link';
import type { CommerceOrder, Listing, Address, PaymentMethod } from '@/lib/contracts/domain';
import type { OrderDetailInfo, OrderEnrichment } from '@/lib/data/fixtures-commerce';
import { AppImage } from '@/components/ui/AppImage';
import { Icon } from '@/components/ui/Icon';
import { formatPrice } from '@/lib/utils/format';
import { getCategoryFocalPoint, getListingCoverUri } from '@/lib/utils/media';

interface OrderPurchaseSummaryCardProps {
  order: CommerceOrder;
  listing: Listing | null;
  detail: OrderDetailInfo;
  enrichment: OrderEnrichment;
  isBuyer: boolean;
  deliveryAddress?: Address | null;
  paidWith?: PaymentMethod | null;
  onCopyOrderNumber: () => void;
}

export function OrderPurchaseSummaryCard({
  order,
  listing,
  detail,
  enrichment,
  isBuyer,
  deliveryAddress,
  paidWith,
  onCopyOrderNumber,
}: OrderPurchaseSummaryCardProps) {
  return (
    <section className="mt-6 border-y border-border-subtle py-4" id="payment">
      <h2 className="mb-3 text-body-emphasis font-semibold text-text-primary">
        {isBuyer ? 'Purchase summary' : 'Sale summary'}
      </h2>
      <Link href={`/item/${order.listingId}`} className="pressable flex items-center gap-3">
        <span className="w-16 shrink-0 overflow-hidden rounded-md">
          <AppImage
            src={getListingCoverUri(listing?.images)}
            alt={listing?.title ?? 'Order item'}
            aspectRatio={0.8}
            focalPoint={getCategoryFocalPoint(listing?.category)}
            sizes="64px"
            className="w-full"
          />
        </span>
        <span className="min-w-0 flex-1">
          <span className="clamp-1 text-body font-medium text-text-primary">
            {listing?.title ?? 'Item'}
          </span>
          <span className="mt-0.5 block text-caption text-text-secondary">
            {[listing?.brand, listing?.size ? `Size ${listing.size}` : null]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </span>
        <span className="tnum shrink-0 text-body font-semibold text-text-primary">
          {formatPrice(detail.itemPrice)}
        </span>
        <Icon name="forward" size={16} className="shrink-0 text-text-muted" />
      </Link>
      <dl className="mt-3 flex flex-col gap-2">
        <div className="flex justify-between text-body text-text-secondary">
          <dt>
            Postage
            {detail.carrier
              ? ` · ${[detail.carrier, detail.service].filter(Boolean).join(' ')}`
              : ''}
          </dt>
          <dd className="tnum text-text-primary">
            {detail.shippingFee > 0 ? formatPrice(detail.shippingFee) : 'Included'}
          </dd>
        </div>
        <div className="flex justify-between text-body text-text-secondary">
          <dt>Buyer Protection</dt>
          <dd className="tnum text-text-primary">{formatPrice(detail.protectionFee)}</dd>
        </div>
        <div className="mt-1 flex justify-between border-t border-border-subtle pt-3">
          <dt className="text-body-emphasis font-semibold text-text-primary">
            {isBuyer ? 'Total paid' : 'You earned'}
          </dt>
          <dd className="tnum text-price-list font-bold text-text-primary">
            {formatPrice(isBuyer ? order.totalPrice : detail.itemPrice)}
          </dd>
        </div>
      </dl>

      {/* Receipt — the standalone printable/shareable document surface */}
      <div className="mt-3 border-t border-border-subtle pt-3">
        <Link
          href={`/orders/${order.id}/receipt`}
          className="pressable -my-1.5 flex min-h-11 items-center gap-2.5 text-body text-text-secondary hover:text-text-primary"
        >
          <Icon name="receipt" size={18} className="shrink-0" />
          <span className="flex-1 font-medium">Receipt — printable record</span>
          <Icon name="forward" size={16} className="text-text-muted" />
        </Link>
      </div>

      {/* Mobile inline facts (moved to right rail at lg) */}
      <div className="mt-3 flex items-center justify-between border-t border-border-subtle pt-3 lg:hidden">
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
        <div className="mt-2.5 flex items-center justify-between lg:hidden">
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
        <div className="mt-2.5 flex items-start justify-between gap-3 lg:hidden">
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
        <div className="mt-2.5 flex items-center justify-between lg:hidden">
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
