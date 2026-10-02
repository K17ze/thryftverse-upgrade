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
import { DATA_MODE } from '@/lib/api/client';
import { useListingIds, useSellerSummary } from '@/lib/hooks/listing-resolution';
import { listingById, userById } from '@/lib/data/fixtures';
import { orderEnrichmentFor } from '@/lib/data/fixtures-commerce';
import type { CommerceUserOrderApi } from '@/lib/api/mappers';
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

export function OrderStatusBadge({
  status,
  needsAttention = false,
}: {
  status: Order['status'] | string;
  /** One status grammar — the needs-action cue folds into the pill as a
   *  leading glyph (and an sr-only prefix) rather than floating beside it. */
  needsAttention?: boolean;
}) {
  return (
    <Badge variant={statusBadgeVariant(status)} icon={needsAttention ? 'alert' : undefined}>
      {needsAttention ? <span className="sr-only">Needs your action — </span> : null}
      {humaniseStatus(status)}
    </Badge>
  );
}

interface ShipBy {
  text: string;
  overdue: boolean;
  urgent: boolean;
}

/** Stable empty id list — keeps the live-resolution hooks disabled without
 *  a new array identity per render. */
const EMPTY_IDS: readonly string[] = [];

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
  meta,
}: {
  order: CommerceOrder;
  isBuyer: boolean;
  /** Canonical attention item when the row sits in the Needs-attention lane. */
  attention?: OrderAttention | null;
  /** Live wire row — the backend's own listingTitle/listingImageUrl and
   *  counterparty usernames. When present, fixture lookups never run. */
  meta?: CommerceUserOrderApi;
}) {
  const LIVE = DATA_MODE === 'live';
  // Live fallback — when the caller has no wire row, the listing and
  // counterparty resolve through the shared hooks (GET /listings/:id,
  // GET /sellers/:id) instead of the fixture catalogue. Unresolved ids
  // render the honest placeholder, never a catalogue ghost.
  const liveListing = useListingIds(LIVE && !meta ? [order.listingId] : EMPTY_IDS);
  const liveSeller = useSellerSummary(
    LIVE && !meta ? (isBuyer ? order.sellerId : order.buyerId) : null,
  );
  const listing = meta
    ? null
    : LIVE
      ? liveListing.byId.get(order.listingId) ?? null
      : listingById(order.listingId);
  const counterpartyName = meta
    ? (isBuyer ? meta.sellerUsername : meta.buyerUsername) ?? null
    : LIVE
      ? liveSeller.data?.username ?? null
      : (isBuyer
          ? (listing?.seller?.username ?? null)
          : (userById(order.buyerId)?.username ?? null));
  const title = meta?.listingTitle ?? listing?.title ?? 'Order item';
  const imageUri = meta?.listingImageUrl ?? getListingCoverUri(listing?.images);
  const category = meta ? undefined : listing?.category;
  const role: OrderRole = isBuyer ? 'buyer' : 'seller';
  const needsViewerAction = needsAction(order.status, role);

  const enrichment = meta || LIVE ? null : orderEnrichmentFor(order.id);
  const hasReview = meta?.hasReview ?? enrichment?.hasReview === true;
  const reviewIsAuto = enrichment?.reviewIsAuto === true;

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
      : enrichment?.reviewRating != null
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
        className="pressable flex items-center gap-3 py-[var(--density-row-py)] hover:bg-row-pressed sm:gap-4 lg:grid lg:grid-cols-[3.5rem_minmax(0,1fr)_11rem_8.5rem_auto_auto_1.25rem] lg:gap-x-5"
      >
        <span className="w-14 shrink-0 overflow-hidden rounded-md">
          <AppImage
            src={imageUri}
            alt={title}
            aspectRatio={0.8}
            focalPoint={getCategoryFocalPoint(category)}
            sizes="56px"
            className="w-full"
          />
        </span>
        <span className="min-w-0 flex-1">
          <span className="clamp-1 text-body font-medium text-text-primary">
            {title}
          </span>
          {/* Compact meta line — mobile only; at lg the same facts render
              as their own table cells so the row reads as columns. */}
          <span className="mt-0.5 flex items-center gap-2 text-caption text-text-secondary lg:hidden">
            <span>{formatDate(order.createdAt)}</span>
            {counterpartyName ? (
              <span className="clamp-1">
                · {isBuyer ? 'Sold by' : 'Bought by'} @{counterpartyName}
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
                      : 'text-text-secondary'
              }`}
            >
              {captionTone === 'muted' && hasReview && !reviewIsAuto ? (
                <Icon name="star" size={11} filled className="text-warning-text" />
              ) : null}
              {caption}
            </span>
          ) : null}
        </span>
        {/* Desktop cells — the eBay purchase-history column grammar:
            counterparty, order number + date, then status / total. */}
        <span className="hidden min-w-0 lg:block">
          {counterpartyName ? (
            <span className="clamp-1 block text-body text-text-secondary">
              {isBuyer ? 'Sold by' : 'Bought by'}{' '}
              <span className="font-medium text-text-primary">@{counterpartyName}</span>
            </span>
          ) : (
            <span className="text-body text-text-muted">—</span>
          )}
        </span>
        <span className="hidden min-w-0 lg:block">
          <span className="clamp-1 tnum block text-caption text-text-secondary">
            Order {order.id}
          </span>
          <span className="mt-0.5 block text-caption text-text-muted">
            {formatDate(order.createdAt)}
          </span>
        </span>
        {/* Status cell — one grammar: a single semantic pill per status,
            the needs-action cue folded inside it, never a second glyph
            floating beside the badge. */}
        <span className="flex shrink-0 items-center lg:justify-self-end">
          <OrderStatusBadge status={order.status} needsAttention={needsViewerAction} />
        </span>
        <span className="tnum shrink-0 text-body font-semibold text-text-primary lg:justify-self-end lg:text-right">
          {formatPrice(order.totalPrice)}
        </span>
        <Icon name="forward" size={16} className="shrink-0 text-text-muted lg:justify-self-end" />
      </Link>
    </li>
  );
}
