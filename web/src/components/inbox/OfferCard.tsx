'use client';

/**
 * OfferCard — port of the mobile MarketplaceChatCard offer variant.
 * Commerce offer inside the thread: optional item anchor, "Offer £X on £Y"
 * hero, status chip, and Accept / Decline / Counter actions for pending
 * offers addressed to the viewer.
 */

import Link from 'next/link';
import type { Message } from '@/lib/contracts/domain';
import { AppImage } from '@/components/ui/AppImage';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { formatPrice } from '@/lib/utils/format';
import { MessageReceipt, formatMessageTime, Highlight } from './MessageBubble';

type OfferStatus = NonNullable<Message['offerStatus']>;

const STATUS_META: Record<OfferStatus, { label: string; variant: 'warning' | 'success' | 'danger' | 'neutral' | 'brand' }> = {
  pending: { label: 'Pending', variant: 'warning' },
  accepted: { label: 'Accepted', variant: 'success' },
  declined: { label: 'Declined', variant: 'danger' },
  countered: { label: 'Countered', variant: 'brand' },
  expired: { label: 'Expired', variant: 'neutral' },
  cancelled: { label: 'Cancelled', variant: 'neutral' },
};

interface OfferCardProps {
  message: Message;
  mine: boolean;
  /** Locally-resolved status (accept/decline mutate against fixtures). */
  status: OfferStatus;
  /** True for the final outgoing message once it's read — shows "Seen". */
  showSeen?: boolean;
  /** In-thread search query — matching offer prose is marked. */
  highlight?: string;
  onAccept: () => void;
  onDecline: () => void;
  onCounter: () => void;
}

export function OfferCard({ message: m, mine, status, showSeen, highlight, onAccept, onDecline, onCounter }: OfferCardProps) {
  const meta = STATUS_META[status] ?? STATUS_META.pending;
  const itemImage = m.itemImage ?? m.listing?.image ?? m.listing?.images?.[0];
  const itemTitle = m.listing?.title;
  const itemHref = m.listing?.id ? `/item/${m.listing.id}` : null;
  const time = formatMessageTime(m.timestamp);

  return (
    <div className={`mt-1.5 flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div className="w-full max-w-[300px]">
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
                Offer <span className="tnum">{formatPrice(m.offerPrice)}</span>
                {m.originalPrice != null ? (
                  <>
                    {' '}
                    <span className="font-normal text-text-secondary">on</span>{' '}
                    <span className="tnum font-normal text-text-muted line-through">
                      {formatPrice(m.originalPrice)}
                    </span>
                  </>
                ) : null}
              </p>
              <Badge variant={meta.variant} className="shrink-0">
                {meta.label}
              </Badge>
            </div>

            {m.text && m.text !== `Offer ${formatPrice(m.offerPrice)}` ? (
              <p className="mt-1 text-body text-text-secondary">
                <Highlight text={m.text} query={highlight ?? ''} />
              </p>
            ) : null}

            {status === 'pending' && !mine ? (
              <div className="mt-3 flex gap-2">
                <Button variant="outline" size="sm" fullWidth onClick={onDecline}>
                  Decline
                </Button>
                <Button variant="secondary" size="sm" fullWidth onClick={onCounter}>
                  Counter
                </Button>
                <Button variant="primary" size="sm" fullWidth onClick={onAccept}>
                  Accept
                </Button>
              </div>
            ) : null}

            {status === 'pending' && mine ? (
              <p className="mt-2 flex items-center gap-1.5 text-meta text-text-muted">
                <Icon name="send" size={11} />
                Offer sent · waiting for a response
              </p>
            ) : null}

            {/* Same meta grammar as the bubbles — time always, receipt on own
                offers only (fixture readStatus, never assumed). */}
            {time || mine ? (
              <div className="mt-2 flex items-center justify-end gap-1 text-text-muted">
                {time ? <span className="text-micro tnum">{time}</span> : null}
                {mine ? (
                  <MessageReceipt status={m.readStatus} readClassName="text-brand" />
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
        {mine && showSeen ? (
          <p className="mt-0.5 text-right text-meta text-text-muted">Seen</p>
        ) : null}
      </div>
    </div>
  );
}
