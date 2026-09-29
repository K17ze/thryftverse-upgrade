'use client';

/**
 * AuctionAttentionStrip — the board's personal strip, mirroring mobile's
 * AuctionAttentionStrip: one hairline bar with a left accent, the auction
 * thumb, an honest status line and the continuation action. Rendered only
 * when the viewer has a real state to act on (outbid, won awaiting
 * checkout, leading into the close) — never decorative.
 */

import Link from 'next/link';
import type { AuctionViewModel } from '@/lib/contracts/auction';
import { AppImage } from '@/components/ui/AppImage';
import { formatDuration } from '@/lib/data/fixtures-auctions';
import { formatPrice } from '@/lib/utils/format';

export type AttentionKind = 'outbid' | 'won' | 'leading';

const KIND: Record<
  AttentionKind,
  { label: string; accent: string; text: string; action: string }
> = {
  outbid: {
    label: 'Outbid',
    accent: 'border-l-danger-text',
    text: 'text-danger-text',
    action: 'Bid again',
  },
  won: {
    label: 'Won',
    accent: 'border-l-success-text',
    text: 'text-success-text',
    action: 'Complete order',
  },
  leading: {
    label: 'Leading',
    accent: 'border-l-brand',
    text: 'text-text-primary',
    action: 'View auction',
  },
};

interface AuctionAttentionStripProps {
  kind: AttentionKind;
  auction: AuctionViewModel;
  /** The viewer's top bid — shown on outbid rows. */
  myBid?: number;
}

export function AuctionAttentionStrip({ kind, auction, myBid }: AuctionAttentionStripProps) {
  const k = KIND[kind];
  const message =
    kind === 'outbid'
      ? `Top bid ${formatPrice(auction.currentBid)} · ends in ${formatDuration(auction.msToEnd)}`
      : kind === 'won'
        ? `Hammer ${formatPrice(auction.currentBid)}`
        : `Ends in ${formatDuration(auction.msToEnd)}`;

  return (
    <div
      role="status"
      className={`flex items-center gap-3 rounded-md border border-border-subtle border-l-[3px] ${k.accent} bg-surface p-3`}
    >
      <Link
        href={`/auctions/${auction.id}`}
        aria-label={`${auction.title} — ${k.label}`}
        className="pressable flex min-w-0 flex-1 items-center gap-3"
      >
        <span className="h-11 w-11 shrink-0 overflow-hidden rounded-md bg-surface-alt">
          <AppImage
            src={auction.image}
            alt={auction.title}
            fill
            sizes="44px"
            className="h-full w-full"
          />
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block text-meta font-semibold uppercase tracking-wide ${k.text}`}>
            {k.label}
            {kind === 'outbid' && myBid != null ? (
              <span className="tnum font-normal normal-case tracking-normal text-text-muted">
                {' '}
                · your bid {formatPrice(myBid)}
              </span>
            ) : null}
          </span>
          <span className="clamp-1 block text-body font-medium text-text-primary">
            {auction.title}
          </span>
          <span className="tnum block text-meta text-text-secondary">{message}</span>
        </span>
      </Link>
      <Link
        href={kind === 'outbid' ? `/auctions/${auction.id}#bid` : `/auctions/${auction.id}`}
        className="pressable shrink-0 rounded-full bg-brand px-4 py-2 text-caption font-semibold text-text-inverse hover:bg-brand-pressed"
      >
        {k.action}
      </Link>
    </div>
  );
}
