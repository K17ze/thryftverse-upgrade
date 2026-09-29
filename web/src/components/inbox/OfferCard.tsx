'use client';

/**
 * OfferCard — port of the mobile MarketplaceChatCard offer variant.
 * Commerce offer inside the thread: optional item anchor, "Offer £X on £Y"
 * hero, status chip, and the resolved role/state action set — Accept /
 * Counter / Decline when the standing offer is theirs to answer, the
 * "sent · waiting" row with its Withdraw/Cancel exit when it's the
 * viewer's own move. Actions come from the canonical
 * resolveOfferActions matrix (the /offers role grammar), labels from
 * OFFER_STATUS_LABEL so 'cancelled' reads "Withdrawn" on both surfaces.
 */

import Link from 'next/link';
import type { Message } from '@/lib/contracts/domain';
import type { OfferStatus } from '@/lib/data/fixtures-commerce';
import type { OfferWithOrder } from '@/lib/commerce/offerAcceptance';
import { OFFER_STATUS_LABEL } from '@/lib/commerce/offerLabels';
import type { OfferRowAction } from '@/components/orders/OfferRow';
import { AppImage } from '@/components/ui/AppImage';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ClientTime } from '@/components/ui/ClientTime';
import { Icon } from '@/components/ui/Icon';
import { formatPrice } from '@/lib/utils/format';
import { MessageActions, MessageReceipt, formatMessageTime, Highlight } from './MessageBubble';

const STATUS_VARIANT: Record<
  OfferStatus,
  'warning' | 'success' | 'danger' | 'neutral' | 'brand'
> = {
  pending: 'warning',
  accepted: 'success',
  declined: 'danger',
  countered: 'brand',
  expired: 'neutral',
  cancelled: 'neutral',
};

/** The single exit verb per role — decline for sellers, cancel for buyers;
 *  retracting your own standing move is labelled as the withdrawal it is. */
function exitLabel(action: OfferRowAction, ownMove: boolean): string {
  if (action === 'decline') return ownMove ? 'Withdraw' : 'Decline';
  return ownMove ? 'Withdraw offer' : 'Cancel';
}

interface OfferCardProps {
  message: Message;
  mine: boolean;
  /** The resolved standing offer behind this message — drives the
   *  displayed amount and the action matrix. Absent on unresolvable
   *  legacy messages, which render status only. */
  offer?: OfferWithOrder;
  /** Effective display status — the record's lazy-expired status when a
   *  record resolved, else the message snapshot. */
  status: OfferStatus;
  /** Canonical role/state actions (resolveOfferActions) — empty when the
   *  viewer has no legal move. */
  actions: OfferRowAction[];
  /** The standing offer on the table is the viewer's own move. */
  ownMove: boolean;
  /** True when `offer` was resolved by listing fallback rather than the
   *  message's own offerId — the card shows the thread's current standing
   *  offer, which may be a different move than this message represented;
   *  the card labels it so. */
  standing?: boolean;
  /** True for the final outgoing message once it's read — shows "Seen". */
  showSeen?: boolean;
  /** In-thread search query — matching offer prose is marked. */
  highlight?: string;
  /** Reply affordance — same quiet gutter as the bubbles. */
  onReply?: () => void;
  /** Opens the actions menu (quick-react row) anchored at the gutter. */
  onReact?: (anchor: { x: number; y: number }) => void;
  /** Clustered run member — 2px gap instead of the section gap. */
  tight?: boolean;
  onAction: (action: OfferRowAction) => void;
}

export function OfferCard({
  message: m,
  mine,
  offer,
  status,
  actions,
  ownMove,
  standing,
  showSeen,
  highlight,
  onReply,
  onReact,
  tight,
  onAction,
}: OfferCardProps) {
  const variant = STATUS_VARIANT[status] ?? STATUS_VARIANT.pending;
  const label = OFFER_STATUS_LABEL[status] ?? OFFER_STATUS_LABEL.pending;
  const itemImage = m.itemImage ?? m.listing?.image ?? m.listing?.images?.[0];
  const itemTitle = m.listing?.title;
  const itemHref = m.listing?.id ? `/item/${m.listing.id}` : null;
  // The standing record's amount is the truth once resolved — a countered
  // card shows what's actually on the table, not the stale first bid.
  const amount = offer?.amount ?? m.offerPrice;
  const originalPrice = offer?.originalPrice ?? m.originalPrice;
  const live = status === 'pending' || status === 'countered';
  const exit = actions.find((a) => a === 'decline' || a === 'cancel');
  const canRespond = actions.includes('accept') || actions.includes('counter');

  return (
    <div
      className={`group/msg relative ${tight ? 'mt-0.5' : 'mt-1.5'} flex ${
        mine ? 'justify-end' : 'justify-start'
      }`}
    >
      <div className="relative w-full max-w-[300px]">
        <div className="overflow-hidden rounded-xl border border-border-subtle bg-surface">
          {itemImage || itemTitle ? (
            <div className="flex items-center gap-2.5 border-b border-border-subtle p-3">
              {itemImage ? (
                <AppImage
                  src={itemImage}
                  alt={itemTitle ?? 'Listing'}
                  sizes="40px"
                  className="h-10 w-10 shrink-0 rounded-md"
                  fallbackIcon="bag"
                />
              ) : null}
              <p className="clamp-1 min-w-0 flex-1 text-caption font-medium text-text-secondary">
                {itemTitle ?? 'Listing'}
              </p>
              {itemHref ? (
                <Link
                  href={itemHref}
                  aria-label={`View ${itemTitle ?? 'listing'}`}
                  className="pressable shrink-0 text-text-muted hover:text-text-primary"
                >
                  <Icon name="forward" size={14} />
                </Link>
              ) : null}
            </div>
          ) : null}

          <div className="p-3">
            <div className="flex items-start justify-between gap-2">
              <p className="text-body-emphasis font-semibold text-text-primary">
                Offer <span className="tnum">{formatPrice(amount)}</span>
                {originalPrice != null ? (
                  <>
                    {' '}
                    <span className="font-normal text-text-secondary">on</span>{' '}
                    <span className="tnum font-normal text-text-muted line-through">
                      {formatPrice(originalPrice)}
                    </span>
                  </>
                ) : null}
              </p>
              <Badge variant={variant} className="shrink-0">
                {label}
              </Badge>
            </div>

            {/* Standing-offer provenance — the message predates offerId
                threading, so the card reflects the listing's current
                standing offer, not necessarily the move this message
                described. */}
            {standing && offer ? (
              <p className="mt-1 text-meta text-text-muted">
                Current standing offer on this item
              </p>
            ) : null}

            {m.text && m.text !== `Offer ${formatPrice(m.offerPrice)}` ? (
              <p className="mt-1 text-body text-text-secondary">
                <Highlight text={m.text} query={highlight ?? ''} />
              </p>
            ) : null}

            {/* Incoming standing offer — the full response grammar the
                role matrix allows (seller declines, buyer cancels). */}
            {live && !ownMove && (canRespond || exit) ? (
              <div className="mt-3 flex gap-2">
                {exit ? (
                  <Button variant="outline" size="sm" fullWidth onClick={() => onAction(exit)}>
                    {exitLabel(exit, false)}
                  </Button>
                ) : null}
                {actions.includes('counter') ? (
                  <Button variant="secondary" size="sm" fullWidth onClick={() => onAction('counter')}>
                    Counter
                  </Button>
                ) : null}
                {actions.includes('accept') ? (
                  <Button variant="primary" size="sm" fullWidth onClick={() => onAction('accept')}>
                    Accept
                  </Button>
                ) : null}
              </div>
            ) : null}

            {/* Own standing move — the waiting caption plus its legal exit
                (mobile's "Offer sent · Waiting" row with withdraw). */}
            {live && ownMove ? (
              <p className="mt-2 flex items-center gap-1.5 text-meta text-text-muted">
                <Icon name="send" size={11} />
                <span className="min-w-0 flex-1">
                  {status === 'countered'
                    ? 'Counter sent · waiting for a response'
                    : 'Offer sent · waiting for a response'}
                </span>
                {exit ? (
                  <button
                    type="button"
                    onClick={() => onAction(exit)}
                    className="pressable -mx-2 -my-2 shrink-0 px-2 py-2.5 font-semibold text-danger-text"
                  >
                    {exitLabel(exit, true)}
                  </button>
                ) : null}
              </p>
            ) : null}

            {/* Same meta grammar as the bubbles — time always, receipt on own
                offers only (fixture readStatus, never assumed). */}
            {mine ? (
              <div className="mt-2 flex items-center justify-end gap-1 text-text-muted">
                <ClientTime
                  iso={m.timestamp}
                  format={formatMessageTime}
                  className="text-micro tnum"
                />
                <MessageReceipt status={m.readStatus} readClassName="text-brand" />
              </div>
            ) : null}
          </div>
        </div>
        {mine && showSeen ? (
          <p className="mt-0.5 text-right text-meta text-text-muted">Seen</p>
        ) : null}
        <MessageActions mine={mine} onReply={onReply} onReact={onReact} />
      </div>
    </div>
  );
}
