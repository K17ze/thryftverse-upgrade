'use client';

/**
 * ListingShareCard — a listing shared into the thread, rendered as a real
 * product tile (image, title, brand·size meta, tabular price, sold state)
 * that deep-links to /item/[id]. Mirrors the mobile listing-share card:
 * the whole tile is the link; the meta row (time + receipt on own shares)
 * sits under the card in the same grammar as the bubbles.
 */

import Link from 'next/link';
import type { Message } from '@/lib/contracts/domain';
import { AppImage } from '@/components/ui/AppImage';
import { Badge } from '@/components/ui/Badge';
import { Icon } from '@/components/ui/Icon';
import { formatPrice } from '@/lib/utils/format';
import { MessageActions, MessageReceipt, formatMessageTime } from './MessageBubble';

interface ListingShareCardProps {
  message: Message;
  mine: boolean;
  /** True for the final outgoing message once it's read — shows "Seen". */
  showSeen?: boolean;
  /** Group threads: sender name shown above cluster-first incoming cards. */
  senderLabel?: string;
  /** Reply affordance — same quiet gutter as the bubbles. */
  onReply?: () => void;
  /** Opens the actions menu (quick-react row) anchored at the gutter. */
  onReact?: (anchor: { x: number; y: number }) => void;
  /** Clustered run member — 2px gap instead of the section gap. */
  tight?: boolean;
}

export function ListingShareCard({ message: m, mine, showSeen, senderLabel, onReply, onReact, tight }: ListingShareCardProps) {
  const listing = m.listing;
  const image = listing?.image ?? listing?.images?.[0] ?? m.itemImage;
  const time = formatMessageTime(m.timestamp);
  const href = listing?.id ? `/item/${listing.id}` : null;

  const tile = (
    <div className="flex items-center gap-3 rounded-xl border border-border-subtle bg-surface p-3">
      {image ? (
        <AppImage
          src={image}
          alt={listing?.title ?? 'Shared listing'}
          sizes="64px"
          className="h-16 w-16 shrink-0 rounded-md"
          fallbackIcon="bag"
        />
      ) : (
        <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md bg-surface-alt text-text-muted">
          <Icon name="bag" size={20} />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="clamp-1 text-body font-semibold text-text-primary">
          {listing?.title ?? 'Listing'}
        </p>
        {listing?.brand || listing?.size ? (
          <p className="clamp-1 mt-0.5 text-meta text-text-muted">
            {[listing.brand, listing.size].filter(Boolean).join(' · ')}
          </p>
        ) : null}
        <p className="mt-0.5 flex items-center gap-2">
          <span className="tnum text-body-emphasis font-semibold text-text-primary">
            {formatPrice(listing?.price)}
          </span>
          {listing?.isSold ? <Badge variant="neutral">Sold</Badge> : null}
        </p>
      </div>
      <Icon name="forward" size={16} className="shrink-0 text-text-muted" aria-hidden />
    </div>
  );

  return (
    <div
      className={`group/msg relative ${tight ? 'mt-0.5' : 'mt-1.5'} flex ${
        mine ? 'justify-end' : 'justify-start'
      }`}
    >
      <div className="relative w-full max-w-[300px]">
        {!mine && senderLabel ? (
          <p className="mb-0.5 ml-2 text-meta font-semibold text-text-secondary">
            {senderLabel}
          </p>
        ) : null}
        {href ? (
          <Link
            href={href}
            aria-label={`View listing ${listing?.title ?? ''}`.trim()}
            className="pressable block"
          >
            {tile}
          </Link>
        ) : (
          tile
        )}
        {m.text ? (
          <p className="mt-1 px-1 text-meta text-text-muted">{m.text}</p>
        ) : null}
        {time || mine ? (
          <div className="mt-1 flex items-center justify-end gap-1 px-1 text-text-muted">
            {time ? <span className="tnum text-micro">{time}</span> : null}
            {mine ? <MessageReceipt status={m.readStatus} readClassName="text-brand" /> : null}
          </div>
        ) : null}
        {mine && showSeen ? (
          <p className="mt-0.5 text-right text-meta text-text-muted">Seen</p>
        ) : null}
        <MessageActions mine={mine} onReply={onReply} onReact={onReact} />
      </div>
    </div>
  );
}
