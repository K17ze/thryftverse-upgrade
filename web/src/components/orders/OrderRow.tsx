'use client';

/**
 * OrderRow — one order in the list: item thumb, title, counterparty,
 * status badge, total (tnum), date, chevron. The badge consumes the
 * canonical status vocabulary via orderCapabilities — same labels and
 * tones as mobile. StatusBadge is exported for the detail surface too.
 *
 * One caption line under the meta row, priority-resolved:
 *   1. attention — the capability-resolved task ('Complete payment',
 *      'Leave a review', 'Post by Friday' for dispatch rows…)
 *   2. ship-by — seller-side to-post deadline, straight from shipByDate
 *   3. review — the submitted rating once a review exists
 * A leave-review attention row links straight to /review/[orderId].
 */

import Link from 'next/link';
import type { CommerceOrder, Order } from '@/lib/contracts/domain';
import { AppImage } from '@/components/ui/AppImage';
import { Badge } from '@/components/ui/Badge';
import { Icon } from '@/components/ui/Icon';
import { listingById, userById } from '@/lib/data/fixtures';
import { orderEnrichmentFor } from '@/lib/data/fixtures-commerce';
import { formatDate, formatPrice } from '@/lib/utils/format';
import { getCategoryFocalPoint, getListingCoverUri } from '@/lib/utils/media';
import {
  humaniseStatus,
  needsAction,
  normaliseOrderStatus,
  statusBadgeVariant,
  type OrderAttention,
  type OrderRole,
} from './orderCapabilities';

export function OrderStatusBadge({ status }: { status: Order['status'] | string }) {
  return <Badge variant={statusBadgeVariant(status)}>{humaniseStatus(status)}</Badge>;
}

interface ShipBy {
  text: string;
  overdue: boolean;
  urgent: boolean;
}

/** "Post by Friday" grammar — the real shipByDate, urgency-toned. */
function shipByText(iso: string): ShipBy | null {
  const deadline = new Date(iso);
  const ms = deadline.getTime() - Date.now();
  if (!Number.isFinite(deadline.getTime())) return null;
  if (ms <= 0) return { text: 'Dispatch overdue — post now', overdue: true, urgent: true };
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  if (deadline.toDateString() === now.toDateString()) {
    return { text: 'Post today', overdue: false, urgent: true };
  }
  if (deadline.toDateString() === tomorrow.toDateString()) {
    return { text: 'Post tomorrow', overdue: false, urgent: true };
  }
  if (ms <= 6 * 24 * 3_600_000) {
    return {
      text: `Post by ${deadline.toLocaleDateString('en-GB', { weekday: 'long' })}`,
      overdue: false,
      urgent: false,
    };
  }
  return {
    text: `Post by ${deadline.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`,
    overdue: false,
    urgent: false,
  };
}

export function OrderRow({
  order,
  isBuyer,
  attention,
}: {
  order: CommerceOrder;
  isBuyer: boolean;
  /** Canonical attention item when the row sits in the Needs-attention lane. */
  attention?: OrderAttention | null;
}) {
  const listing = listingById(order.listingId);
  const counterparty = isBuyer
    ? (listing?.seller ?? null)
    : (userById(order.buyerId) ?? null);
  const role: OrderRole = isBuyer ? 'buyer' : 'seller';
  const attentionIcon = needsAction(order.status, role);

  const enrichment = orderEnrichmentFor(order.id);
  const hasReview = enrichment.hasReview === true;
  const reviewIsAuto = enrichment.reviewIsAuto === true;

  const statusKey = normaliseOrderStatus(order.status);
  // Seller-side to-post deadline — shown wherever the row renders, lane or
  // classification tab, so the commitment never depends on the surface.
  const shipBy =
    role === 'seller' && statusKey === 'paid' && order.shipByDate
      ? shipByText(order.shipByDate)
      : null;

  // Caption resolution — attention wins (dispatch captions speak the
  // deadline itself), then the bare ship-by line, then the review verdict.
  let caption: string | null = null;
  let captionTone: 'action' | 'warning' | 'danger' | 'muted' = 'action';
  if (attention) {
    caption = attention.action === 'dispatch' && shipBy ? shipBy.text : attention.label;
    captionTone = shipBy?.overdue ? 'danger' : shipBy?.urgent ? 'warning' : 'action';
  } else if (shipBy) {
    caption = shipBy.text;
    captionTone = shipBy.overdue ? 'danger' : shipBy.urgent ? 'warning' : 'action';
  } else if (hasReview) {
    caption = reviewIsAuto
      ? 'Automatic feedback'
      : enrichment.reviewRating != null
        ? `${isBuyer ? 'You rated' : 'Buyer rated'} ${enrichment.reviewRating}`
        : 'Reviewed';
    captionTone = 'muted';
  }

  // Post-review rows jump straight to the composer; everything else opens
  // the order detail (whose primary action reaches the same place).
  const href =
    attention?.action === 'leave_review' ? `/review/${order.id}` : `/orders/${order.id}`;

  return (
    <li>
      <Link
        href={href}
        className="pressable flex items-center gap-3 py-3 hover:bg-row-pressed sm:gap-4"
      >
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
          <span className="clamp-1 text-body font-medium text-text-primary">
            {listing?.title ?? 'Order item'}
          </span>
          <span className="mt-0.5 flex items-center gap-2 text-caption text-text-secondary">
            <span>{formatDate(order.createdAt)}</span>
            {counterparty?.username ? (
              <span className="clamp-1">
                · {isBuyer ? 'Sold by' : 'Bought by'} @{counterparty.username}
              </span>
            ) : null}
          </span>
          {caption ? (
            <span
              className={`mt-1 flex items-center gap-1.5 text-caption font-medium ${
                captionTone === 'danger'
                  ? 'text-danger-text'
                  : captionTone === 'warning'
                    ? 'text-warning-text'
                    : captionTone === 'muted'
                      ? 'text-text-muted'
                      : 'text-commerce-trust'
              }`}
            >
              {captionTone === 'muted' && hasReview && !reviewIsAuto ? (
                <Icon name="star" size={11} filled className="text-warning-text" />
              ) : null}
              {caption}
            </span>
          ) : null}
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          {attentionIcon ? (
            <Icon name="alert" size={14} className="text-warning-text" aria-label="Needs your action" />
          ) : null}
          <OrderStatusBadge status={order.status} />
        </span>
        <span className="tnum shrink-0 text-body font-semibold text-text-primary">
          {formatPrice(order.totalPrice)}
        </span>
        <Icon name="forward" size={16} className="shrink-0 text-text-muted" />
      </Link>
    </li>
  );
}
