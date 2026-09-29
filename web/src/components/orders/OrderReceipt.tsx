'use client';

/**
 * OrderReceipt — the standalone printable/shareable order record, ported
 * from the mobile OrderReceiptScreen. One contained document panel (the
 * only panel this surface is allowed): identifier + status stamp, date /
 * paid / counterparty facts, the itemised item row, the full ledger
 * (item, buyer protection, postage, total — VAT lines only render when
 * the contract carries tax fields, which it currently doesn't, so nothing
 * is invented), delivery facts where they exist, the immutable-record
 * notice and an honest "still in progress" line for non-terminal orders.
 *
 * Print: a scoped @media print sheet flattens the document to ink-on-
 * paper and hides the global chrome plus every interactive control.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AppImage } from '@/components/ui/AppImage';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { OrderStatusBadge } from '@/components/orders/OrderRow';
import {
  humaniseStatus,
  isTerminalStatus,
  normaliseOrderStatus,
} from '@/components/orders/orderCapabilities';
import { useToast } from '@/components/ui/Toast';
import type {
  Address,
  CommerceOrder,
  FulfilmentSnapshot,
  Listing,
  User,
} from '@/lib/contracts/domain';
import type { OrderDetailInfo } from '@/lib/data/fixtures-commerce';
import { formatDate, formatPrice } from '@/lib/utils/format';
import { getCategoryFocalPoint, getListingCoverUri } from '@/lib/utils/media';

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <dt className="shrink-0 text-body text-text-secondary">{label}</dt>
      <dd className="clamp-2 tnum text-right text-body text-text-primary">{value}</dd>
    </div>
  );
}

const Divider = () => <hr className="my-4 border-border-subtle" aria-hidden />;

export function OrderReceipt({
  order,
  detail,
  listing,
  counterparty,
  isBuyer,
  fulfilment,
  deliveryAddress,
}: {
  order: CommerceOrder;
  detail: OrderDetailInfo;
  listing: Listing | null;
  counterparty: User | null;
  isBuyer: boolean;
  /** order.fulfilmentSnapshot ?? enrichment.fulfilmentSnapshot — the page
   *  merges the two sources, same as the order detail surface. */
  fulfilment: FulfilmentSnapshot | null;
  /** The buyer's session delivery address — shown when the fulfilment
   *  snapshot carries no destination summary (same rule as the order page). */
  deliveryAddress?: Address | null;
}) {
  const router = useRouter();
  const { show } = useToast();

  const normalised = normaliseOrderStatus(order.status);
  const statusLabel = humaniseStatus(order.status);
  const isFinal = isTerminalStatus(normalised);
  const isSuccess = isFinal && normalised !== 'cancelled' && normalised !== 'refunded';

  const paidAt = detail.timeline.find((s) => s.key === 'paid' && s.at)?.at ?? null;
  const etaLabel =
    fulfilment?.etaMinDays != null && fulfilment?.etaMaxDays != null
      ? fulfilment.etaMinDays === fulfilment.etaMaxDays
        ? `${fulfilment.etaMinDays} day${fulfilment.etaMinDays === 1 ? '' : 's'}`
        : `${fulfilment.etaMinDays}–${fulfilment.etaMaxDays} days`
      : null;
  const destination =
    fulfilment?.destinationSummary ??
    (isBuyer && deliveryAddress
      ? `${deliveryAddress.name}, ${deliveryAddress.street}, ${deliveryAddress.city} ${deliveryAddress.postcode}`
      : null);
  const serviceName = fulfilment?.serviceName ?? detail.service;
  const carrierName = detail.carrier;
  const hasDeliveryFacts = Boolean(
    order.trackingNumber ||
      destination ||
      serviceName ||
      carrierName ||
      order.shipByDate ||
      order.shippedAt ||
      order.deliveredAt,
  );

  const copyOrderId = async () => {
    try {
      await navigator.clipboard.writeText(order.id);
      show('Order number copied', 'success');
    } catch {
      show(order.id, 'info');
    }
  };

  const shareReceipt = async () => {
    const text = `ThryftVerse order ${order.id}\n${statusLabel} · ${formatDate(order.createdAt)}\nTotal: ${formatPrice(order.totalPrice)}`;
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: `Receipt ${order.id}`, text, url });
      } else {
        await navigator.clipboard.writeText(`${text}\n${url}`);
        show('Receipt copied — paste it anywhere.', 'success');
      }
    } catch (error) {
      // User cancelled the share sheet — not an error worth toasting.
      if (error instanceof DOMException && error.name === 'AbortError') return;
      show('Could not share the receipt — try again.', 'error');
    }
  };

  return (
    <div className="mx-auto w-full max-w-[640px] px-4 pb-16 pt-8 sm:px-6 lg:max-w-[1100px]">
      {/* Scoped print sheet — hides global chrome and flattens the
          document to ink-on-paper (same grammar as the shipping label). */}
      <style>{`
        @media print {
          header, footer, nav { display: none !important; }
          body { background: #fff !important; }
          [data-print-receipt] { border-color: #999 !important; }
          [data-print-receipt] * {
            color: #111 !important;
            border-color: #ccc !important;
            background: transparent !important;
          }
        }
      `}</style>

      {/* Chrome — screen-only. */}
      <div className="flex items-center justify-between gap-3 print:hidden">
        <IconButton
          name="back"
          aria-label={`Back to order ${order.id}`}
          onClick={() => router.push(`/orders/${order.id}`)}
          className="-ml-2"
        />
        <p className="text-caption text-text-muted">Receipt</p>
        <div className="flex items-center gap-1">
          <IconButton
            name="share"
            aria-label="Share receipt"
            onClick={() => void shareReceipt()}
          />
          <IconButton
            name="receipt"
            aria-label="Print receipt"
            onClick={() => window.print()}
          />
        </div>
      </div>

      {/* Two-pane at lg — the document reads down the left column while
          the screen-only actions sit in a right-hand rail (invoice grammar:
          paper on the canvas, operations beside it). Mobile stacks the
          rail under the document — identical order to the single column. */}
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_280px] lg:gap-x-10">
        <div className="min-w-0">
      {isSuccess ? (
        <div className="mt-6 text-center print:hidden lg:text-left">
          <p className="text-section-title font-semibold text-text-primary">
            {isBuyer ? 'Order complete' : 'Payment received'}
          </p>
          <p className="mt-1 text-caption text-text-muted">Receipt · {order.id}</p>
        </div>
      ) : null}

      {/* The document — one contained panel, hairline-bordered. */}
      <article
        data-print-receipt
        aria-label={`Receipt for order ${order.id}`}
        className="mt-6 rounded-lg border border-border bg-surface p-5 sm:p-6"
      >
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={copyOrderId}
            aria-label={`Copy order number ${order.id}`}
            className="pressable -my-1 flex items-center gap-1.5 py-1 text-left print:hidden"
          >
            <span className="tnum text-body-emphasis font-semibold text-text-primary">
              {order.id}
            </span>
            <Icon name="document" size={14} className="text-text-muted" />
          </button>
          <span className="tnum hidden text-body-emphasis font-semibold text-text-primary print:inline">
            {order.id}
          </span>
          <OrderStatusBadge status={order.status} />
        </div>

        <dl className="mt-4">
          <Row label="Date" value={formatDate(order.createdAt)} />
          {paidAt ? <Row label="Paid" value={formatDate(paidAt)} /> : null}
          <Row
            label={isBuyer ? 'Seller' : 'Buyer'}
            value={counterparty ? `@${counterparty.username}` : '—'}
          />
          {!isBuyer && order.estimatedReleaseAt ? (
            <Row label="Funds" value={`Estimated ${formatDate(order.estimatedReleaseAt)}`} />
          ) : null}
          {order.inspectionDeadlineAt ? (
            <Row label="Inspection ends" value={formatDate(order.inspectionDeadlineAt)} />
          ) : null}
        </dl>

        <Divider />

        {/* Itemised item — thumbnail + title + paid price. */}
        <p className="text-label text-text-muted">Item</p>
        <div className="mt-2 flex items-center gap-3">
          <span className="w-14 shrink-0 overflow-hidden rounded-md">
            <AppImage
              src={getListingCoverUri(listing?.images)}
              alt={listing?.title ?? 'Order item'}
              aspectRatio={0.8}
              focalPoint={getCategoryFocalPoint(listing?.category)}
              sizes="56px"
              className="w-full"
            />
          </span>
          <span className="min-w-0 flex-1">
            <span className="clamp-2 block text-body font-medium text-text-primary">
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
        </div>

        <Divider />

        {/* Full ledger — item, protection fee, postage, total. The order
            contract carries no tax/VAT fields, so no tax rows render —
            nothing invented. */}
        <p className="text-label text-text-muted">
          Order breakdown
        </p>
        <dl className="mt-1">
          <Row label="Item" value={formatPrice(detail.itemPrice)} />
          {detail.protectionFee > 0 ? (
            <Row label="Buyer protection" value={formatPrice(detail.protectionFee)} />
          ) : null}
          <Row
            label={`Postage${
              carrierName ? ` · ${[carrierName, serviceName].filter(Boolean).join(' ')}` : ''
            }`}
            value={detail.shippingFee > 0 ? formatPrice(detail.shippingFee) : 'Included'}
          />
          <div className="mt-1 flex items-baseline justify-between gap-4 border-t border-border-subtle pt-3">
            <dt className="text-body-emphasis font-semibold text-text-primary">Total</dt>
            <dd className="tnum text-price-list font-bold text-text-primary">
              {formatPrice(order.totalPrice)}
            </dd>
          </div>
        </dl>

        {hasDeliveryFacts ? (
          <>
            <Divider />
            <p className="text-label text-text-muted">
              Delivery
            </p>
            <dl className="mt-1">
              {destination ? <Row label="Deliver to" value={destination} /> : null}
              {serviceName ? <Row label="Service" value={serviceName} /> : null}
              {carrierName ? <Row label="Carrier" value={carrierName} /> : null}
              {etaLabel ? <Row label="ETA" value={etaLabel} /> : null}
              {!isFinal && order.shipByDate && !order.shippedAt ? (
                <Row label="Ship by" value={formatDate(order.shipByDate)} />
              ) : null}
              {order.trackingNumber ? (
                <Row label="Tracking" value={order.trackingNumber} />
              ) : null}
              {order.shippedAt ? <Row label="Shipped" value={formatDate(order.shippedAt)} /> : null}
              {order.deliveredAt ? (
                <Row label="Delivered" value={formatDate(order.deliveredAt)} />
              ) : null}
            </dl>
          </>
        ) : null}

        <Divider />

        <p className="flex items-start gap-1.5 text-caption text-text-muted">
          <Icon name="lock" size={13} className="mt-0.5 shrink-0" />
          This receipt is an immutable record of the order.
        </p>
        {!isFinal ? (
          <p className="mt-1.5 flex items-start gap-1.5 text-caption text-text-muted">
            <Icon name="clock" size={13} className="mt-0.5 shrink-0" />
            This order is still in progress — the receipt updates as it advances.
          </p>
        ) : null}
      </article>
        </div>

      {/* Screen-only actions — centred under the document on mobile,
          a hairline rail beside it at lg. */}
      <aside className="lg:sticky lg:top-20 lg:self-start print:hidden">
      <div className="mt-6 flex flex-col items-center gap-1 lg:mt-0 lg:items-stretch lg:gap-0 lg:divide-y lg:divide-border-subtle lg:border-y lg:border-border-subtle">
        <Link
          href={`/orders/${order.id}`}
          className="pressable flex min-h-11 items-center gap-1 text-body-emphasis font-semibold text-text-primary lg:justify-between"
        >
          View order details
          <Icon name="forward" size={16} />
        </Link>
        <button
          type="button"
          onClick={() => void shareReceipt()}
          className="pressable flex min-h-11 items-center gap-1.5 text-body text-text-secondary hover:text-text-primary lg:justify-between"
        >
          Share receipt
          <Icon name="share" size={16} className="lg:order-2" />
        </button>
      </div>
      </aside>
      </div>
    </div>
  );
}
