'use client';

/**
 * AuctionCard — media-first hub tile. Live pulse badge, countdown chip on
 * media, current bid + bid count, window progress hairline, buy-now line
 * and the seller identity. Whole tile navigates via a stretched link.
 */

import Link from 'next/link';
import type {
  AuctionViewModel,
  CountdownUrgency,
  MyBidStatus,
} from '@/lib/contracts/auction';
import { AppImage } from '@/components/ui/AppImage';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import {
  AuctionCountdownChip,
  URGENT_MS,
} from '@/components/auctions/AuctionCountdown';
import { AuctionWatchButton } from '@/components/auctions/AuctionWatchButton';
import { LiveBadge } from '@/components/live/LiveBadge';
import {
  auctionOutcome,
  countdownUrgency,
  formatClock,
  formatDuration,
  isBidWar,
} from '@/lib/data/fixtures-auctions';
import { listingById, userById } from '@/lib/data/fixtures';
import { DATA_MODE } from '@/lib/api/client';
import { formatPrice } from '@/lib/utils/format';

/** "8:30pm" — wall-clock start for scheduled auctions, not a countdown. */
function startTime(iso: string): string {
  return new Date(iso)
    .toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true })
    .replace(/\s/g, '')
    .toLowerCase();
}

/**
 * Card chip grammar — honest urgency only. Live ticks down from the real
 * endsAt ("Ends in 2h 14m"); inside the urgency hour the chip switches
 * to ticking m:ss ("Ends in 34:12") — eBay escalation grammar, not a
 * flattened "Ending soon". The board's shared now-clock re-renders every
 * second, so the digits are real. Scheduled auctions announce a
 * wall-clock start; ended auctions just say so.
 */
export function auctionChipLabel(auction: AuctionViewModel): string {
  if (auction.lifecycle === 'ended') {
    // Honest ended label — a cancelled or reserve-not-met run isn't "ended".
    const outcome = auctionOutcome(auction);
    if (outcome === 'cancelled') return 'Cancelled';
    if (outcome === 'reserve_not_met') return 'Reserve not met';
    return 'Ended';
  }
  if (auction.lifecycle === 'upcoming') return `Starts ${startTime(auction.startsAt)}`;
  return auction.msToEnd < URGENT_MS
    ? `Ends in ${formatClock(auction.msToEnd)}`
    : `Ends in ${formatDuration(auction.msToEnd)}`;
}

/** Tone rides the shared thresholds — under an hour warms to 'soon',
 *  the final five minutes go 'final' (countdownUrgency). */
export function auctionChipUrgency(auction: AuctionViewModel): CountdownUrgency {
  return countdownUrgency(auction);
}

/**
 * The viewer's own bid position on a tile — the same MyBidStatus the
 * attention strip and the results ledger read (one source, no parallel
 * derivation). Renders only when the board carries a real row for the
 * auction: no bid, no badge.
 */
const VIEWER_STATUS_LABEL: Record<MyBidStatus, string> = {
  winning: 'Leading',
  active: 'Bid placed',
  outbid: 'Outbid',
  won: 'You won',
  lost: 'Lost',
};

const VIEWER_CHIP_TONE: Record<MyBidStatus, string> = {
  winning: 'text-success-text',
  active: 'text-scrim-text-primary',
  outbid: 'text-danger-text',
  won: 'text-success-text',
  lost: 'text-danger-text',
};

export function viewerStatusLabel(status: MyBidStatus): string {
  return VIEWER_STATUS_LABEL[status];
}

/** Canvas tone — for contexts reading on the surface, not on media. */
export function viewerStatusTone(status: MyBidStatus): string {
  return status === 'outbid' || status === 'lost'
    ? 'text-danger-text'
    : status === 'active'
      ? 'text-text-secondary'
      : 'text-success-text';
}

/** Scrim chip on media — the countdown chip's grammar, minus the clock. */
export function ViewerBidChip({ status }: { status: MyBidStatus }) {
  return (
    <span className="inline-flex items-center rounded-md bg-overlay px-2.5 py-1 text-meta font-semibold">
      <span className={`drop-scrim ${VIEWER_CHIP_TONE[status]}`}>
        {VIEWER_STATUS_LABEL[status]}
      </span>
    </span>
  );
}

interface AuctionCardProps {
  auction: AuctionViewModel;
  priority?: boolean;
  /** The viewer's bid position from the my-bids board — absent when they
   *  have no bid on this lot, and nothing renders. */
  viewerStatus?: MyBidStatus | null;
}

export function AuctionCard({ auction, priority, viewerStatus }: AuctionCardProps) {
  // Live auctions carry the seller projection on the payload; fixture
  // auctions resolve through USERS. A live seller with no projection
  // renders no seller row rather than a fabricated handle.
  const seller = auction.seller
    ? {
        username: auction.seller.username,
        avatar: auction.seller.avatar,
        isVerified: false,
      }
    : DATA_MODE === 'live'
      ? null
      : userById(auction.sellerId);
  const listing = DATA_MODE === 'live' ? null : listingById(auction.listingId);
  const ratio = listing?.mediaAspectRatio ?? 0.8;
  const label = auctionChipLabel(auction);
  const urgency = auctionChipUrgency(auction);

  return (
    <article className="group relative pressable">
      <div className="relative overflow-hidden rounded-lg bg-surface-alt">
        <AppImage
          src={auction.image}
          alt={auction.title}
          aspectRatio={ratio}
          priority={priority}
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
        />

        {/* Live pulse — the only badge that moves, reduced-motion safe */}
        {auction.lifecycle === 'live' ? (
          <LiveBadge className="absolute left-2 top-2" />
        ) : null}

        {/* Watch — the watchlist's re-entry point, eye glyph on media
            (mobile runway grammar). Sits above the stretched link. */}
        <AuctionWatchButton
          auctionId={auction.id}
          variant="media"
          className="absolute right-0.5 top-0.5 z-[2]"
        />

        {/* Countdown — anchored to the media edge, scrim legible */}
        <div className="absolute bottom-2 left-2">
          <AuctionCountdownChip label={label} urgency={urgency} />
        </div>

        {/* Viewer position — the board's own status, opposite corner */}
        {viewerStatus ? (
          <div className="absolute bottom-2 right-2">
            <ViewerBidChip status={viewerStatus} />
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-1 px-1 pt-2">
        <h3 className="clamp-1 text-body-emphasis text-text-primary">{auction.title}</h3>

        <div className="flex items-baseline justify-between gap-2">
          <span className="tnum text-price-list font-bold text-text-primary">
            {formatPrice(auction.currentBid)}
          </span>
          {/* Bid count — a contested lot (5+ live bids) earns the
              primary tone + fire glyph; the count itself never hides. */}
          <span
            className={`tnum inline-flex items-center gap-1 text-meta ${
              isBidWar(auction)
                ? 'font-semibold text-text-primary'
                : 'text-text-muted'
            }`}
          >
            {isBidWar(auction) ? <Icon name="fire" size={12} /> : null}
            {auction.bidCount} {auction.bidCount === 1 ? 'bid' : 'bids'}
          </span>
        </div>

        {auction.buyNowPrice != null ? (
          <span className="tnum text-meta text-text-secondary">
            Buy now {formatPrice(auction.buyNowPrice)}
          </span>
        ) : null}

        {/* Window progress — brand while live, hairline once settled */}
        <div className="mt-1 h-0.5 w-full overflow-hidden rounded-full bg-surface-alt">
          <div
            className={`h-full rounded-full ${
              auction.lifecycle === 'ended' ? 'bg-border' : 'bg-brand'
            }`}
            style={{ width: `${Math.round(auction.progress * 100)}%` }}
          />
        </div>

        {seller ? (
          <div className="mt-0.5 flex items-center gap-1.5 text-text-secondary">
            <Avatar src={seller.avatar} name={seller.username ?? null} size={20} />
            <span className="clamp-1 text-meta font-medium">@{seller.username}</span>
            {seller.isVerified ? (
              <Icon name="verified" size={11} className="text-commerce-trust" />
            ) : null}
          </div>
        ) : null}
      </div>

      <Link
        href={`/auctions/${auction.id}`}
        className="absolute inset-0 z-[1] rounded-lg"
        aria-label={`${auction.title}, current bid ${formatPrice(auction.currentBid)}, ${label}${
          viewerStatus ? `, ${VIEWER_STATUS_LABEL[viewerStatus].toLowerCase()}` : ''
        }`}
      />
    </article>
  );
}
